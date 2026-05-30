import { useId } from "react";

export default function FramewiseMark({ size = 64, variant = "gradient" }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `fw-bg-grad-${uid}`;

  const fills = {
    gradient:    { bg: `url(#${gradId})`, fg: "#FFF2DC", accent: "#FFE2C8" },
    "mono-cocoa": { bg: "#2A1810",         fg: "#FFEDD8", accent: "#FEC9AF" },
    "mono-cream": { bg: "transparent",     fg: "#FFEDD8", accent: "#FEC9AF", stroke: "#FFEDD8" },
    outline:      { bg: "transparent",     fg: "#2A1810", accent: "#C56A43", stroke: "#2A1810" },
  };
  const f = fills[variant] || fills.gradient;

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-label="Framewise mark">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#FEC9AF" />
          <stop offset="55%"  stopColor="#F8A57F" />
          <stop offset="100%" stopColor="#C56A43" />
        </linearGradient>
      </defs>

      {/* Backplate */}
      <rect x="0" y="0" width="64" height="64" rx="14" ry="14"
        fill={variant === "gradient" ? `url(#${gradId})` : f.bg}
        stroke={f.stroke || "none"}
        strokeWidth={variant === "mono-cream" || variant === "outline" ? 1.5 : 0} />

      {/* Inner highlight */}
      {variant === "gradient" && (
        <rect x="1" y="1" width="62" height="62" rx="13" ry="13"
          fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="1" />
      )}

      {/* Stem */}
      <rect x="16" y="14" width="5" height="34" rx="1" fill={f.fg} />

      {/* Top horizontal — film frame */}
      <rect x="16" y="14" width="28" height="9" rx="1.5" fill={f.fg} />
      <rect x="40" y="17" width="2" height="3" fill={f.bg === "transparent" ? f.fg : f.bg} opacity={variant === "gradient" ? .35 : .25} />
      <rect x="36" y="17" width="2" height="3" fill={f.bg === "transparent" ? f.fg : f.bg} opacity={variant === "gradient" ? .35 : .25} />

      {/* Middle horizontal — second film frame */}
      <rect x="16" y="28" width="20" height="7" rx="1.5" fill={f.fg} />
      <rect x="30" y="30" width="2" height="3" fill={f.bg === "transparent" ? f.fg : f.bg} opacity={variant === "gradient" ? .35 : .25} />

      {/* Timeline baseline + marker dot */}
      <rect x="14" y="52" width="36" height="1.5" rx=".75" fill={f.fg} opacity=".45" />
      <circle cx="22" cy="52.75" r="2.25" fill={f.accent} />
    </svg>
  );
}
