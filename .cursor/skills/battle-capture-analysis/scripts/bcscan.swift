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

/// The game draws numbers in a fixed-pitch pixel font, so glyphs arrive at a consistent size and
/// the only variation is edge noise from video compression. Rather than resample (which destroys
/// thin strokes), each glyph is centred into a fixed canvas at native resolution and compared by
/// Hamming distance. That tolerates the 1px bounding-box jitter without blurring the shape.
let GW = 18, GH = 26

struct GlyphTemplate: Codable {
    var label: String        // "" until a human/agent labels it
    var mask: String         // GW*GH of "0"/"1"
    var count: Int           // how many times harvested; rare entries are usually noise
    var sampleWidth: Int
    var sampleHeight: Int
}

struct GlyphSet: Codable {
    var note: String
    /// Horizontal advance between consecutive characters, in capture pixels.
    ///
    /// Non-integer on purpose. The recording is an upscale of the game's native framebuffer, so
    /// a font that advances by a whole number of game pixels advances by a fraction of a capture
    /// pixel. Treating this as an integer makes the slice grid drift by a pixel per character and
    /// shreds every number longer than three digits.
    var advance: Double
    /// Ink width of a single character, used to turn a run's ink width into a character count.
    var inkWidth: Int
    var templates: [GlyphTemplate]
}

/// Place `cells` into the fixed canvas, anchored top-left. Anchoring rather than centring matters:
/// the same digit arrives 10px or 11px wide depending on sub-pixel placement, and centring those
/// two offsets them by half a pixel each way, which splits one character into several templates.
/// Top-left anchoring leaves them differing only at the trailing edge.
/// Oversized input is cropped rather than scaled, so a mis-segmented blob degrades into a
/// non-match instead of a plausible wrong digit.
func canonical(_ cells: [Bool], _ w: Int, _ h: Int) -> [Bool] {
    var out = [Bool](repeating: false, count: GW * GH)
    guard w > 0, h > 0 else { return out }
    for y in 0..<min(h, GH) {
        for x in 0..<min(w, GW) where cells[y * w + x] {
            out[y * GW + x] = true
        }
    }
    return out
}

func maskString(_ m: [Bool]) -> String { m.map { $0 ? "1" : "0" }.joined() }
func maskBools(_ s: String) -> [Bool] { s.map { $0 == "1" } }

func hamming(_ a: [Bool], _ b: [Bool]) -> Int {
    var d = 0
    for i in 0..<min(a.count, b.count) where a[i] != b[i] { d += 1 }
    return d
}

/// `b` shifted horizontally by `dx` within the canvas.
func shifted(_ b: [Bool], _ dx: Int) -> [Bool] {
    if dx == 0 { return b }
    var out = [Bool](repeating: false, count: GW * GH)
    for y in 0..<GH {
        for x in 0..<GW where b[y * GW + x] {
            let tx = x + dx
            if tx >= 0 && tx < GW { out[y * GW + tx] = true }
        }
    }
    return out
}

/// Hamming distance minimised over small horizontal offsets.
///
/// Needed because a fixed-pitch cell is sliced from the run's *ink* left edge, and how far into
/// its cell a character's ink begins depends on the character ("1" is inset, "0" is not). Rather
/// than try to recover the true grid phase, absorb it here: real characters stay far apart even
/// under shifting, so this costs nothing in discrimination.
func alignedDistance(_ a: [Bool], _ b: [Bool], maxShift: Int = 3) -> Int {
    var best = Int.max
    for dx in -maxShift...maxShift { best = min(best, hamming(a, shifted(b, dx))) }
    return best
}

/// Distance below which two observations are the same character. Tuned against this font: real
/// digit pairs sit 30+ apart, while compression variants of one digit sit under 10.
let GLYPH_MERGE_DISTANCE = 10
let GLYPH_MATCH_DISTANCE = 16

// MARK: - Segmentation

/// One badge's run of white text: the ink bounding box, plus the ink mask over that box.
struct TextRun {
    var x0: Int; var x1: Int; var y0: Int; var y1: Int
    var cells: [Bool]
    var w: Int { x1 - x0 + 1 }
    var h: Int { y1 - y0 + 1 }
}

