// 팀 페이지 '선발 라인업' — Match.lineupHome/Away(JSON)의 formation+startXI 를 공용 Pitch 로 시각화.
import Pitch, { PitchMarker } from "@/components/pitch/Pitch";

export interface LineupPlayer {
  name: string; // 원본 영문 (startXI)
  ko: string | null; // DB nameKo 매칭분 (동명이인 충돌 시 null)
}

// 표시명 — 한글 우선, 없으면 영문 성(마지막 토큰)
const label = (p: LineupPlayer) => p.ko ?? p.name.split(" ").pop() ?? p.name;

export default function TeamRecentLineup({
  formation,
  players,
}: {
  formation: string | null;
  players: LineupPlayer[]; // startXI 순서 (af 관례: GK → 수비 → 미드 → 공격)
}) {
  const rows = formation?.split("-").map(Number).filter((n) => Number.isFinite(n) && n > 0) ?? [];
  const usable = players.length === 11 && rows.length >= 2 && rows.reduce((a, b) => a + b, 0) === 10;

  // formation 이 없거나 안 맞으면(일부 친선) 피치 배치를 짐작하지 않는다 — 이름만 사실대로 나열.
  if (!usable) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {players.map((p) => (
          <span key={p.name} className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-white/[0.06] text-sm font-semibold">
            {label(p)}
          </span>
        ))}
      </div>
    );
  }

  // GK 맨 아래, 수비라인(y70)→공격라인(y16) 순 — startXI 순서가 formation 행 순서와 일치.
  const marks: { x: number; y: number; p: LineupPlayer }[] = [{ x: 50, y: 88, p: players[0] }];
  let idx = 1;
  rows.forEach((cnt, r) => {
    const y = 70 - (r * 54) / (rows.length - 1);
    for (let i = 0; i < cnt; i++) marks.push({ x: ((i + 1) / (cnt + 1)) * 100, y, p: players[idx++] });
  });

  return (
    <Pitch
      orientation="vertical"
      aspect={3 / 3.6}
      markingOpacity={0.15}
      className="rounded-2xl border border-emerald-700/30 max-w-md mx-auto"
    >
      {marks.map(({ x, y, p }) => (
        <PitchMarker key={p.name} x={x} y={y}>
          <div className="flex flex-col items-center">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/95 ring-2 ring-emerald-950/30 flex items-center justify-center text-xs font-black text-emerald-950 shadow-md">
              {label(p).slice(0, 1)}
            </div>
            <div className="mt-0.5 max-w-[76px] truncate text-[10px] sm:text-[11px] font-bold text-white text-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {label(p)}
            </div>
          </div>
        </PitchMarker>
      ))}
    </Pitch>
  );
}
