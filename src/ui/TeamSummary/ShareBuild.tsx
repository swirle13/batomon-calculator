import { useMemo, useState } from "react";
import { useTeamConfig } from "../../context/TeamConfigContext";
import { InvalidBuildCodeError, buildId, exportBuild, importBuild } from "../../data/share";
import { Surface } from "../primitives";
import styles from "./ShareBuild.module.css";

/**
 * Export and import a build (item 5).
 *
 * ## The id and the code are shown as different things, because they are
 *
 * The **code** restores the build. The **id** is a fingerprint of it — it cannot restore anything,
 * and presenting it as if it could would be the cruellest possible version of this feature, since
 * the whole point is not losing work. So the id is labelled as an identity, the code as the thing
 * you keep, and only the code goes on the clipboard by default.
 *
 * ## Import replaces rather than merges
 *
 * Merging two teams has no obvious correct answer (what happens to a slot occupied in both?), and
 * guessing would quietly corrupt the imported build. Replacement is stated on the button.
 */
export function ShareBuild() {
  const { config, replaceConfig } = useTeamConfig();
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const code = useMemo(() => exportBuild(config), [config]);
  const id = useMemo(() => buildId(config), [config]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; the code is selectable in the field regardless, so this
      // is a missing convenience rather than a failure worth an error state.
      setCopied(false);
    }
  }

  function load() {
    try {
      replaceConfig(importBuild(pasted));
      setError(null);
      setPasted("");
    } catch (err) {
      setError(
        err instanceof InvalidBuildCodeError ? err.message : "Could not read that build code.",
      );
    }
  }

  return (
    <Surface className={styles.wrap}>
      <div className={styles.row}>
        <span className={styles.label}>Build id</span>
        <code className={styles.id} title="A fingerprint of this build. It identifies the team but cannot restore it — use the code below for that.">
          {id}
        </code>
        <span className={styles.note}>identifies this team; the code below restores it</span>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Build code</span>
        <textarea className={styles.code} readOnly value={code} rows={2} onFocus={(e) => e.currentTarget.select()} />
      </label>
      <button type="button" onClick={copy}>{copied ? "Copied" : "Copy build code"}</button>

      <label className={styles.field}>
        <span className={styles.label}>Load a build</span>
        <textarea
          className={styles.code}
          rows={2}
          placeholder="Paste a build code…"
          value={pasted}
          onChange={(e) => {
            setPasted(e.target.value);
            setError(null);
          }}
        />
      </label>
      <button type="button" onClick={load} disabled={pasted.trim() === ""}>
        Replace team with this build
      </button>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </Surface>
  );
}