/// Badge text runs inside `r`, left to right. A run is a span of ink columns separated from its
/// neighbours by at least `gap` blank columns; badges sit ~12px+ apart while the digits inside one
/// badge touch or nearly touch.
func textRuns(_ bm: Bitmap, _ r: Rect, gap: Int = 10) -> [TextRun] {
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

    var spans: [(Int, Int)] = []
    var start = -1, lastOn = -1
    for i in 0..<(x1 - x0) {
        if colHas[i] {
            if start < 0 { start = i }
            else if i - lastOn > gap { spans.append((start, lastOn)); start = i }
            lastOn = i
        }
    }
    if start >= 0 { spans.append((start, lastOn)) }

    return spans.compactMap { (s, e) in
        let gx0 = x0 + s, gx1 = x0 + e
        var gy0 = y1, gy1 = y0 - 1
        for y in y0..<y1 {
            for x in gx0...gx1 where bm.isGlyph(x, y) { gy0 = min(gy0, y); gy1 = max(gy1, y); break }
        }
        guard gy1 >= gy0, gy1 - gy0 + 1 >= 6, gy1 - gy0 + 1 <= 44 else { return nil }
        let w = gx1 - gx0 + 1, h = gy1 - gy0 + 1
        var cells = [Bool](repeating: false, count: w * h)
        for y in gy0...gy1 {
            for x in gx0...gx1 { cells[(y - gy0) * w + (x - gx0)] = bm.isGlyph(x, y) }
        }
        return TextRun(x0: gx0, x1: gx1, y0: gy0, y1: gy1, cells: cells)
    }
}

// MARK: - Badge typing

/// Badge kinds, keyed by the hue of the badge's fill.
///
/// Positional indexing ("the first badge under this mon") is not safe on its own: a VFX flash over
/// the board adds a spurious text run and silently shifts every later badge by one, which turns a
/// Damage value into a Poison value in the dataset. The fill colour is intrinsic to the stat, so
/// it survives that.
///
/// Measured fills: Damage #C22D53 (hue ~345), Poison #8466C6 (hue ~259), Heal/Multicast #0A5B77
/// (hue ~195). Heal and Multicast share a colour, so Multicast is identified by its "X" prefix.
func badgeKind(_ bm: Bitmap, _ run: TextRun, text: String?) -> String {
    if let t = text, t.hasPrefix("X") { return "mult" }

    var hueVotes: [String: Int] = [:]
    let x0 = max(0, run.x0 - 2), x1 = min(bm.w - 1, run.x1 + 2)
    let y0 = max(0, run.y0 - 8), y1 = min(bm.h - 1, run.y1 + 8)
    guard x1 >= x0, y1 >= y0 else { return "other" }

    for y in y0...y1 {
        for x in x0...x1 {
            let (ri, gi, bi) = bm.rgb(x, y)
            let r = Double(ri) / 255, g = Double(gi) / 255, b = Double(bi) / 255
            let mx = max(r, max(g, b)), mn = min(r, min(g, b))
            let delta = mx - mn
            guard mx >= 0.3, delta >= 0.3 else { continue }   // skip white text and dark outline
            var hue: Double
            if mx == r { hue = 60 * (((g - b) / delta).truncatingRemainder(dividingBy: 6)) }
            else if mx == g { hue = 60 * (2 + (b - r) / delta) }
            else { hue = 60 * (4 + (r - g) / delta) }
            if hue < 0 { hue += 360 }

            let kind: String
            switch hue {
            case 320...360, 0..<15: kind = "dmg"
            case 240..<300:         kind = "poison"
            case 170..<230:         kind = "heal"
            case 15..<45:           kind = "burn"
            case 45..<100:          continue              // grass background
            default:                kind = "other"
            }
            hueVotes[kind, default: 0] += 1
        }
    }
    return hueVotes.max(by: { $0.value < $1.value })?.key ?? "other"
}

let BADGE_KINDS = ["dmg", "poison", "heal", "mult", "burn", "other"]

/// Ink column runs within a single text run, used during calibration to measure the font advance.
func inkColumns(_ run: TextRun) -> [(Int, Int)] {
    var colHas = [Bool](repeating: false, count: run.w)
    for x in 0..<run.w {
        for y in 0..<run.h where run.cells[y * run.w + x] { colHas[x] = true; break }
    }
    var spans: [(Int, Int)] = []
    var start = -1
    for i in 0...run.w {
        let on = i < run.w && colHas[i]
        if on && start < 0 { start = i }
        if !on && start >= 0 { spans.append((start, i - 1)); start = -1 }
    }
    return spans
}

