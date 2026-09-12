export function MagicBrainMark({
  size = 42,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`magic-brain-mark ${className}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="magicBrainGradient" x1="8" y1="8" x2="56" y2="58">
          <stop stopColor="#8D3BFF" />
          <stop offset=".48" stopColor="#6B42F5" />
          <stop offset="1" stopColor="#2F8BFF" />
        </linearGradient>
        <linearGradient id="magicBrainFacet" x1="16" y1="14" x2="48" y2="46">
          <stop stopColor="#B34BFF" />
          <stop offset="1" stopColor="#436BFF" />
        </linearGradient>
      </defs>
      <path
        d="M6 12 23 26 32 17 41 26 58 12v36L44 58V34L32 43 20 34v24L6 48V12Z"
        fill="url(#magicBrainGradient)"
      />
      <path d="m6 12 17 14-3 8L6 24V12Z" fill="#A53BFF" opacity=".9" />
      <path d="m58 12-17 14 3 8 14-10V12Z" fill="#2F8BFF" opacity=".95" />
      <path d="m23 26 9-9 9 9-9 17-9-17Z" fill="url(#magicBrainFacet)" />
    </svg>
  );
}

export function MagicBrainLogo({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={`magic-brain-logo ${compact ? "compact" : ""} ${className}`}>
      <span className="magic-brain-logo-mark">
        <MagicBrainMark size={compact ? 34 : 40} />
      </span>
      {!compact && (
        <span className="magic-brain-lockup">
          <strong>Magic Brain<sup>®</sup></strong>
          <small>AI <b>PRO</b></small>
        </span>
      )}
    </span>
  );
}
