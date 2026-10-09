const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const FileMark = () => (
  <svg {...base}>
    <path d="M4 2h5l3 3v9H4z" />
    <path d="M9 2.2V5h2.8" />
  </svg>
);

export const CameraMark = () => (
  <svg {...base}>
    <rect x="2" y="4.5" width="12" height="9" rx="1" />
    <circle cx="8" cy="9" r="2.4" />
    <path d="M6 4.5l.9-1.6h2.2l.9 1.6" />
  </svg>
);

export const ClipboardMark = () => (
  <svg {...base}>
    <path d="M5.5 3H4v11h8V3h-1.5" />
    <rect x="5.8" y="1.6" width="4.4" height="2.6" rx="0.6" />
  </svg>
);

export const ScreenMark = () => (
  <svg {...base}>
    <rect x="1.8" y="3" width="12.4" height="8.4" rx="1" />
    <path d="M6 14h4" />
  </svg>
);

export const GenerateMark = () => (
  <svg {...base}>
    <path d="M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4z" />
    <path d="M9.5 9.5h1.5v1.5H9.5zM12 9.5h1.5V13.5H9.5V12" />
  </svg>
);

export const SettingsMark = () => (
  <svg {...base}>
    <circle cx="8" cy="8" r="2.1" />
    <path d="M8 1.8v1.5M8 12.7v1.5M14.2 8h-1.5M3.3 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" />
  </svg>
);
