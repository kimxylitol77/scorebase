"use client";
// 드림팀 이적 시장 클라이언트 — 시세 기반 영입/방출 (싸게 사서 키워 비싸게, 손익 표시)
import { useState, useMemo, useActionState } from "react";
import { transferPlayer, type TransferState } from "./actions";
import { marketValue } from "@/lib/dream-team/pricing";
import { grownOvr } from "@/lib/dream-team/grow";
import type { DreamPlayer } from "@/lib/dream-team/pool";
import type { SquadMember } from "@/lib/dream-team/squad";

const POS = ["ALL", "FW", "MF", "DF", "GK"];
const POS_LABEL: Record<string, string> = { ALL: "전체", FW: "공격", MF: "미드", DF: "수비", GK: "GK" };

interface Props {
  funds: number;
  pool: DreamPlayer[];
  owned: SquadMember[];
  seasonNo: number;
}

export default function TransferClient({ funds, pool, owned, seasonNo }: Props) {
  const [state, formAction, pending] = useActionState(transferPlayer, { ok: false } as TransferState);
  const [pos, setPos] = useState("ALL");
  const [search, setSearch] = useState("");

  const ownedSet = useMemo(() => new Set(owned.map((m) => m.playerId)), [owned]);
  const poolById = useMemo(() => {
    const m: Record<string, DreamPlayer> = {};
    for (const p of pool) m[p.id] = p;
    return m;
  }, [pool]);

  const candidates = useMemo(() => {
    const q = search.trim();
    return pool
      .filter((p) => !ownedSet.has(p.id) && (pos === "ALL" || p.pos === pos) && (q === "" || p.name.includes(q)))
      .map((p) => ({ p, price: marketValue(p, 0, seasonNo) }))
      .sort((a, b) => b.p.ovr / Math.max(1, b.price) - a.p.ovr / Math.max(1, a.price))
      .slice(0, 40);
  }, [pool, pos, search, ownedSet, seasonNo]);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-white/[0.04]">
        <span className="text-sm text-neutral-500 dark:text-neutral-400">보유 자금</span>
        <span className="text-xl font-semibold text-rose-600 dark:text-rose-400">€{funds}M</span>
      </div>

      {state.error && <p className="mt-3 rounded-lg bg-rose-500/10 px-4 py-2.5 text-sm text-rose-700 dark:text-rose-300">{state.error}</p>}
      {state.ok && state.message && <p className="mt-3 rounded-lg bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">{state.message}</p>}

      <h2 className="mb-2 mt-6 text-sm font-medium text-neutral-900 dark:text-white">보유 선수 ({owned.length})</h2>
      <p className="mb-2 text-xs text-neutral-400">시세는 육성(OVR 성장)과 시즌 폼에 따라 변합니다. 키워서 오른 선수를 방출하면 차익이 남습니다.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {owned.map((m) => {
          const p = poolById[m.playerId];
          if (!p) return null;
          const price = marketValue(p, m.xp, seasonNo);
          const profit = price - (m.boughtValue ?? p.value);
          const ovr = grownOvr(p.ovr, p.potential, m.xp);
          const cond = m.condition ?? 100;
          const inj = m.injuryGames ?? 0;
          return (
            <div key={m.playerId} className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-white/[0.04]">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-neutral-500">{p.name.slice(0, 2)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-neutral-900 dark:text-white">{p.name}</span>
                    {inj > 0 && <span className="flex-shrink-0 rounded bg-rose-500/15 px-1 text-[10px] font-medium text-rose-600 dark:text-rose-400">부상 {inj}경기</span>}
                  </div>
                  <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {p.pos} · OVR {ovr}
                    {ovr > p.ovr ? <span className="text-emerald-600 dark:text-emerald-400"> (+{ovr - p.ovr})</span> : ""} · 컨디션 <span className={cond < 50 ? "text-rose-500" : cond < 75 ? "text-amber-500 dark:text-amber-400" : ""}>{cond}</span>
                  </div>
                  <div className="truncate text-xs text-neutral-400">
                    시세 €{price}M
                    {profit !== 0 && <span className={profit > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}> {profit > 0 ? `+${profit}` : profit}</span>}
                  </div>
                </div>
              </div>
              <form action={formAction}>
                <input type="hidden" name="action" value="out" />
                <input type="hidden" name="playerId" value={p.id} />
                <button type="submit" disabled={pending} className="flex-shrink-0 rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-white/[0.04]">
                  방출 +€{price}M
                </button>
              </form>
            </div>
          );
        })}
        {owned.length === 0 && <p className="text-sm text-neutral-400">보유 선수가 없습니다. 아래에서 영입하세요.</p>}
      </div>

      <h2 className="mb-2 mt-6 text-sm font-medium text-neutral-900 dark:text-white">영입 (가성비순)</h2>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {POS.map((p) => (
            <button key={p} type="button" onClick={() => setPos(p)} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${pos === p ? "bg-rose-600 text-white" : "border border-neutral-200 text-neutral-600 hover:border-rose-300 dark:border-neutral-700 dark:text-neutral-300"}`}>
              {POS_LABEL[p]}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="선수 이름 검색"
          className="min-w-[120px] flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {candidates.map(({ p, price }) => {
          const afford = funds >= price;
          const prospect = p.potential > p.ovr;
          return (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-white/[0.04]">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-neutral-500">{p.name.slice(0, 2)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-neutral-900 dark:text-white">{p.name}</div>
                  <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {p.pos} · OVR {p.ovr} · {p.team}
                    {prospect && <span className="text-rose-500 dark:text-rose-400"> · 잠재 {p.potential}</span>}
                  </div>
                </div>
              </div>
              <form action={formAction}>
                <input type="hidden" name="action" value="in" />
                <input type="hidden" name="playerId" value={p.id} />
                <button type="submit" disabled={pending || !afford} className="flex-shrink-0 rounded-full bg-rose-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40">
                  {afford ? `영입 €${price}M` : `€${price}M`}
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