/// How many characters a run holds. A run's ink width is `(n-1) * advance + inkWidth`, because the
/// blank columns inside the first and last cells are not part of the ink.
func charCount(_ run: TextRun, advance: Double, inkWidth: Int) -> Int {
    guard advance > 0 else { return 0 }
    return max(1, Int(((Double(run.w - inkWidth) / advance) + 1).rounded()))
}

/// Slice a run into character cells on the font's advance grid.
///
/// This is the key to stable recognition. Segmenting characters by their own ink gives a bounding
/// box that shifts depending on which stroke happens to be leftmost, which splits one digit into
/// dozens of near-identical templates. Slicing by *position* instead puts every instance of a
/// character into the same cell window.
func sliceCells(_ run: TextRun, advance: Double, inkWidth: Int) -> [[Bool]] {
    let n = charCount(run, advance: advance, inkWidth: inkWidth)
    let cellW = min(GW, Int(advance.rounded(.up)))
    var out: [[Bool]] = []
    for k in 0..<n {
        var cell = [Bool](repeating: false, count: GW * GH)
        let off = Int((Double(k) * advance).rounded())
        for y in 0..<min(run.h, GH) {
            for dx in 0..<cellW {
                let sx = off + dx
                guard sx >= 0, sx < run.w else { continue }
                if run.cells[y * run.w + sx] { cell[y * GW + dx] = true }
            }
        }
        out.append(cell)
    }
    return out
}

// MARK: - Matching

final class Matcher {
    private var labels: [String] = []
    private var masks: [[Bool]] = []
    let advance: Double
    let inkWidth: Int

    init(_ set: GlyphSet) {
        advance = set.advance
        inkWidth = set.inkWidth
        for t in set.templates where !t.label.isEmpty {
            labels.append(t.label)
            masks.append(maskBools(t.mask))
        }
    }
    var isEmpty: Bool { labels.isEmpty }

    /// Nearest neighbour by Hamming distance. Rejected when far from everything, or when the two
    /// closest candidates carry different labels and are close enough that picking one would be a
    /// coin flip.
    func match(_ cell: [Bool]) -> String? {
        var best = Int.max, bestIdx = -1, secondDifferent = Int.max
        for (i, m) in masks.enumerated() {
            let d = alignedDistance(m, cell)
            if d < best { best = d; bestIdx = i }
        }
        guard bestIdx >= 0, best <= GLYPH_MATCH_DISTANCE else { return nil }
        let bestLabel = labels[bestIdx]
        for (i, m) in masks.enumerated() where labels[i] != bestLabel {
            secondDifferent = min(secondDifferent, alignedDistance(m, cell))
        }
        guard secondDifferent - best >= 4 else { return nil }
        return bestLabel
    }

    /// A badge run -> its text, or nil if any character failed. A partial read is worse than no
    /// read: "47" recovered from "417" is a silently wrong number in the dataset.
    func read(_ run: TextRun) -> String? {
        var s = ""
        for cell in sliceCells(run, advance: advance, inkWidth: inkWidth) {
            guard let c = match(cell) else { return nil }
            s += c
        }
        return s.isEmpty ? nil : s
    }
}

// MARK: - Shared argument plumbing

func die(_ msg: String) -> Never { FileHandle.standardError.write((msg + "\n").data(using: .utf8)!); exit(1) }

