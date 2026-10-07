// bcscan — frame-accurate extraction of Batomon Showdown battle state from a screen recording.
//
// Native AVFoundation + CoreGraphics so it runs on a stock macOS with no ffmpeg and no packages.
// Build:  swiftc -O bcscan.swift -o bcscan
//
// Subcommands (run with no arguments for usage):
//   info      video metadata
//   probe     ASCII luminance dump of a rect — for pinning UI geometry by eye
//   palette   most common colours in a rect — for finding badge fill colours
//   findbars  bright 4px column runs in a y-band — locates cooldown bars
//   findtext  white-text column runs in a y-band — locates badge groups
//   overlay   render one frame with every layout box drawn, for verification
//   sheet     contact sheet, one row per frame, for eyeballing an interval
//   learn     harvest glyph bitmaps into glyphs.json + glyphs.png for labelling
//   scan      THE MAIN PASS: every frame -> frames.csv
//
// The design goal is that `scan` runs once and everything downstream is a query against
// frames.csv. Nothing else should need to touch the video.

import AVFoundation
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

// MARK: - Bitmap helpers

struct Bitmap {
    let w: Int
    let h: Int
    var px: [UInt8]  // RGBA

    func rgb(_ x: Int, _ y: Int) -> (Int, Int, Int) {
        let i = (y * w + x) * 4
        return (Int(px[i]), Int(px[i + 1]), Int(px[i + 2]))
    }
    func lum(_ x: Int, _ y: Int) -> Double {
        let (r, g, b) = rgb(x, y)
        return 0.299 * Double(r) + 0.587 * Double(g) + 0.114 * Double(b)
    }
    /// Badge/HP glyph test: near-white and near-neutral. The game draws all readable numbers in
    /// pure white, so this is a far more stable key than any per-badge fill colour.
    func isGlyph(_ x: Int, _ y: Int) -> Bool {
        let (r, g, b) = rgb(x, y)
        let mx = max(r, max(g, b)), mn = min(r, min(g, b))
        return mn >= 225 && (mx - mn) <= 26
    }
    /// HP-bar fill green (#00C100 body, #34EE3D highlight). Deliberately narrow so it cannot
    /// match the grass background (#ABD761), which is far less saturated.
    func isHealthGreen(_ x: Int, _ y: Int) -> Bool {
        let (r, g, b) = rgb(x, y)
        return g >= 140 && r <= 110 && b <= 110
    }
}

final class Video {
    let asset: AVURLAsset
    let gen: AVAssetImageGenerator
    var size: CGSize = .zero
    var fps: Double = 0
    var duration: Double = 0

    init(_ path: String) {
        asset = AVURLAsset(url: URL(fileURLWithPath: path))
        gen = AVAssetImageGenerator(asset: asset)
        gen.appliesPreferredTrackTransform = true
        gen.requestedTimeToleranceBefore = .zero
        gen.requestedTimeToleranceAfter = .zero
        let sem = DispatchSemaphore(value: 0)
        Task {
            if let d = try? await asset.load(.duration) { duration = CMTimeGetSeconds(d) }
            if let tracks = try? await asset.loadTracks(withMediaType: .video), let t = tracks.first {
                if let s = try? await t.load(.naturalSize) { size = s }
                if let f = try? await t.load(.nominalFrameRate) { fps = Double(f) }
            }
            sem.signal()
        }
        sem.wait()
    }

    func cgImage(at t: Double) -> CGImage? {
        let sem = DispatchSemaphore(value: 0)
        var out: CGImage? = nil
        gen.generateCGImageAsynchronously(for: CMTime(seconds: t, preferredTimescale: 1_000_000)) { img, _, _ in
            out = img; sem.signal()
        }
        sem.wait()
        return out
    }

    /// Whole frame as RGBA. Cropping per-rect from the CGImage is slower than one draw plus
    /// in-memory indexing, and `scan` touches a dozen rects per frame.
    func bitmap(at t: Double) -> Bitmap? {
        guard let cg = cgImage(at: t) else { return nil }
        let w = cg.width, h = cg.height
        var px = [UInt8](repeating: 0, count: w * h * 4)
        guard let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8,
                                  bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        return Bitmap(w: w, h: h, px: px)
    }
}

