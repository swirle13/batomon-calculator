import { useEffect, useMemo, useState } from "react";
import { useTeamConfig } from "../../context/TeamConfigContext";
import { InvalidBuildCodeError, buildUrl, exportBuild, importBuild, readBuildFromUrl } from "../../data/share";
import { Button, Field, Surface, TextArea } from "../primitives";
import styles from "./ShareBuild.module.css";

/**
 * Share a build, as a link or as a code.
 *
 * ## What is deliberately NOT shown
 *
 * The build id was displayed here with the caption "identifies this team; the code below restores
 * it". It was the author's distinction, not the user's: nobody comparing builds needs a fingerprint
 * on screen when the code itself is right beneath it and is just as comparable. It still exists in
 * `share.ts` and is still what names a saved build — it simply has no reason to occupy the panel.
 *
 * ## Link first
 *
 * A URL is the thing people actually paste to each other. The code remains for places a link does
 * not survive, and because it is what you keep if you want the build without a browser.
 *
 * ## Always open
 *
 * Briefly a `Disclosure`, on the theory that sharing is occasional. It reads as a static panel
 * again: it now sits at the top of the detail column where it costs little, and a disclosure that
 * is opened nearly every visit is a click in the way rather than a saving.
 */
export function ShareBuild() {
  const { config, replaceConfig } = useTeamConfig();
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"url" | "code" | null>(null);

  const code = useMemo(() => exportBuild(config), [config]);
  const url = useMemo(() => buildUrl(config), [config]);

  // Load a build the page was opened with. Runs once: re-running on every config change would
  // fight the user's edits, since the URL is not rewritten as they build.
  useEffect(() => {
    const incoming = readBuildFromUrl();
    if (incoming) replaceConfig(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy(what: "url" | "code") {
    try {
      await navigator.clipboard.writeText(what === "url" ? url : code);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard permission can be denied; both values stay selectable in their fields, so this
      // is a missing convenience rather than a failure worth an error state.
      setCopied(null);
    }
  }

  function load() {
    try {
      // Accepts a full URL as readily as a bare code — people paste whichever they were given.
      replaceConfig(importBuild(pasted));
      setError(null);
      setPasted("");
    } catch (err) {
      setError(err instanceof InvalidBuildCodeError ? err.message : "Could not read that build.");
    }
  }

  return (
    <Surface className={styles.wrap}>
      <div className={styles.heading}>Share/Load team</div>
      <div className={styles.actions}>
        <Button block onClick={() => copy("url")}>
          {copied === "url" ? "Url copied" : "Copy url"}
        </Button>
        <Button block onClick={() => copy("code")}>
          {copied === "code" ? "Code copied" : "Copy code"}
        </Button>
      </div>

      <TextArea
        mono
        className={styles.code}
        readOnly
        value={code}
        rows={2}
        aria-label="Build code"
        onFocus={(e) => e.currentTarget.select()}
      />

      <Field label="Load a build">
        <TextArea
          mono
          className={styles.code}
          rows={2}
          placeholder="Paste a code…"
          value={pasted}
          onChange={(e) => {
            setPasted(e.target.value);
            setError(null);
          }}
        />
      </Field>
      {/* The one action this panel exists to perform, so the only one with a fill. */}
      <Button variant="primary" block onClick={load} disabled={pasted.trim() === ""}>
        Load team
      </Button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </Surface>
  );
}
