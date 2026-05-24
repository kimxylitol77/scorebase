/**
 * Scorebase 톤 가이드:
 * - "Value Bet" / "Edge" 같은 영문 베팅 용어 → 한국어 미디어 톤
 * - "픽" / "Pick" → "추정" / "시각"
 * - 직접 베팅 권유 표현 절대 금지
 */

interface Props {
  leagueLabel: string;
  /** "롯데 vs 한화" */
  awayTeam: string;
  homeTeam: string;
  /** "오늘 18:30 잠실" */
  meta?: string;
  isLive?: boolean;
  liveText?: string;
}

export default function MatchHeader({
  leagueLabel,
  awayTeam,
  homeTeam,
  meta,
  isLive,
  liveText,
}: Props) {
  return (
    <header className="relative z-10 space-y-2">
      <div className="flex items-center gap-2">
        <span className="insight-pill uppercase">{leagueLabel}</span>
        {isLive && (
          <span className="insight-badge-live">
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            LIVE{liveText && ` · ${liveText}`}
          </span>
        )}
      </div>
      <h1 className="insight-match-name leading-tight">
        {awayTeam}
        <span className="mx-2 text-[var(--insight-text-3)] font-bold">vs</span>
        {homeTeam}
      </h1>
      {meta && (
        <p className="text-[12px] text-[var(--insight-text-3)]">{meta}</p>
      )}
    </header>
  );
}
