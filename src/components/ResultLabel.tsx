import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ScanEntry } from "../store/history";
import { copyText } from "../lib/clipboard";
import { isOpenable, payloadKind } from "../lib/payload";

const SOURCE_NAME: Record<ScanEntry["source"], string> = {
  file: "From file",
  camera: "From camera",
  clipboard: "From clipboard",
  screen: "From screen",
};

export function ResultLabel({ entry, alsoFound }: { entry: ScanEntry; alsoFound: number }) {
  const [copied, setCopied] = useState(false);
  const kind = payloadKind(entry.content);

  useEffect(() => setCopied(false), [entry.id]);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <article className="result">
      <header className="result-head">
        <span className="format">{entry.format}</span>
        {kind && <span className="kind">{kind}</span>}
        <span className="result-source">{SOURCE_NAME[entry.source]}</span>
      </header>

      <p className="payload">{entry.content}</p>

      <footer className="result-foot">
        <button className="act" onClick={async () => setCopied(await copyText(entry.content))}>
          {copied ? "Copied" : "Copy"}
        </button>
        {isOpenable(entry.content) && (
          <button className="act" onClick={() => openUrl(entry.content.trim())}>
            Open link
          </button>
        )}
        {alsoFound > 0 && (
          <span className="also">
            {alsoFound} more {alsoFound === 1 ? "code" : "codes"} in that image, saved below
          </span>
        )}
      </footer>
    </article>
  );
}
