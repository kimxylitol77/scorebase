"use client";
// 드림팀 빌더 — 포메이션 피치에 예산 안에서 11명 배치, 가성비 후보 선택, 저장
import { useState, useMemo, useActionState } from "react";
import { saveDreamTeam, type SaveState } from "./actions";
import { TIERS } from "@/lib/dream-team/tiers";
import type { DreamPlayer } from "@/lib/dream-team/pool";

type Pos = "GK" | "DF" | "MF" | "FW";
type Slot = { id: string; pos: Pos; label: string };

const FORMATIONS: Record<string, Slot[][]> = {
  "4-3-3": [
    [{ id: "lw", pos: "FW", label: "LW" }, { id: "st", pos: "FW", label: "ST" }, { id: "rw", pos: "FW", label: "RW" }],
    [{ id: "lcm", pos: "MF", label: "CM" }, { id: "cm", pos: "MF", label: "CM" }, { id: "rcm", pos: "MF", label: "CM" }],
    [{ id: "lb", pos: "DF", label: "LB" }, { id: "lcb", pos: "DF", label: "CB" }, { id: "rcb", pos: "DF", label: "CB" }, { id: "rb", pos: "DF", label: "RB" }],
    [{ id: "gk", pos: "GK", label: "GK" }],
  ],
  "4-4-2": [
    [{ id: "st1", pos: "FW", label: "ST" }, { id: "st2", pos: "FW", label: "ST" }],
    [{ id: "lm", pos: "MF", label: "LM" }, { id: "lcm", pos: "MF", label: "CM" }, { id: "rcm", pos: "MF", label: "CM" }, { id: "rm", pos: "MF", label: "RM" }],
    [{ id: "lb", pos: "DF", label: "LB" }, { id: "lcb", pos: "DF", label: "CB" }, { id: "rcb", pos: "DF", label: "CB" }, { id: "rb", pos: "DF", label: "RB" }],
    [{ id: "gk", pos: "GK", label: "GK" }],
  ],
  "4-2-3-1": [
    [{ id: "st", pos: "FW", label: "ST" }],
    [{ id: "lam", pos: "MF", label: "AM" }, { id: "cam", pos: "MF", label: "AM" }, { id: "ram", pos: "MF", label: "AM" }],
    [{ id: "ldm", pos: "MF", label: "DM" }, { id: "rdm", pos: "MF", label: "DM" }],
    [{ id: "lb", pos: "DF", label: "LB" }, { id: "lcb", pos: "DF", label: "CB" }, { id: "rcb", pos: "DF", label: "CB" }, { id: "rb", pos: "DF", label: "RB" }],
    [{ id: "gk", pos: "GK", label: "GK" }],
  ],
  "3-5-2": [
    [{ id: "st1", pos: "FW", label: "ST" }, { id: "st2", pos: "FW", label: "ST" }],
    [{ id: "lm", pos: "MF", label: "LM" }, { id: "lcm", pos: "MF", label: "CM" }, { id: "cm", pos: "MF", label: "CM" }, { id: "rcm", pos: "MF", label: "CM" }, { id: "rm", pos: "MF", label: "RM" }],
    [{ id: "lcb", pos: "DF", label: "CB" }, { id: "cb", pos: "DF", label: "CB" }, { id: "rcb", pos: "DF", label: "CB" }],
    [{ id: "gk", pos: "GK", label: "GK" }],
  ],
};

interface Props {
  pool: DreamPlayer[];
  initial: { name: string; formation: string; players: unknown } | null;
}

function ovrBadgeColor(ovr: number): string {
  return ovr >= 90 ? "#be3455" : "#26263a";
}