func writePNG(_ image: CGImage, to path: String) {
    guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL,
                                                     UTType.png.identifier as CFString, 1, nil) else { return }
    CGImageDestinationAddImage(dest, image, nil)
    CGImageDestinationFinalize(dest)
}

// MARK: - Layout

struct Rect: Codable {
    var x: Int; var y: Int; var w: Int; var h: Int
    /// Minimum number of glyph-coloured pixels a column must contain to count as part of a glyph.
    /// Badge bands sit on plain backgrounds and work at 1. The HP bands are drawn over the health
    /// bar, whose white highlight would otherwise merge every column into one unreadable run, so
    /// they raise this until only the tall digit strokes qualify.
    var minCol: Int?
}

struct SlotLayout: Codable {
    var id: String
    var side: String       // "ally" | "enemy"
    var row: String        // "front" | "back"
    var col: Int
    var bar: Rect          // cooldown bar track; h == full cooldown
    var badges: Rect       // band containing that slot's stat badges
}

struct Layout: Codable {
    var name: String
    var frameWidth: Int
    var frameHeight: Int
    var fps: Double
    var slots: [SlotLayout]
    /// Health bars, keyed "ally" / "enemy". Measured as the green/grey boundary rather than by
    /// reading the HP text: the text is drawn *over* the bar in white, so OCR there is fragile,
    /// whereas the boundary is a clean monotonic signal at ~0.16% resolution.
    var hpBars: [String: Rect]
}

// MARK: - Glyphs

/// A glyph is stored as its white-pixel mask resampled to a fixed grid, which makes matching
/// insensitive to the 1px bounding-box jitter that video compression introduces.
let GW = 10, GH = 14

struct GlyphTemplate: Codable {
    var label: String        // "" until a human/agent labels it
    var mask: String         // GW*GH of "0"/"1"
    var count: Int           // how many times harvested, so rare = probably noise
    var sampleWidth: Int
    var sampleHeight: Int
}

struct GlyphSet: Codable {
    var note: String
    var templates: [GlyphTemplate]
}

func resample(_ cells: [Bool], _ w: Int, _ h: Int) -> [Bool] {
    var out = [Bool](repeating: false, count: GW * GH)
    guard w > 0 && h > 0 else { return out }
    for gy in 0..<GH {
        for gx in 0..<GW {
            // area-average the source block, so thin strokes survive downsampling
            let x0 = gx * w / GW, x1 = max(x0 + 1, (gx + 1) * w / GW)
            let y0 = gy * h / GH, y1 = max(y0 + 1, (gy + 1) * h / GH)
            var on = 0, total = 0
            for y in y0..<min(y1, h) {
                for x in x0..<min(x1, w) {
                    total += 1
                    if cells[y * w + x] { on += 1 }
                }
            }
            out[gy * GW + gx] = total > 0 && on * 2 >= total
        }
    }
    return out
}

func maskString(_ m: [Bool]) -> String { m.map { $0 ? "1" : "0" }.joined() }
func maskBools(_ s: String) -> [Bool] { s.map { $0 == "1" } }

// MARK: - Segmentation

struct GlyphBox { var x0: Int; var x1: Int; var y0: Int; var y1: Int; var cells: [Bool] }

/// Column runs of glyph-coloured pixels inside `r`, split into individual glyphs.
func glyphBoxes(_ bm: Bitmap, _ r: Rect) -> [GlyphBox] {
    let x0 = max(0, r.x), y0 = max(0, r.y)
    let x1 = min(bm.w, r.x + r.w), y1 = min(bm.h, r.y + r.h)
    guard x1 > x0, y1 > y0 else { return [] }

    let minCol = max(1, r.minCol ?? 1)
    var colHas = [Bool](repeating: false, count: x1 - x0)
    for x in x0..<x1 {
        var n = 0
        for y in y0..<y1 where bm.isGlyph(x, y) { n += 1 }
        colHas[x - x0] = n >= minCol
    }

    // group contiguous columns into glyph candidates
    var boxes: [GlyphBox] = []
    var start = -1
    for i in 0...(x1 - x0) {
        let on = i < (x1 - x0) && colHas[i]
        if on && start < 0 { start = i }
        if !on && start >= 0 {
            let gx0 = x0 + start, gx1 = x0 + i - 1
            // vertical extent
            var gy0 = y1, gy1 = y0 - 1
            for y in y0..<y1 {
                for x in gx0...gx1 where bm.isGlyph(x, y) {
                    gy0 = min(gy0, y); gy1 = max(gy1, y); break
                }
            }
            if gy1 >= gy0 {
                let w = gx1 - gx0 + 1, h = gy1 - gy0 + 1
                if w >= 2 && h >= 6 && w <= 40 && h <= 40 {
                    var cells = [Bool](repeating: false, count: w * h)
                    for y in gy0...gy1 {
                        for x in gx0...gx1 { cells[(y - gy0) * w + (x - gx0)] = bm.isGlyph(x, y) }
                    }
                    boxes.append(GlyphBox(x0: gx0, x1: gx1, y0: gy0, y1: gy1, cells: cells))
                }
            }
            start = -1
        }
    }
    return boxes
}