/// Write text, creating the parent directory and failing loudly. An earlier version used
/// `try?` and silently produced nothing when the output directory did not exist.
func writeText(_ text: String, to path: String) {
    let url = URL(fileURLWithPath: path)
    let dir = url.deletingLastPathComponent()
    if !dir.path.isEmpty {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }
    do { try text.write(to: url, atomically: true, encoding: .utf8) }
    catch { die("cannot write \(path): \(error.localizedDescription)") }
}

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
      bcscan glyphdump <glyphs.json> [limit] [cols]
      bcscan label     <glyphs.json> <idx:char,idx:char,...>
      bcscan autolabel <video> <layout.json> <glyphs.json> <truth.csv>
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
    let runs = textRuns(bm, Rect(x: x0, y: yTop, w: x1 - x0 + 1, h: yBot - yTop + 1, minCol: minCol))
    for (i, r) in runs.enumerated() {
        print("run \(i): x=\(r.x0)..\(r.x1) (w=\(r.w)) y=\(r.y0)..\(r.y1) (h=\(r.h))")
    }
    print("(a 1-character run's width is the font pitch; wider runs are that many characters)")

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
    for (_, r) in layout.hpBars { stroke(r, CGColor(red: 1, green: 0.9, blue: 0.1, alpha: 1)) }
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
    let bands = layout.slots.map { $0.badges }

    // Pass 1: collect every badge text run, and learn the font's pitch.
    //
    // Pitch is derived from single-character runs (the many 1-digit Poison badges on this board),
    // whose ink width is one character. Taking the modal width of *all* runs would land on
    // whatever digit-count happens to be most common instead.
    var allRuns: [TextRun] = []
    var singleWidths: [Int: Int] = [:]
    var heights: [Int: Int] = [:]
    var t = t0
    while t <= t1 {
        if let bm = v.bitmap(at: t) {
            for band in bands {
                for run in textRuns(bm, band) {
                    allRuns.append(run)
                    heights[run.h, default: 0] += 1
                    if run.w <= 14 { singleWidths[run.w, default: 0] += 1 }
                }
            }
        }
        t += stride
    }
    let inkWidth = singleWidths.max(by: { $0.value < $1.value })?.key ?? 11
    let modalHeight = heights.max(by: { $0.value < $1.value })?.key ?? 18

    // The advance is the step between consecutive characters' ink, averaged over every multi-digit
    // run where the characters do not touch. Averaging (rather than taking a mode) is what recovers
    // the fractional value the upscaled capture introduces.
    var steps: [Double] = []
    for run in allRuns where abs(run.h - modalHeight) <= 1 {
        let cols = inkColumns(run)
        guard cols.count >= 2 else { continue }
        for i in 1..<cols.count {
            let d = Double(cols[i].0 - cols[i - 1].0)
            // reject touching pairs (read as one column run) and badge-to-badge gaps
            if d >= Double(inkWidth) - 1 && d <= Double(inkWidth) + 6 { steps.append(d) }
        }
    }
    let advance = steps.isEmpty ? Double(inkWidth) + 2.5 : steps.reduce(0, +) / Double(steps.count)
    // Only learn from runs the right height to be badge text. VFX flashes over a badge produce
    // tall or squat blobs that would otherwise each become their own template and bloat the set.
    let runs = allRuns.filter { abs($0.h - modalHeight) <= 1 }

    // Pass 2: slice every run into fixed-pitch cells and cluster them. Compression means no two
    // observations are bit-identical, so cluster by distance rather than by exact mask.
    var clusterMask: [[Bool]] = []
    var clusterCount: [Int] = []
    var cellCount = 0
    for run in runs {
        for cell in sliceCells(run, advance: advance, inkWidth: inkWidth) {
            cellCount += 1
            var best = Int.max, bestIdx = -1
            for (i, m) in clusterMask.enumerated() {
                let d = alignedDistance(m, cell)
                if d < best { best = d; bestIdx = i }
            }
            if bestIdx >= 0 && best <= GLYPH_MERGE_DISTANCE { clusterCount[bestIdx] += 1 }
            else { clusterMask.append(cell); clusterCount.append(1) }
        }
    }

    // Order by frequency: the real characters dominate, compression and VFX artefacts sit in the tail.
    let order = (0..<clusterMask.count).sorted { clusterCount[$0] > clusterCount[$1] }
    let ordered = order.map {
        GlyphTemplate(label: "", mask: maskString(clusterMask[$0]), count: clusterCount[$0],
                      sampleWidth: Int(advance.rounded()), sampleHeight: modalHeight)
    }
    let bankCells = Dictionary(uniqueKeysWithValues: order.map {
        (maskString(clusterMask[$0]), (cells: clusterMask[$0], w: GW, h: GH))
    })
    let set = GlyphSet(
        note: "Run `bcscan glyphdump <this file>` and label each template with the character it shows, using `bcscan label <this file> idx:char,...`. Leave noise entries blank — blank-labelled templates are ignored at scan time.",
        advance: advance,
        inkWidth: inkWidth,
        templates: ordered)
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
    print("harvested \(allRuns.count) text runs, kept \(runs.count) at modal height \(modalHeight)px")
    print(String(format: "%d characters -> %d distinct shapes (advance=%.3fpx, ink=%dpx)", cellCount, ordered.count, advance, inkWidth))
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

    // One column per measurement, keyed by what the badge *is* rather than where it sat.
    // `_raw` preserves the left-to-right reading as `kind=value|kind=value`, so nothing is lost
    // if a future badge kind shows up that the hue table does not know about yet.
    var header = ["t", "frame"]
    for s in layout.slots {
        header.append("\(s.id)_cd")
        for k in BADGE_KINDS { header.append("\(s.id)_\(k)") }
        header.append("\(s.id)_raw")
    }
    for k in layout.hpBars.keys.sorted() { header.append("hp_\(k)_px"); header.append("hp_\(k)_width") }

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

            var byKind: [String: String] = [:]
            var raw: [String] = []
            for run in textRuns(bm, s.badges) {
                let text = matcher.read(run)
                let kind = badgeKind(bm, run, text: text)
                raw.append("\(kind)=\(text ?? "?")")
                // First occurrence wins: a duplicate kind under one mon means a VFX misread, and
                // the leftmost badge is the real one.
                if let text, byKind[kind] == nil { byKind[kind] = text }
            }
            for k in BADGE_KINDS { row.append(byKind[k] ?? "") }
            row.append(raw.joined(separator: "|"))
        }

        for k in layout.hpBars.keys.sorted() {
            let r = layout.hpBars[k]!
            // Rightmost green column = the fill boundary. Counting green pixels would undercount,
            // because the white HP text masks the middle of the bar.
            var fill = 0
            for x in stride(from: min(r.x + r.w, bm.w) - 1, through: max(0, r.x), by: -1) {
                var green = false
                for y in r.y..<min(r.y + r.h, bm.h) where bm.isHealthGreen(x, y) { green = true; break }
                if green { fill = x - r.x + 1; break }
            }
            row.append(String(fill))
            row.append(String(r.w))
        }

        lines.append(row.joined(separator: ","))
    }
    writeText(lines.joined(separator: "\n") + "\n", to: outPath)
    print("wrote \(outPath) — \(lines.count - 1) frames x \(header.count) columns")

