// 시장가치 Best XI — 팀 스쿼드 뷰(/transfers?view=team&team=) 상단 포메이션 시각화.
// 4-3-3 슬롯에 가치순 그리디 배치. 세부 포지션(GK/CB/FB/DM/CM/AM/W/ST) 우선,
// coarse fallback(DF/MF/FW)은 accept 후순위로 흡수.
import Link from "next/link";

export interface XIPlayer {
  id: string;
  name: string;
  value: number; // €M
  posCode: string | null;
  photo: string | null;
}

interface Slot {
  key: string;
  label: string; // 슬롯 포지션 라벨 (선수 세부 포지션과 다를 수 있음)
  x: number; // 피치 좌표 % (좌→우)
  y: number; // 피치 좌표 % (상=공격 → 하=골문)
  accept: string[]; // 배치 허용 포지션 — 앞일수록 우선
}

// 4-3-3 — y 작을수록 공격진. coarse(DF/MF/FW)는 마지막 fallback.
const SLOT_DEFS: Slot[] = [
  { key: "ST", label: "ST", x: 50, y: 14, accept: ["ST", "W", "AM", "FW"] },
  { key: "LW", label: "LW", x: 20, y: 24, accept: ["W", "AM", "ST", "FW"] },
  { key: "RW", label: "RW", x: 80, y: 24, accept: ["W", "AM", "ST", "FW"] },
  { key: "LM", label: "CM", x: 28, y: 46, accept: ["CM", "AM", "DM", "MF"] },
  { key: "CM", label: "DM", x: 50, y: 53, accept: ["DM", "CM", "MF"] },
  { key: "RM", label: "CM", x: 72, y: 46, accept: ["AM", "CM", "DM", "MF"] },
  { key: "LB", label: "LB", x: 18, y: 70, accept: ["FB", "CB", "DF"] },
  { key: "LCB", label: "CB", x: 39, y: 76, accept: ["CB", "DF"] },
  { key: "RCB", label: "CB", x: 61, y: 76, accept: ["CB", "DF"] },
  { key: "RB", label: "RB", x: 82, y: 70, accept: ["FB", "CB", "DF"] },
  { key: "GK", label: "GK", x: 50, y: 91, accept: ["GK"] },
];

export interface FilledSlot extends Slot {
  player: XIPlayer | null;
}

// 가치순(desc) 선수 목록 → 슬롯 채움. 밀어내기(augmenting path) 배치:
//   각 선수를 accept 순위가 좋은 슬롯부터 시도 — 빈 슬롯이면 배치,
//   점유돼 있으면 "점유자가 더 싸고 다른 곳으로 옮길 수 있을 때" 연쇄 재배치 후 차지.
// 단순 그리디(고가 coarse 가 정위치 선점)·2-pass(고가 coarse 가 통째로 탈락) 의
// 양쪽 함정을 모두 피해 XI 총가치를 사실상 최대화한다 (맨유 케이스로 검증).
export function pickBestXI(players: XIPlayer[]): FilledSlot[] {
  const slots: FilledSlot[] = SLOT_DEFS.map((s) => ({ ...s, player: null }));
  const slotsFor = (p: XIPlayer) =>
    slots
      .map((s) => ({ s, idx: s.accept.indexOf(p.posCode!) }))
      .filter((x) => x.idx >= 0)
      .sort((a, b) => a.idx - b.idx)
      .map((x) => x.s);

  function tryPlace(p: XIPlayer, visited: Set<string>): boolean {
    const cand = slotsFor(p);
    for (const s of cand) {
      if (!s.player) { s.player = p; return true; }
    }
    // 빈 자리 없음 — 점유자보다 ① 가치 우위 또는 ② 동가+적합도(accept 순위) 우위면 차지.
    // 점유자는 연쇄 재배치 시도 — 실패해도 교체 유지 (총가치/적합도가 증가하는 방향).
    for (const s of cand) {
      const occ = s.player!;
      if (visited.has(s.key)) continue;
      const pIdx = s.accept.indexOf(p.posCode!);
      const oIdx = occ.posCode ? s.accept.indexOf(occ.posCode) : 99;
      const better = occ.value < p.value || (occ.value === p.value && oIdx > pIdx);
      if (!better) continue;
      visited.add(s.key);
      s.player = p;
      tryPlace(occ, visited);
      return true;
    }
    return false;
  }

  for (const p of players) {
    if (!p.posCode) continue;
    tryPlace(p, new Set());
    if (slots.every((s) => s.player)) break;
  }
  return slots;
}

const EUR_KRW = 1791.5;
const krwEok = (eurM: number) => Math.round((eurM * 1e6 * EUR_KRW) / 1e8).toLocaleString();

export default function SquadBestXI({ slots, teamName }: { slots: FilledSlot[]; teamName: string }) {
  const filled = slots.filter((s) => s.player);
  if (filled.length < 7) return null; // 포지션 데이터 부족 팀은 미표시
  const total = filled.reduce((s, f) => s + (f.player?.value || 0), 0);
  return (
    <section className="mt-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-bold">⚽ 시장가치 Best XI</h2>
        <span className="text-[11px] text-neutral-400">
          XI 합계 <strong className="text-cyan-600 dark:text-cyan-400">€{total}M</strong> · {krwEok(total)}억
        </span>
      </div>
      <div className="relative w-full max-w-md mx-auto aspect-[3/4] rounded-3xl overflow-hidden border border-neutral-200/80 dark:border-neutral-800/80 bg-gradient-to-b from-emerald-700 to-emerald-900">
        {/* 피치 라인 */}
        <svg viewBox="0 0 100 133" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden>
          <g fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.45">
            <rect x="3" y="3" width="94" height="127" rx="1.5" />
            <line x1="3" y1="66.5" x2="97" y2="66.5" />
            <circle cx="50" cy="66.5" r="10" />
            <rect x="26" y="110" width="48" height="20" />
            <rect x="38" y="123" width="24" height="7" />
            <rect x="26" y="3" width="48" height="20" />
            <rect x="38" y="3" width="24" height="7" />
          </g>
        </svg>
        {/* 잔디 스트라이프 */}
        <div className="absolute inset-0 opacity-[0.06] bg-[repeating-linear-gradient(0deg,transparent_0,transparent_24px,#fff_24px,#fff_48px)]" aria-hidden />
        {slots.map((s) =>
          s.player ? (
            <Link
              key={s.key}
              href={`/transfers/${s.player.id}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group w-[88px]"
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
            >
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full overflow-hidden ring-2 ring-white/70 bg-gradient-to-br from-neutral-200 to-neutral-400 shadow-lg group-hover:ring-cyan-300 transition flex items-center justify-center">
                {s.player.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.player.photo} alt={s.player.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-neutral-600">{s.player.name.slice(0, 1)}</span>
                )}
              </div>
              <span className="mt-1 max-w-full truncate text-[10px] sm:text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)] leading-tight">
                {s.player.name}
              </span>
              <span className="text-[9px] sm:text-[10px] font-semibold text-emerald-100/90 tabular-nums leading-tight">
                {s.label} · €{s.player.value}M
              </span>
            </Link>
          ) : (
            <div
              key={s.key}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center w-[88px]"
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
              aria-hidden
            >
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center">
                <span className="text-[10px] font-bold text-white/40">{s.label}</span>
              </div>
            </div>
          ),
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-neutral-400 text-center">{teamName} 시장가치 기준 베스트11 (4-3-3) · 스코어베이스</p>
    </section>
  );
}