/// Split glyph boxes into badge groups. Within a badge, digits sit ~2-5px apart; between badges
/// there is a gap of 10px or more. Returns groups in left-to-right order.
func groupIntoBadges(_ boxes: [GlyphBox], gap: Int = 10) -> [[GlyphBox]] {
    guard !boxes.isEmpty else { return [] }
    var groups: [[GlyphBox]] = [[boxes[0]]]
    for b in boxes.dropFirst() {
        if b.x0 - groups[groups.count - 1].last!.x1 > gap { groups.append([b]) }
        else { groups[groups.count - 1].append(b) }
    }
    return groups
}

// MARK: - Matching

final class Matcher {
    private var labels: [String] = []
    private var masks: [[Bool]] = []

    init(_ set: GlyphSet) {
        for t in set.templates where !t.label.isEmpty {
            labels.append(t.label)
            masks.append(maskBools(t.mask))
        }
    }
    var isEmpty: Bool { labels.isEmpty }

    /// Nearest neighbour by Hamming distance, rejected when ambiguous or simply far from everything.
    func match(_ cells: [Bool], _ w: Int, _ h: Int) -> String? {
        let q = resample(cells, w, h)
        var best = Int.max, bestIdx = -1, second = Int.max
        for (i, m) in masks.enumerated() {
            var d = 0
            for k in 0..<(GW * GH) where m[k] != q[k] { d += 1 }
            if d < best { second = best; best = d; bestIdx = i }
            else if d < second { second = d }
        }
        guard bestIdx >= 0, best <= 20, second - best >= 2 || best <= 4 else { return nil }
        return labels[bestIdx]
    }

    /// A badge group -> its text, or nil if any glyph failed. Partial reads are worse than
    /// no read: "47" misread from "417" is a silent wrong number in the dataset.
    func read(_ group: [GlyphBox]) -> String? {
        var s = ""
        for g in group {
            guard let c = match(g.cells, g.x1 - g.x0 + 1, g.y1 - g.y0 + 1) else { return nil }
            s += c
        }
        return s.isEmpty ? nil : s
    }
}

// MARK: - Shared argument plumbing

func die(_ msg: String) -> Never { FileHandle.standardError.write((msg + "\n").data(using: .utf8)!); exit(1) }

func loadLayout(_ path: String) -> Layout {
    guard let d = FileManager.default.contents(atPath: path) else { die("cannot read layout: \(path)") }
    guard let l = try? JSONDecoder().decode(Layout.self, from: d) else { die("cannot parse layout: \(path)") }
    return l
}

func loadGlyphs(_ path: String) -> GlyphSet {
    guard let d = FileManager.default.contents(atPath: path) else { die("cannot read glyphs: \(path)") }
    guard let g = try? JSONDecoder().decode(GlyphSet.self, from: d) else { die("cannot parse glyphs: \(path)") }
    return g
}

let args = CommandLine.arguments
guard args.count >= 2 else {
    print("""
    bcscan — Batomon battle recording extractor

      bcscan info     <video>
      bcscan probe    <video> <t> <x> <y> <w> <h>
      bcscan palette  <video> <t> <x> <y> <w> <h>
      bcscan findbars <video> <t> <x0> <x1> <yTop> <yBot>
      bcscan findtext <video> <t> <x0> <x1> <yTop> <yBot> [minCol]
      bcscan overlay  <video> <layout.json> <t> <out.png>
      bcscan sheet    <video> <layout.json> <out.png> <t0> <nframes> <stride>
      bcscan learn    <video> <layout.json> <out-dir> <t0> <t1> <stride>
      bcscan scan     <video> <layout.json> <glyphs.json> <out.csv> <t0> <t1>
    """)
    exit(0)
}
let cmd = args[1]