export default function DreamTeamBuilder({ pool, initial }: Props) {
  const [formation, setFormation] = useState(initial?.formation && FORMATIONS[initial.formation] ? initial.formation : "4-3-3");
  const [name, setName] = useState(initial?.name ?? "나의 드림팀");
  const [picks, setPicks] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    const ps = initial?.players;
    if (Array.isArray(ps)) for (const p of ps) if (p?.slot && p?.playerId) init[p.slot] = p.playerId;
    return init;
  });
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [state, formAction, pending] = useActionState(saveDreamTeam, { ok: false } as SaveState);

  const tier = TIERS.amateur;
  const rows = FORMATIONS[formation];
  const flatSlots = useMemo(() => rows.flat(), [rows]);
  const poolById = useMemo(() => {
    const m: Record<string, DreamPlayer> = {};
    for (const p of pool) m[p.id] = p;
    return m;
  }, [pool]);

  const usedValue = useMemo(
    () => flatSlots.reduce((s, sl) => s + (picks[sl.id] ? poolById[picks[sl.id]]?.value ?? 0 : 0), 0),
    [flatSlots, picks, poolById],
  );
  const remaining = tier.budget - usedValue;
  const filled = flatSlots.filter((s) => picks[s.id]).length;
  const teamOvr = filled ? Math.round(flatSlots.reduce((s, sl) => s + (picks[sl.id] ? poolById[picks[sl.id]]?.ovr ?? 0 : 0), 0) / filled) : 0;

  const activeSlotObj = activeSlot ? flatSlots.find((s) => s.id === activeSlot) ?? null : null;
  const candidates = useMemo(() => {
    if (!activeSlotObj) return [];
    const used = new Set(Object.values(picks));
    const q = search.trim();
    const refund = activeSlot && picks[activeSlot] ? poolById[picks[activeSlot]]?.value ?? 0 : 0;
    const affordable = remaining + refund;
    return pool
      .filter((p) => p.pos === activeSlotObj.pos && !used.has(p.id) && (q === "" || p.name.includes(q)) && p.value <= affordable)
      .sort((a, b) => b.ovr / Math.max(1, b.value) - a.ovr / Math.max(1, a.value))
      .slice(0, 30);
  }, [activeSlotObj, search, picks, pool, remaining, activeSlot, poolById]);

  function pick(id: string) {
    if (!activeSlot) return;
    setPicks((p) => ({ ...p, [activeSlot]: id }));
    setActiveSlot(null);
    setSearch("");
  }
  function clearSlot(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setPicks((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
  }

  const playersPayload = JSON.stringify(flatSlots.filter((s) => picks[s.id]).map((s) => ({ slot: s.id, playerId: picks[s.id] })));
  const canSave = filled === 11 && remaining >= 0;
  const budgetPct = Math.min(100, Math.round((usedValue / tier.budget) * 100));

  return (
    <div className="mt-6">
      {/* 헤더: 이름 · 포메이션 · OVR · 예산 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-base font-medium text-neutral-900 outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">포메이션</span>
          <select
            value={formation}
            onChange={(e) => {
              setFormation(e.target.value);
              setActiveSlot(null);
            }}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
          >
            {Object.keys(FORMATIONS).map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-center dark:border-neutral-800 dark:bg-white/[0.04]">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">팀 종합 OVR</div>
          <div className="text-2xl font-semibold leading-none text-neutral-900 dark:text-white">{teamOvr || "-"}</div>
        </div>
        <div className="min-w-[230px] flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-800 dark:bg-white/[0.04]">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">예산 ({tier.name})</span>
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              €{usedValue}M <span className="font-normal text-neutral-400">/ €{tier.budget}M</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div className="h-full rounded-full" style={{ width: `${budgetPct}%`, background: remaining < 0 ? "#dc2626" : "#be3455" }} />
          </div>
          <div className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            {filled}/11명 · 남은 예산 €{remaining}M
          </div>
        </div>
      </div>

      {/* 피치 */}
      <div className="relative mt-4 overflow-hidden rounded-2xl px-2 py-5" style={{ background: "#2f7d4a" }}>
        <div className="absolute left-0 right-0 top-1/2 border-t border-white/20" />
        <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
        <div className="relative flex flex-col gap-4">
          {rows.map((row, ri) => (
            <div key={ri} className="flex justify-around">
              {row.map((slot) => {
                const pid = picks[slot.id];
                const pl = pid ? poolById[pid] : null;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => {
                      setActiveSlot(slot.id);
                      setSearch("");
                    }}
                    className={`flex w-[23%] flex-col items-center gap-1 ${activeSlot === slot.id ? "scale-105" : ""} transition-transform`}
                  >
                    {pl ? (
                      <div className="relative">
                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-white/90">
                          {pl.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={pl.photo} alt={pl.name} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-sm font-semibold text-emerald-800">{pl.name.slice(0, 2)}</span>
                          )}
                        </div>
                        <span
                          className="absolute -bottom-1.5 -right-2 rounded-full px-1.5 text-[11px] font-medium text-white"
                          style={{ background: ovrBadgeColor(pl.ovr) }}
                        >
                          {pl.ovr}
                        </span>
                        <span
                          onClick={(e) => clearSlot(slot.id, e)}
                          className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[10px] text-white"
                        >
                          ×
                        </span>
                      </div>
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-white/60 bg-white/10 text-lg text-white/80">
                        +
                      </div>
                    )}
                    <span className="max-w-[88px] truncate text-xs font-medium text-white">{pl ? pl.name : slot.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 후보 패널 */}
      {activeSlotObj && (
        <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-white/[0.04]">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              {activeSlotObj.label} 자리 — 가성비 후보 ({activeSlotObj.pos})
            </span>
            <button type="button" onClick={() => setActiveSlot(null)} className="text-xs text-neutral-400 hover:text-neutral-600">
              닫기
            </button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="선수 이름 검색"
            className="mb-3 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
          />
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {candidates.length === 0 && <p className="py-4 text-center text-sm text-neutral-400">예산 내 후보가 없습니다. 다른 선수를 빼보세요.</p>}
            {candidates.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-neutral-200 bg-white p-2.5 text-left hover:border-rose-300 dark:border-neutral-800 dark:bg-white/[0.03] dark:hover:border-rose-500/40"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-neutral-500">{p.name.slice(0, 2)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-neutral-900 dark:text-white">{p.name}</div>
                  <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {p.team} · {p.age ?? "-"}세{p.potential > p.ovr ? ` · 잠재 ${p.potential}` : ""}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-sm font-semibold text-neutral-900 dark:text-white">OVR {p.ovr}</div>
                  <div className="text-xs text-rose-600 dark:text-rose-400">€{p.value}M</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 저장 */}
      <form action={formAction} className="mt-5">
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="formation" value={formation} />
        <input type="hidden" name="players" value={playersPayload} />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSave || pending}
            className="rounded-full bg-rose-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "저장 중…" : "팀 저장"}
          </button>
          {!canSave && <span className="text-xs text-neutral-400">11명을 예산 안에서 모두 채우면 저장할 수 있습니다.</span>}
          {state.ok && (
            <a href="/dream-team/play" className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">
              저장됨 · 경기하러 가기 →
            </a>
          )}
          {state.error && <span className="text-sm text-rose-600 dark:text-rose-400">{state.error}</span>}
        </div>
      </form>
    </div>
  );
}
