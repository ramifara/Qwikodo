import { useEffect, useMemo, useState } from "react";
import { useHistory, type ScanEntry } from "../store/history";
import { copyText } from "../lib/clipboard";
import { relativeTime } from "../lib/payload";

const SOURCE_TAG: Record<ScanEntry["source"], string> = {
  file: "File",
  camera: "Camera",
  clipboard: "Clipboard",
  screen: "Screen",
};

export function HistoryList({
  entries,
  onGenerate,
}: {
  entries: ScanEntry[];
  onGenerate: (text: string) => void;
}) {
  const remove = useHistory((s) => s.remove);
  const clearAll = useHistory((s) => s.clearAll);
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? entries.filter((e) => e.content.toLowerCase().includes(q)) : entries;
  }, [entries, query]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  return (
    <section className="history">
      <header className="history-head">
        <h2>History</h2>
        {entries.length > 0 && <span className="count">{entries.length}</span>}
        {entries.length > 10 && (
          <input
            className="history-search"
            type="text"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {entries.length > 0 && (
          <button
            className={confirming ? "act is-danger" : "act"}
            onClick={() => (confirming ? (clearAll(), setConfirming(false)) : setConfirming(true))}
          >
            {confirming ? `Delete all ${entries.length}?` : "Clear"}
          </button>
        )}
      </header>

      {entries.length === 0 ? (
        <p className="history-empty">Scans you make are kept here, on this computer only.</p>
      ) : shown.length === 0 ? (
        <p className="history-empty">No history entries match "{query}".</p>
      ) : (
        <ul className="stubs">
          {shown.map((entry) => (
            <li key={entry.id} className={open === entry.id ? "stub is-open" : "stub"}>
              <button
                className="stub-main"
                onClick={() => setOpen(open === entry.id ? null : entry.id)}
                aria-expanded={open === entry.id}
              >
                <span className="stub-meta">
                  <span className="format">{entry.format}</span>
                  <span className="stub-source">{SOURCE_TAG[entry.source]}</span>
                  <span className="stub-time">{relativeTime(entry.timestamp, now)}</span>
                </span>
                <span className="stub-text">{entry.content}</span>
              </button>
              <span className="stub-tools">
                <button className="act" onClick={() => copyText(entry.content)}>
                  Copy
                </button>
                <button className="act" onClick={() => onGenerate(entry.content)}>
                  As QR
                </button>
                <button className="act" onClick={() => remove(entry.id)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
