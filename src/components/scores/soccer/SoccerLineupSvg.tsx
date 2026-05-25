// 축구 라인업 — TheSports lineup/detail 응답 시각화.
// 응답 구조:
//   { confirmed, home_formation, away_formation, coach_id, lineup: { home: [...], away: [...] } }
//   선수: { id, first (1=선발), captain, name, logo, shirt_number, position (G|D|M|F), x, y, rating }
//   좌표 (x, y): 0~100, y 작을수록 자기 골 근처
//
// 디자인:
//   세로 SVG 필드 (홈 아래 / 어웨이 위, 회전 표시)
//   선수: 원 + 등번호 + 짧은 이름 (한국어 매핑 시도)
//   라인 표시 (GK + DEF + MID + FWD).

import { toKoreanTeamName } from "@/lib/team-names";

interface Player {
  id?: string;
  first?: number;
  captain?: number;
  name?: string;
  shirt_number?: number;
  position?: string;
  x?: number;
  y?: number;
  rating?: string | number;
}

interface LineupData {
  confirmed?: number;
  home_formation?: string;
  away_formation?: string;
  lineup?: {
    home?: Player[];
    away?: Player[];
  };
}

interface Props {
  data: LineupData;
  homeNameKo: string;
  awayNameKo: string;
}

function lastName(full: string): string {
  if (!full) return "";
  // 한국어 매핑 시도 후 그래도 영문이면 last name
  const ko = toKoreanTeamName(full);
  if (ko && ko !== full) return ko;
  const parts = full.split(/\s+/);
  return parts[parts.length - 1] ?? full;
}

function positionColor(pos?: string): string {
  switch ((pos || "").toUpperCase()) {
    case "G": return "#ef4444";  // 골키퍼
    case "D": return "#3b82f6";  // 디펜더
    case "M": return "#22c55e";  // 미드필더
    case "F": return "#f59e0b";  // 포워드
    default: return "#94a3b8";
  }
}

function Marker({
  player, x, y, mirror,
}: {
  player: Player;
  x: number;
  y: number;
  mirror: boolean;
}) {
  const cx = mirror ? 100 - x : x;
  const cy = mirror ? 50 - y / 2 : 50 + y / 2;
  const name = lastName(player.name || "");
  const num = player.shirt_number ?? "";
  const captain = player.captain === 1;
  const rating = typeof player.rating === "string" ? parseFloat(player.rating) : player.rating;

  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle
        r={2.6}
        fill={positionColor(player.position)}
        stroke="#fff"
        strokeWidth={0.4}
      />
      <text
        x={0}
        y={0.9}
        textAnchor="middle"
        fontSize={2.4}
        fontWeight={700}
        fill="#fff"
      >
        {num}
      </text>
      <text
        x={0}
        y={5.6}
        textAnchor="middle"
        fontSize={2.2}
        fontWeight={600}
        fill="#e2e8f0"
      >
        {captain ? "ⓒ " : ""}{name}
      </text>
      {rating != null && rating > 0 && (
        <text
          x={0}
          y={-3.8}
          textAnchor="middle"
          fontSize={2.1}
          fontWeight={700}
          fill={rating >= 7 ? "#86efac" : rating >= 6 ? "#fde68a" : "#fca5a5"}
        >
          {rating.toFixed(1)}
        </text>
      )}
    </g>
  );
}

export default function SoccerLineupSvg({ data, homeNameKo, awayNameKo }: Props) {
  const lu = data.lineup;
  if (!lu) return null;
  const homeStarters = (lu.home ?? []).filter((p) => p.first === 1);
  const awayStarters = (lu.away ?? []).filter((p) => p.first === 1);
  if (homeStarters.length === 0 && awayStarters.length === 0) return null;

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm sm:text-base font-bold tracking-tight">라인업</h2>
        <span className="text-[11px] text-neutral-500">
          {data.confirmed === 1 ? "확정 라인업" : "예상 라인업"}
        </span>
      </header>

      {/* 포메이션 */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-center text-xs">
        <div className="rounded-md bg-blue-50 dark:bg-blue-500/10 py-2">
          <div className="text-neutral-500 truncate px-1">{awayNameKo}</div>
          <div className="text-blue-600 dark:text-blue-400 font-bold text-lg tabular-nums">
            {data.away_formation || "-"}
          </div>
        </div>
        <div className="rounded-md bg-rose-50 dark:bg-rose-500/10 py-2">
          <div className="text-neutral-500 truncate px-1">{homeNameKo}</div>
          <div className="text-rose-600 dark:text-rose-400 font-bold text-lg tabular-nums">
            {data.home_formation || "-"}
          </div>
        </div>
      </div>

      {/* SVG 필드 — max-w 더 줄임 (2026-05-25) — laptop 한 화면 fit 보장.
          사용자 신고: max-w-lg (512px) 여전히 위/아래 양 팀 한 화면 안 들어와 "두 라인업" 인식. */}
      <div className="rounded-lg overflow-hidden mx-auto max-w-xs sm:max-w-sm" style={{ background: "linear-gradient(180deg, #047857 0%, #065f46 50%, #047857 100%)" }}>
        <svg viewBox="0 0 100 100" className="w-full">
          {/* 필드 line */}
          <rect x={2} y={2} width={96} height={96} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.4} />
          <line x1={2} y1={50} x2={98} y2={50} stroke="rgba(255,255,255,0.35)" strokeWidth={0.4} />
          <circle cx={50} cy={50} r={8} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.4} />
          <circle cx={50} cy={50} r={0.6} fill="rgba(255,255,255,0.6)" />
          {/* 페널티 박스 */}
          <rect x={28} y={2} width={44} height={14} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.4} />
          <rect x={28} y={84} width={44} height={14} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.4} />
          {/* 골 박스 */}
          <rect x={38} y={2} width={24} height={6} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.4} />
          <rect x={38} y={92} width={24} height={6} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.4} />

          {/* away 선수 (위쪽, mirror) */}
          {awayStarters.map((p, i) => (
            <Marker
              key={`a-${p.id ?? i}`}
              player={p}
              x={p.x ?? 50}
              y={p.y ?? 50}
              mirror
            />
          ))}
          {/* home 선수 (아래쪽) */}
          {homeStarters.map((p, i) => (
            <Marker
              key={`h-${p.id ?? i}`}
              player={p}
              x={p.x ?? 50}
              y={p.y ?? 50}
              mirror={false}
            />
          ))}
        </svg>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-3 text-[10px] text-neutral-500">
        <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#ef4444" }} />GK</span>
        <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#3b82f6" }} />DF</span>
        <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#22c55e" }} />MF</span>
        <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#f59e0b" }} />FW</span>
      </div>
    </section>
  );
}
