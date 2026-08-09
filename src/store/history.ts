import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Source } from "../lib/sources";

export interface ScanEntry {
  id: string;
  content: string;
  format: string;
  source: Source;
  timestamp: number;
}

const LIMIT = 500;
/** A code re-read within this window is the same read, not a new one. */
const REPEAT_MS = 3000;

interface HistoryState {
  entries: ScanEntry[];
  add: (scan: { text: string; format: string }, source: Source) => ScanEntry;
  remove: (id: string) => void;
  clearAll: () => void;
}

export const useHistory = create<HistoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      add: (scan, source) => {
        const now = Date.now();
        const recent = get().entries[0];
        if (recent && recent.content === scan.text && now - recent.timestamp < REPEAT_MS) {
          return recent;
        }
        const entry: ScanEntry = {
          id: crypto.randomUUID(),
          content: scan.text,
          format: scan.format,
          source,
          timestamp: now,
        };
        set((s) => ({ entries: [entry, ...s.entries].slice(0, LIMIT) }));
        return entry;
      },
      remove: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      clearAll: () => set({ entries: [] }),
    }),
    { name: "qwikodo-history" },
  ),
);
