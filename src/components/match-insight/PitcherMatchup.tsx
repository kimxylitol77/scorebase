/** 야구 매치 — 양 팀 선발투수 좌우 비교 (ERA, WHIP, K/9, W-L, IP). */

export interface PitcherStats {
  name: string;
  era: number;
  whip: number;
  kPer9: number;
  wins: number;
  losses: number;
  inningsPitched: number;
}

interface Props {
  away: PitcherStats;
  home: PitcherStats;
  awayTeam: string;
  homeTeam: string;
}

export default function PitcherMatchup({
  away,
  home,
  awayTeam,
  homeTeam,
}: Props) {
  return (
    <div className="insight-card relative z-10">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--insight-text-3)]">
          선발 비교
        </span>
        <span className="insight-pill">PITCHER</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
        <Side stats={away} team={awayTeam} align="left" />
        <div className="text-[18px] font-black text-[var(--insight-text-3)] pt-6">
          VS
        </div>
        <Side stats={home} team={homeTeam} align="right" />
      </div>
    </div>
  );
}

function Side({
  stats,
  team,
  align,
}: {
  stats: PitcherStats;
  team: string;
  align: "left" | "right";
}) {
  const text = align === "left" ? "text-left" : "text-right";
  return (
    <div className={`${text} space-y-1.5`}>
      <div className="text-[10px] text-[var(--insight-text-3)] uppercase tracking-wider">
        {team}
      </div>
      <div className="text-[14px] font-bold text-[var(--insight-text)] truncate">
        {stats.name}
      </div>
      <dl className="space-y-1 text-[12px]">
        <Row label="ERA" value={stats.era.toFixed(2)} highlight />
        <Row label="WHIP" value={stats.whip.toFixed(2)} />
        <Row label="K/9" value={stats.kPer9.toFixed(1)} />
        <Row
          label="시즌"
          value={`${stats.wins}승 ${stats.losses}패 · ${stats.inningsPitched.toFixed(1)} IP`}
        />
      </dl>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[var(--insight-text-3)]">{label}</dt>
      <dd
        className={`tabular-nums font-bold ${
          highlight ? "text-[var(--insight-success)]" : "text-[var(--insight-text)]"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
