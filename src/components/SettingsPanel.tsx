import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Preferences {
  keepRunningInTray: boolean;
  globalShortcuts: boolean;
  startAtLogin: boolean;
}

interface Props {
  onClose: () => void;
}

const EMPTY: Preferences = {
  keepRunningInTray: true,
  globalShortcuts: true,
  startAtLogin: false,
};

export function SettingsPanel({ onClose }: Props) {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState<keyof Preferences | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    invoke<Preferences>("get_preferences").then(setPreferences).catch((cause) => {
      setPreferences(EMPTY);
      setError(`Settings couldn't be read. (${String(cause)})`);
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function setPreference(key: keyof Preferences, value: boolean) {
    if (!preferences || saving) return;
    const next = { ...preferences, [key]: value };
    if (key === "keepRunningInTray" && !value) next.startAtLogin = false;

    setSaving(key);
    setError("");
    try {
      setPreferences(await invoke<Preferences>("set_preferences", { preferences: next }));
    } catch (cause) {
      setError(`That setting couldn't be changed. (${String(cause)})`);
    } finally {
      setSaving(null);
    }
  }

  const rows: Array<{
    key: keyof Preferences;
    name: string;
    detail: string;
    disabled?: boolean;
  }> = [
    {
      key: "keepRunningInTray",
      name: "Keep running after close",
      detail: "Leave Qwikodo in the tray or menu bar. Turn this off to quit on close.",
    },
    {
      key: "globalShortcuts",
      name: "Global scan shortcuts",
      detail: "Let Alt/Option + Shift + S or V activate Qwikodo from another app.",
    },
    {
      key: "startAtLogin",
      name: "Start at login",
      detail: "Launch quietly in the tray when you sign in.",
      disabled: !preferences?.keepRunningInTray,
    },
  ];

  return (
    <div className="settings-scrim" onMouseDown={onClose}>
      <section
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="settings-head">
          <div>
            <span className="settings-kicker">Background access</span>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button className="act" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="settings-list" aria-busy={!preferences || Boolean(saving)}>
          {rows.map((row) => (
            <label className="setting" data-disabled={row.disabled ? "" : undefined} key={row.key}>
              <span className="setting-copy">
                <span className="setting-name">{row.name}</span>
                <span className="setting-detail">{row.detail}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={preferences?.[row.key] ?? false}
                disabled={!preferences || Boolean(saving) || row.disabled}
                onChange={(event) => void setPreference(row.key, event.target.checked)}
              />
              <span className="switch" aria-hidden="true" />
            </label>
          ))}
        </div>

        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
        <p className="settings-foot">Stored only on this computer · no restart needed</p>
      </section>
    </div>
  );
}