// MARK: glyphdump
// Renders harvested templates as ASCII so they can be labelled from text rather than from a
// thumbnail. Far more reliable than squinting at glyphs.png, and it is the labelling path the
// skill documents.
case "glyphdump":
    let set = loadGlyphs(args[2])
    let limit = args.count > 3 ? Int(args[3])! : 40
    let cols = args.count > 4 ? Int(args[4])! : 8
    print(String(format: "advance=%.3fpx ink=%dpx templates=%d showing first %d", set.advance, set.inkWidth, set.templates.count, min(limit, set.templates.count)))
    var i = 0
    while i < min(limit, set.templates.count) {
        let chunk = Array(i..<min(i + cols, min(limit, set.templates.count)))
        print("")
        print(chunk.map { String(format: "idx %-3d n=%-5d", $0, set.templates[$0].count).padding(toLength: GW + 2, withPad: " ", startingAt: 0) }.joined(separator: " "))
        print(chunk.map { (set.templates[$0].label.isEmpty ? "label: ?" : "label: \(set.templates[$0].label)").padding(toLength: GW + 2, withPad: " ", startingAt: 0) }.joined(separator: " "))
        let masks = chunk.map { maskBools(set.templates[$0].mask) }
        for y in 0..<GH {
            var any = false
            for m in masks { for x in 0..<GW where m[y * GW + x] { any = true; break } }
            _ = any
            var line: [String] = []
            for m in masks {
                var s = ""
                for x in 0..<GW { s += m[y * GW + x] ? "#" : "." }
                line.append(s + "  ")
            }
            print(line.joined(separator: " "))
        }
        i += cols
    }
    print("")
    print("Write each character into the matching template's \"label\" field in the JSON.")
    print("Leave noise entries blank; blank-labelled templates are ignored at scan time.")

