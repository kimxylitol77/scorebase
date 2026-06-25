"use client";
// 드림팀 선수 능력치 카드 — 클릭한 선수의 OVR·잠재력·몸값·7축 레이더 + 역할 + 영입/제거
import type { DreamPlayer } from "@/lib/dream-team/pool";
import { ROLES, ROLE_ORDER } from "@/lib/dream-team/tactics";

interface Props {
  player: DreamPlayer | null;
  mode: "candidate" | "placed" | null;
  affordable: boolean;
  onPick: () => void;
  onRemove: () => void;
  role?: string | null;
  onRoleChange?: (role: string) => void;
  showRole?: boolean;
}

export default function PlayerStatCard({ player, mode, affordable, onPick, onRemove, role, onRoleChange, showRole }: Props) {
  if (!player) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-dashed border-neutral-300 p-5 text-center text-sm leading-relaxed text-neutral-400 dark:border-neutral-700">
        선수를 누르면
        <br />
        능력치를 볼 수 있어요.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-white/[0.04]">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          {player.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={player.photo} alt={player.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm text-neutral-500">{player.name.slice(0, 2)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-neutral-900 dark:text-white">{player.name}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {player.team} · {player.age ?? "-"}세
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-neutral-50 py-2 dark:bg-white/[0.03]">
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">OVR</div>
          <div className="text-lg font-semibold text-neutral-900 dark:text-white">{player.ovr}</div>
        </div>
        <div className="rounded-lg bg-neutral-50 py-2 dark:bg-white/[0.03]">
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">잠재력</div>
          <div className="text-lg font-semibold text-neutral-900 dark:text-white">{player.potential}</div>
        </div>
        <div className="rounded-lg bg-neutral-50 py-2 dark:bg-white/[0.03]">
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">몸값</div>
          <div className="text-lg font-semibold text-rose-600 dark:text-rose-400">€{player.value}M</div>
        </div>
      </div>

      {player.pos === "GK" ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500">골키퍼는 선방 지표로 평가합니다</p>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500 dark:text-neutral-400">선방</span>
            <span className="font-medium text-neutral-900 dark:text-white">{player.saves}회</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500 dark:text-neutral-400">경기당 선방</span>
            <span className="font-medium text-neutral-900 dark:text-white">{player.matches > 0 ? (player.saves / player.matches).toFixed(1) : "-"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500 dark:text-neutral-400">출전</span>
            <span className="font-medium text-neutral-900 dark:text-white">{player.matches}경기</span>
          </div>
          {player.cleanSheets != null && (
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500 dark:text-neutral-400">클린시트</span>
              <span className="font-medium text-neutral-900 dark:text-white">{player.cleanSheets}회</span>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {player.radar.map((ax) => (
            <div key={ax.axis} className="flex items-center gap-2">
              <span className="w-[68px] flex-shrink-0 text-[11px] text-neutral-500 dark:text-neutral-400">{ax.axis}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                <div className="h-full rounded-full bg-rose-500" style={{ width: `${ax.value}%` }} />
              </div>
              <span className="w-9 flex-shrink-0 text-right text-[11px] text-neutral-600 dark:text-neutral-300">{ax.raw}</span>
            </div>
          ))}
        </div>
      )}

      {mode === "candidate" && (
        <button
          onClick={onPick}
          disabled={!affordable}
          className="mt-4 w-full rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {affordable ? "이 선수 영입" : "예산 부족"}
        </button>
      )}
      {mode === "placed" && showRole && player.pos !== "GK" && onRoleChange && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">역할</span>
            <span className="text-[11px] text-neutral-400">{ROLES[role ?? "balanced"]?.name === "공격형" ? "공격에 가담" : ROLES[role ?? "balanced"]?.name === "수비형" ? "수비에 집중" : "공수 균형"}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {ROLE_ORDER.map((rkey) => {
              const active = (role ?? "balanced") === rkey;
              return (
                <button
                  key={rkey}
                  type="button"
                  onClick={() => onRoleChange(rkey)}
                  className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${active ? "bg-rose-600 text-white" : "border border-neutral-200 text-neutral-600 hover:border-rose-300 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-rose-500/40"}`}
                >
                  {ROLES[rkey].name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {mode === "placed" && (
        <button
          onClick={onRemove}
          className="mt-3 w-full rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-white/[0.04]"
        >
          라인업에서 빼기
        </button>
      )}
    </div>
  );
}
