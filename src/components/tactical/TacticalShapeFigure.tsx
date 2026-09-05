// 전술 리뷰 본문 도식 — 한 팀의 실제 선발 셋업(색 마커 + 라인별 연결선)을 위로 공격하는 방향으로 그리고,
// 상대 팀 형태를 흰 마커(역할 약어만)로 미러링해 겹친다. 유튜브 전술 채널의 "형태 겹치기" 도식을 글로 옮긴 것.
// 피치는 공용 Pitch/PitchMarker(정규화 % 좌표) — 연결선 SVG 도 같은 viewBox 규약(meet)으로 좌표를 공유한다.
import Pitch, { PitchMarker } from "@/components/pitch/Pitch";
import type { ShapeFigure, ShapePlayer } from "@/lib/tactical/ts-enrich";

const ASPECT = 3 / 4.2; // Pitch vertical 기본과 동일 — viewBox 100 x (100/ASPECT)
const VB_H = 100 / ASPECT;

// 연결선 그룹 — 수비 라인 / 수비형·중앙 미드필더 / 공격형·측면 미드필더 / 공격진. 미드필더를 깊이로 나눠야
// 4-2-3-1 의 "2"와 "3"이 각자 한 줄로 보인다(한 줄로 이으면 W 자 지그재그가 된다).
const LINE_GROUPS: string[][] = [["CB", "LB", "RB"], ["DM", "CM"], ["AM", "LM", "RM"], ["ST", "LW", "RW"]];

/** 같은 그룹 선수를 x 순으로 이어 형태를 드러내는 폴리라인 좌표. */
function lineOf(players: ShapePlayer[], roles: string[]): string | null {
  const pts = players.filter((p) => roles.includes(p.role)).sort((a, b) => a.x - b.x);
  if (pts.length < 2) return null;
  return pts.map((p) => `${p.x},${(p.y * VB_H) / 100}`).join(" ");
}

export default function TacticalShapeFigure({ fig }: { fig: ShapeFigure }) {
  const accent = fig.side === "home" ? "#2563eb" : "#dc2626"; // 홈 파랑 · 원정 빨강 (전술판 versus 와 동일 색 규약)
  const lines = LINE_GROUPS.map((g) => lineOf(fig.players, g)).filter((v): v is string => !!v);
  return (
    <figure className="not-prose my-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 dark:bg-white/[0.04] dark:ring-white/10">
      <figcaption className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 pt-3 pb-2 text-[13px]">
        <span className="inline-flex items-center gap-1.5 font-bold text-zinc-900 dark:text-white">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} aria-hidden />
          {fig.team} {fig.formation ?? ""}
        </span>
        {fig.coach && <span className="text-zinc-500 dark:text-white/50">감독 {fig.coach}</span>}
        <span className="ml-auto inline-flex items-center gap-1.5 text-zinc-500 dark:text-white/45">
          <span className="h-2.5 w-2.5 rounded-full bg-white ring-1 ring-zinc-300" aria-hidden />
          상대 {fig.opponent} {fig.opponentFormation ?? ""} 형태
        </span>
      </figcaption>
      <Pitch orientation="vertical" aspect={ASPECT} stripes className="rounded-none">
        {/* 라인 연결선 — Pitch 의 마킹 SVG 와 같은 viewBox·meet 규약이라 마커(%)와 정확히 겹친다. */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 100 ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          fill="none"
          aria-hidden="true"
        >
          {lines.map((pts, i) => (
            <polyline key={i} points={pts} stroke={accent} strokeWidth={1.1} strokeOpacity={0.85} strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </svg>
        {/* 상대 형태 — 흰 마커, 역할만 */}
        {fig.opponentPlayers.map((p, i) => (
          <PitchMarker key={`o${i}`} x={p.x} y={p.y}>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[8px] font-bold text-zinc-700 shadow ring-1 ring-zinc-400/60 sm:h-7 sm:w-7 sm:text-[9px]">
              {p.role}
            </span>
          </PitchMarker>
        ))}
        {/* 우리 셋업 — 색 마커 + 이름 */}
        {fig.players.map((p, i) => (
          <PitchMarker key={`p${i}`} x={p.x} y={p.y} className="z-10">
            <span className="flex flex-col items-center">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-extrabold text-white shadow-md ring-2 ring-white/90 sm:h-8 sm:w-8 sm:text-[10px]"
                style={{ background: accent }}
              >
                {p.role}
              </span>
              <span
                className="mt-0.5 max-w-[84px] truncate text-[9px] font-semibold text-white sm:text-[10px]"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,.8)" }}
              >
                {p.name}
              </span>
            </span>
          </PitchMarker>
        ))}
      </Pitch>
    </figure>
  );
}
