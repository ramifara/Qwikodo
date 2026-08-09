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