switch cmd {

// MARK: info
case "info":
    let v = Video(args[2])
    print("duration_seconds=\(v.duration)")
    print("frame_width=\(Int(v.size.width))")
    print("frame_height=\(Int(v.size.height))")
    print("nominal_fps=\(v.fps)")
    print("frame_ms=\(1000.0 / max(v.fps, 1))")

// MARK: probe
case "probe":
    let v = Video(args[2])
    let t = Double(args[3])!, rx = Int(args[4])!, ry = Int(args[5])!, rw = Int(args[6])!, rh = Int(args[7])!
    guard let bm = v.bitmap(at: t) else { die("no frame at \(t)") }
    let ramp = Array(" .:-=+*#%@")
    print("t=\(t) rect=\(rx),\(ry) \(rw)x\(rh)")
    for y in ry..<min(ry + rh, bm.h) {
        var line = String(format: "%5d ", y)
        for x in rx..<min(rx + rw, bm.w) { line.append(ramp[min(9, Int(bm.lum(x, y) / 25.6))]) }
        print(line)
    }

// MARK: palette
case "palette":
    let v = Video(args[2])
    let t = Double(args[3])!, rx = Int(args[4])!, ry = Int(args[5])!, rw = Int(args[6])!, rh = Int(args[7])!
    guard let bm = v.bitmap(at: t) else { die("no frame at \(t)") }
    var counts: [String: Int] = [:]
    for y in ry..<min(ry + rh, bm.h) {
        for x in rx..<min(rx + rw, bm.w) {
            let (r, g, b) = bm.rgb(x, y)
            counts[String(format: "%02X%02X%02X", r, g, b), default: 0] += 1
        }
    }
    for (k, n) in counts.sorted(by: { $0.value > $1.value }).prefix(24) { print("#\(k) \(n)") }

// MARK: findbars
case "findbars":
    let v = Video(args[2])
    let t = Double(args[3])!, x0 = Int(args[4])!, x1 = Int(args[5])!, yTop = Int(args[6])!, yBot = Int(args[7])!
    guard let bm = v.bitmap(at: t) else { die("no frame at \(t)") }
    var runs: [String] = []
    var start = -1
    for x in x0...x1 {
        // a cooldown bar is bright at the bottom of its track for any non-zero progress
        var bright = false
        for dy in 0..<6 where bm.lum(x, yBot - dy) > 195 { bright = true; break }
        if bright && start < 0 { start = x }
        if !bright && start >= 0 { runs.append("\(start)-\(x - 1)"); start = -1 }
    }
    if start >= 0 { runs.append("\(start)-\(x1)") }
    print("t=\(t) y=\(yTop)..\(yBot) bright column runs: " + runs.joined(separator: ", "))
    print("(cooldown bars are the runs ~4px wide that repeat at a constant pitch)")

// MARK: findtext
case "findtext":
    let v = Video(args[2])
    let t = Double(args[3])!, x0 = Int(args[4])!, x1 = Int(args[5])!, yTop = Int(args[6])!, yBot = Int(args[7])!
    let minCol = args.count > 8 ? Int(args[8]) : nil
    guard let bm = v.bitmap(at: t) else { die("no frame at \(t)") }
    let boxes = glyphBoxes(bm, Rect(x: x0, y: yTop, w: x1 - x0 + 1, h: yBot - yTop + 1, minCol: minCol))
    for (i, grp) in groupIntoBadges(boxes).enumerated() {
        let gx0 = grp.first!.x0, gx1 = grp.last!.x1
        let gy0 = grp.map { $0.y0 }.min()!, gy1 = grp.map { $0.y1 }.max()!
        print("group \(i): x=\(gx0)..\(gx1) y=\(gy0)..\(gy1) glyphs=\(grp.count)")
    }

// MARK: overlay
case "overlay":
    let v = Video(args[2])
    let layout = loadLayout(args[3])
    let t = Double(args[4])!
    guard let cg = v.cgImage(at: t) else { die("no frame at \(t)") }
    guard let ctx = CGContext(data: nil, width: cg.width, height: cg.height, bitsPerComponent: 8,
                              bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { die("ctx") }
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
    ctx.setLineWidth(2)
    func stroke(_ r: Rect, _ c: CGColor) {
        ctx.setStrokeColor(c)
        // layout y is measured from the TOP of the frame; CGContext origin is bottom-left
        ctx.stroke(CGRect(x: r.x, y: cg.height - r.y - r.h, width: r.w, height: r.h))
    }
    for s in layout.slots {
        stroke(s.bar, CGColor(red: 1, green: 0.2, blue: 0.2, alpha: 1))
        stroke(s.badges, CGColor(red: 0.2, green: 0.6, blue: 1, alpha: 1))
    }
    for (_, r) in layout.hp { stroke(r, CGColor(red: 1, green: 0.9, blue: 0.1, alpha: 1)) }
    guard let out = ctx.makeImage() else { die("image") }
    writePNG(out, to: args[5])
    print("wrote \(args[5]) — red = cooldown bars, blue = badge bands, yellow = HP")

// MARK: sheet
case "sheet":
    let v = Video(args[2])
    let layout = loadLayout(args[3])
    let outPath = args[4]
    let t0 = Double(args[5])!, n = Int(args[6])!
    let stride = Double(args[7])!
    let cells = layout.slots.map { $0.badges }
    let rowW = cells.reduce(0) { $0 + $1.w }, rowH = cells.map { $0.h }.max() ?? 1
    let zoom = 2
    guard let ctx = CGContext(data: nil, width: rowW * zoom, height: rowH * n * zoom, bitsPerComponent: 8,
                              bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { die("ctx") }
    ctx.interpolationQuality = .none
    for i in 0..<n {
        guard let cg = v.cgImage(at: t0 + Double(i) * stride) else { continue }
        var xOff = 0
        for c in cells {
            if let sub = cg.cropping(to: CGRect(x: c.x, y: c.y, width: c.w, height: c.h)) {
                ctx.draw(sub, in: CGRect(x: xOff * zoom, y: (rowH * (n - i - 1)) * zoom,
                                         width: c.w * zoom, height: c.h * zoom))
            }
            xOff += c.w
        }
    }
    guard let out = ctx.makeImage() else { die("image") }
    writePNG(out, to: outPath)
    print("cols: " + layout.slots.map { $0.id }.joined(separator: " | "))
    for i in 0..<n { print(String(format: "row %02d t=%.4f", i + 1, t0 + Double(i) * stride)) }

// MARK: learn
case "learn":
    let v = Video(args[2])
    let layout = loadLayout(args[3])
    let outDir = args[4]
    let t0 = Double(args[5])!, t1 = Double(args[6])!, stride = Double(args[7])!
    var bank: [String: GlyphTemplate] = [:]
    var bankCells: [String: (cells: [Bool], w: Int, h: Int)] = [:]
    var bands = layout.slots.map { $0.badges }
    bands.append(contentsOf: layout.hp.values)

    var t = t0
    while t <= t1 {
        if let bm = v.bitmap(at: t) {
            for band in bands {
                for g in glyphBoxes(bm, band) {
                    let w = g.x1 - g.x0 + 1, h = g.y1 - g.y0 + 1
                    let key = maskString(resample(g.cells, w, h))
                    if var e = bank[key] { e.count += 1; bank[key] = e }
                    else {
                        bank[key] = GlyphTemplate(label: "", mask: key, count: 1, sampleWidth: w, sampleHeight: h)
                        bankCells[key] = (g.cells, w, h)
                    }
                }
            }
        }
        t += stride
    }

    // Order by frequency: the real digits dominate, compression artefacts sit in the tail.
    let ordered = bank.values.sorted { $0.count > $1.count }
    let set = GlyphSet(note: "Label each template with the character it shows, in the order they appear in glyphs.png (left to right, top to bottom). Leave noise entries blank.", templates: ordered)
    let enc = JSONEncoder(); enc.outputFormatting = [.prettyPrinted]
    try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
    try? enc.encode(set).write(to: URL(fileURLWithPath: outDir + "/glyphs.json"))

    // Contact sheet of the actual pixels, at 6x, 12 per row, in the same order as the JSON.
    let cellW = 44, cellH = 52, perRow = 12
    let rows = (ordered.count + perRow - 1) / perRow
    if rows > 0, let ctx = CGContext(data: nil, width: cellW * perRow, height: cellH * rows, bitsPerComponent: 8,
                                     bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                     bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
        ctx.setFillColor(CGColor(red: 0.12, green: 0.12, blue: 0.16, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: cellW * perRow, height: cellH * rows))
        ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        for (i, tpl) in ordered.enumerated() {
            guard let src = bankCells[tpl.mask] else { continue }
            let cx = (i % perRow) * cellW + 4
            let cy = cellH * rows - ((i / perRow) + 1) * cellH + 4
            let scale = max(1, min((cellW - 8) / max(src.w, 1), (cellH - 8) / max(src.h, 1)))
            for y in 0..<src.h {
                for x in 0..<src.w where src.cells[y * src.w + x] {
                    ctx.fill(CGRect(x: cx + x * scale, y: cy + (src.h - 1 - y) * scale,
                                    width: scale, height: scale))
                }
            }
        }
        if let img = ctx.makeImage() { writePNG(img, to: outDir + "/glyphs.png") }
    }
    print("harvested \(ordered.count) distinct glyph shapes from \(Int((t1 - t0) / stride) + 1) frames")
    print("wrote \(outDir)/glyphs.json and \(outDir)/glyphs.png")
    print("next: read glyphs.png and fill in each template's \"label\" in glyphs.json, in order")

// MARK: scan
case "scan":
    let v = Video(args[2])
    let layout = loadLayout(args[3])
    let matcher = Matcher(loadGlyphs(args[4]))
    if matcher.isEmpty { die("glyphs.json has no labelled templates — run `learn` and label them first") }
    let outPath = args[5]
    let t0 = Double(args[6])!, t1 = Double(args[7])!
    let fps = layout.fps > 0 ? layout.fps : (v.fps > 0 ? v.fps : 60)

    // One column per measurement. Badges are positional: b0 is the leftmost badge under that mon,
    // b1 the next, and so on. Which stat each position holds is stable for a given creature, and
    // is resolved downstream in events.py rather than guessed here.
    var header = ["t", "frame"]
    for s in layout.slots {
        header.append("\(s.id)_cd")
        for i in 0..<4 { header.append("\(s.id)_b\(i)") }
    }
    for k in layout.hp.keys.sorted() { header.append("hp_\(k)") }

    var lines = [header.joined(separator: ",")]
    var frame = 0
    while true {
        let t = t0 + Double(frame) / fps
        if t > t1 { break }
        defer { frame += 1 }
        guard let bm = v.bitmap(at: t) else { continue }
        var row = [String(format: "%.4f", t), String(frame)]

        for s in layout.slots {
            // cooldown bar: count filled rows, bottom-up. Normalised so bar.h == full cooldown.
            var filled = 0
            let need = max(2, s.bar.w / 2)
            for dy in 0..<s.bar.h {
                let y = s.bar.y + dy
                guard y >= 0 && y < bm.h else { continue }
                var n = 0
                for x in s.bar.x..<min(s.bar.x + s.bar.w, bm.w) where bm.lum(x, y) > 195 { n += 1 }
                if n >= need { filled += 1 }
            }
            row.append(String(filled))

            let groups = groupIntoBadges(glyphBoxes(bm, s.badges))
            for i in 0..<4 {
                row.append(i < groups.count ? (matcher.read(groups[i]) ?? "") : "")
            }
        }

        for k in layout.hp.keys.sorted() {
            // HP renders as "current/max". Concatenate every group so the slash survives into the
            // dataset; splitting it is events.py's job, not the scanner's.
            let groups = groupIntoBadges(glyphBoxes(bm, layout.hp[k]!), gap: 8)
            let parts = groups.map { matcher.read($0) ?? "?" }
            let joined = parts.joined()
            row.append(joined.contains("?") ? "" : joined)
        }

        lines.append(row.joined(separator: ","))
    }
    try? (lines.joined(separator: "\n") + "\n").write(toFile: outPath, atomically: true, encoding: .utf8)
    print("wrote \(outPath) — \(lines.count - 1) frames x \(header.count) columns")

default:
    die("unknown subcommand: \(cmd)")
}
