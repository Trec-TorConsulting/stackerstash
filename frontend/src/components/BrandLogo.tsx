interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  subtitle?: string;
  showWordmark?: boolean;
}

const ICON_SIZES = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-12 w-12",
};

const TEXT_SIZES = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl",
};

export function BrandLogo({
  size = "md",
  subtitle,
  showWordmark = true,
}: BrandLogoProps) {
  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <svg
        viewBox="0 0 512 512"
        fill="none"
        aria-hidden="true"
        className={`${ICON_SIZES[size]} shrink-0 rounded-xl shadow-sm`}
      >
        <defs>
          <linearGradient id="brandGold" x1="64" y1="48" x2="448" y2="464" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <linearGradient id="brandBg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0b0f19" />
          </linearGradient>
        </defs>
        <rect width="512" height="512" rx="112" fill="url(#brandBg)" />
        <polygon
          points="256,44 406,106 468,256 406,406 256,468 106,406 44,256 106,106"
          fill="#0f172a"
          stroke="url(#brandGold)"
          strokeWidth="22"
        />
        <rect x="148" y="294" width="216" height="56" rx="14" fill="url(#brandGold)" />
        <rect x="168" y="228" width="176" height="54" rx="14" fill="url(#brandGold)" fillOpacity="0.9" />
        <circle cx="256" cy="172" r="52" fill="url(#brandGold)" />
        <circle cx="256" cy="172" r="34" fill="#0f172a" />
        <path
          d="M256 149v46M238 164c0-8 8-13 18-13s18 5 18 12c0 8-8 11-18 13-10 2-18 5-18 13 0 7 8 12 18 12s18-5 18-13"
          stroke="#fbbf24"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </svg>
      {showWordmark && (
        <div className="leading-tight">
          <div className={`font-bold tracking-tight text-slate-100 ${TEXT_SIZES[size]}`}>
            Stacker Stash
          </div>
          {subtitle && (
            <div className="text-xs text-slate-400 truncate max-w-[180px]">{subtitle}</div>
          )}
        </div>
      )}
    </div>
  );
}