// MARK: autolabel
// Labels the template set from known-good readings instead of by eye.
//
// You supply a few frames where you can read the badges yourself; the tool slices those badges on
// the advance grid and assigns each cell's character to whichever template it matches. This is
// both faster and far less error-prone than labelling 40 ASCII bitmaps by hand, and it is
// self-checking: if a ground-truth line's character count disagrees with the slice count, the line
// is reported and skipped rather than silently poisoning the set.
//
// Ground truth file: one `t,slotId,runIndex,text` per line, `#` for comments.
case "autolabel":
    let v = Video(args[2])
    let layout = loadLayout(args[3])
    let glyphPath = args[4]
    var set = loadGlyphs(glyphPath)
    guard let truthData = FileManager.default.contents(atPath: args[5]),
          let truth = String(data: truthData, encoding: .utf8) else { die("cannot read \(args[5])") }

    var masks = set.templates.map { maskBools($0.mask) }
    // votes[templateIndex][character] -> count, so a disputed template resolves by majority.
    var votes = [[String: Int]](repeating: [:], count: masks.count)
    var used = 0, skipped = 0

    for line in truth.split(separator: "\n") {
        let s = line.trimmingCharacters(in: .whitespaces)
        if s.isEmpty || s.hasPrefix("#") { continue }
        let f = s.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) }
        guard f.count >= 4, let t = Double(f[0]), let runIdx = Int(f[2]) else {
            print("skip (malformed): \(s)"); skipped += 1; continue
        }
        guard let slot = layout.slots.first(where: { $0.id == f[1] }) else {
            print("skip (unknown slot \(f[1])): \(s)"); skipped += 1; continue
        }
        let expected = Array(f[3]).map(String.init)
        guard let bm = v.bitmap(at: t) else { print("skip (no frame): \(s)"); skipped += 1; continue }
        let runs = textRuns(bm, slot.badges)
        guard runIdx < runs.count else {
            print("skip (only \(runs.count) runs at t=\(t) \(f[1])): \(s)"); skipped += 1; continue
        }
        let cells = sliceCells(runs[runIdx], advance: set.advance, inkWidth: set.inkWidth)
        guard cells.count == expected.count else {
            print("skip (sliced \(cells.count) cells, expected \(expected.count) for '\(f[3])'): \(s)")
            skipped += 1; continue
        }
        for (i, cell) in cells.enumerated() {
            var best = Int.max, bestIdx = -1
            for (j, m) in masks.enumerated() {
                let d = alignedDistance(m, cell)
                if d < best { best = d; bestIdx = j }
            }
            if bestIdx >= 0 && best <= GLYPH_MERGE_DISTANCE {
                votes[bestIdx][expected[i], default: 0] += 1
            } else {
                // a shape the harvest never saw: add it as its own template
                masks.append(cell)
                votes.append([expected[i]: 1])
                set.templates.append(GlyphTemplate(label: "", mask: maskString(cell), count: 1,
                                                   sampleWidth: Int(set.advance.rounded()), sampleHeight: GH))
            }
        }
        used += 1
    }

    var labelled = 0
    for i in 0..<set.templates.count {
        guard i < votes.count, let winner = votes[i].max(by: { $0.value < $1.value }) else { continue }
        // Ignore a template whose votes are genuinely split; a wrong label is worse than none.
        let total = votes[i].values.reduce(0, +)
        guard winner.value * 2 > total else {
            print("ambiguous template \(i): \(votes[i]) — left unlabelled"); continue
        }
        set.templates[i].label = winner.key
        labelled += 1
    }

    let enc = JSONEncoder(); enc.outputFormatting = [.prettyPrinted]
    try? enc.encode(set).write(to: URL(fileURLWithPath: glyphPath))
    let chars = Set(set.templates.filter { !$0.label.isEmpty }.map { $0.label }).sorted()
    print("used \(used) ground-truth lines, skipped \(skipped)")
    print("labelled \(labelled) of \(set.templates.count) templates, covering: \(chars.joined(separator: " "))")

// MARK: label
// Applies labels positionally, so the whole set can be labelled in one command once the
// characters have been read off `glyphdump`.
case "label":
    let path = args[2]
    var set = loadGlyphs(path)
    // "0:7,1:4,2:1" — index:character pairs. Any index not listed is left as-is.
    for pair in args[3].split(separator: ",") {
        let kv = pair.split(separator: ":", maxSplits: 1)
        guard kv.count == 2, let idx = Int(kv[0]), idx >= 0, idx < set.templates.count else {
            die("bad pair '\(pair)' — expected index:character")
        }
        set.templates[idx].label = String(kv[1])
    }
    let enc = JSONEncoder(); enc.outputFormatting = [.prettyPrinted]
    try? enc.encode(set).write(to: URL(fileURLWithPath: path))
    let labelled = set.templates.filter { !$0.label.isEmpty }.count
    print("\(path): \(labelled) of \(set.templates.count) templates labelled")

default:
    die("unknown subcommand: \(cmd)")
}
