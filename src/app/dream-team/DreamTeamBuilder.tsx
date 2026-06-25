"use client";
// 드림팀 빌더 — 게임 설명 + 포메이션 피치 + 가성비 후보 + 우측 선수 능력치 카드
import { useState, useMemo, useActionState, useRef, useEffect } from "react";
import { saveDreamTeam, type SaveState } from "./actions";
import { TIERS } from "@/lib/dream-team/tiers";
import { MENTALITIES, MENTALITY_ORDER, teamStrength } from "@/lib/dream-team/tactics";
import type { DreamPlayer } from "@/lib/dream-team/pool";
import PlayerStatCard from "./PlayerStatCard";
import ShareButton from "./ShareButton";

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
  initial: { name: string; formation: string; mentality?: string; players: unknown } | null;
  tierKey: string;
  topTeams: { id: string; name: string; nickname: string; rating: number; tier: string }[];
  freeMode?: boolean;
  siteUrl?: string;
}
interface Selected {
  playerId: string;
  slot: string;
  mode: "candidate" | "placed";
}

function ovrBadgeColor(ovr: number): string {
  return ovr >= 90 ? "#be3455" : "#26263a";
}

export default function DreamTeamBuilder({ pool, initial, tierKey, topTeams, freeMode, siteUrl = "https://www.scorebase.kr" }: Props) {
  const [formation, setFormation] = useState(initial?.formation && FORMATIONS[initial.formation] ? initial.formation : "4-3-3");
  const [mentality, setMentality] = useState(initial?.mentality && MENTALITIES[initial.mentality] ? initial.mentality : "balanced");
  const [name, setName] = useState(initial?.name ?? "나의 드림팀");
  const [picks, setPicks] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    const ps = initial?.players;
    if (Array.isArray(ps)) for (const p of ps) if (p?.slot && p?.playerId) init[p.slot] = p.playerId;
    return init;
  });
  const [roles, setRoles] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    const ps = initial?.players;
    if (Array.isArray(ps)) for (const p of ps) if (p?.slot && p?.role) init[p.slot] = p.role;
    return init;
  });
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [state, formAction, pending] = useActionState(saveDreamTeam, { ok: false } as SaveState);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected && cardRef.current && window.innerWidth < 1024) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selected]);

  const tier = TIERS[tierKey] ?? TIERS.amateur;
  const rows = FORMATIONS[formation];
  const flatSlots = useMemo(() => rows.flat(), [rows]);
  const poolById = useMemo(() => {
    const m: Record<string, DreamPlayer> = {};
    for (const p of pool) m[p.id] = p;
    return m;
  }, [pool]);

  const usedValue = useMemo(() => flatSlots.reduce((s, sl) => s + (picks[sl.id] ? poolById[picks[sl.id]]?.value ?? 0 : 0), 0), [flatSlots, picks, poolById]);
  const remaining = tier.budget - usedValue;
  const filled = flatSlots.filter((s) => picks[s.id]).length;
  const teamOvr = filled ? Math.round(flatSlots.reduce((s, sl) => s + (picks[sl.id] ? poolById[picks[sl.id]]?.ovr ?? 0 : 0), 0) / filled) : 0;
  const power = useMemo(() => {
    const squad = flatSlots
      .filter((s) => picks[s.id])
      .map((s) => {
        const p = poolById[picks[s.id]];
        return { ovr: p?.ovr ?? 0, pos: p?.pos ?? "MF", role: roles[s.id] ?? "balanced" };
      });
    return squad.length ? teamStrength(squad) : { atk: 0, def: 0 };
  }, [flatSlots, picks, poolById, roles]);

  const activeSlotObj = activeSlot ? flatSlots.find((s) => s.id === activeSlot) ?? null : null;
  const candidates = useMemo(() => {
    if (!activeSlotObj) return [];
    const used = new Set(Object.values(picks));
    const q = search.trim();
    const refund = activeSlot && picks[activeSlot] ? poolById[picks[activeSlot]]?.value ?? 0 : 0;
    const affordable = remaining + refund;
    return pool
      .filter((p) => p.pos === activeSlotObj.pos && !used.has(p.id) && (q === "" || p.name.includes(q)) && (freeMode || p.value <= affordable))
      .sort((a, b) => (freeMode ? b.value - a.value : b.ovr / Math.max(1, b.value) - a.ovr / Math.max(1, a.value)))
      .slice(0, 30);
  }, [activeSlotObj, search, picks, pool, remaining, activeSlot, poolById, freeMode]);

  const selectedPlayer = selected ? poolById[selected.playerId] ?? null : null;
  const selectedAffordable = useMemo(() => {
    if (!selected || selected.mode !== "candidate" || !selectedPlayer) return false;
    if (freeMode) return true;
    const refund = picks[selected.slot] ? poolById[picks[selected.slot]]?.value ?? 0 : 0;
    return selectedPlayer.value <= remaining + refund;
  }, [selected, selectedPlayer, picks, remaining, poolById, freeMode]);

  function clickSlot(slot: Slot) {
    if (picks[slot.id]) {
      setSelected({ playerId: picks[slot.id], slot: slot.id, mode: "placed" });
      setActiveSlot(null);
    } else {
      setActiveSlot(slot.id);
      setSelected(null);
      setSearch("");
    }
  }
  function viewCandidate(playerId: string) {
    if (!activeSlot) return;
    setSelected({ playerId, slot: activeSlot, mode: "candidate" });
  }
  function doPick() {
    if (!selected) return;
    setPicks((p) => ({ ...p, [selected.slot]: selected.playerId }));
    setSelected(null);
    setActiveSlot(null);
    setSearch("");
  }
  function doRemove() {
    if (!selected) return;
    const slot = selected.slot;
    setPicks((p) => {
      const n = { ...p };
      delete n[slot];
      return n;
    });
    setRoles((p) => {
      const n = { ...p };
      delete n[slot];
      return n;
    });
    setSelected(null);
  }

  const playersPayload = JSON.stringify(flatSlots.filter((s) => picks[s.id]).map((s) => ({ slot: s.id, playerId: picks[s.id], role: roles[s.id] ?? "balanced" })));
  const canSave = filled === 11 && remaining >= 0;
  const budgetPct = Math.min(100, Math.round((usedValue / tier.budget) * 100));

  return (
    <div className="mt-6">
      {!freeMode && (
        <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-neutral-600 dark:border-neutral-800 dark:bg-white/[0.03] dark:text-neutral-300">
          <span className="font-medium text-neutral-900 dark:text-white">드림팀이란</span> — 빅5 현역 선수로 11명을 꾸려 다른 팀과 겨룹니다. 정해진 예산 안에서 <span className="font-medium text-rose-600 dark:text-rose-400">몸값 대비 능력치(OVR)가 높은 가성비 선수</span>를 찾는 게 핵심입니다. 경기에서 이기면 자금이 쌓여 상위 리그로 승급하고, 어린 선수는 출전할수록 성장합니다. 선수를 누르면 오른쪽에서 능력치를 볼 수 있어요.
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">팀 이름</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-base font-medium text-neutral-900 outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">포메이션</span>
            <select
              value={formation}
              onChange={(e) => {
                setFormation(e.target.value);
                setActiveSlot(null);
                setSelected(null);
              }}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
            >
              {Object.keys(FORMATIONS).map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
          {!freeMode && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-500 dark:text-neutral-400">전술</span>
              <select
                value={mentality}
                onChange={(e) => setMentality(e.target.value)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
              >
                {MENTALITY_ORDER.map((k) => (
                  <option key={k} value={k}>{MENTALITIES[k].name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
      {!freeMode && (
        <p className="mt-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">{MENTALITIES[mentality].name} 전술</span> — {MENTALITIES[mentality].desc}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-3">
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-center dark:border-neutral-800 dark:bg-white/[0.04]">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">팀 종합 OVR</div>
          <div className="text-2xl font-semibold leading-none text-neutral-900 dark:text-white">{teamOvr || "-"}</div>
        </div>
        {!freeMode && (
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-center dark:border-neutral-800 dark:bg-white/[0.04]">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">공격 / 수비</div>
            <div className="text-2xl font-semibold leading-none">
              <span className="text-rose-600 dark:text-rose-400">{Math.round(power.atk) || "-"}</span>
              <span className="text-neutral-300 dark:text-neutral-600"> / </span>
              <span className="text-sky-600 dark:text-sky-400">{Math.round(power.def) || "-"}</span>
            </div>
          </div>
        )}
        <div className="min-w-[230px] flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-800 dark:bg-white/[0.04]">
          {freeMode ? (
            <div className="flex h-full flex-wrap items-center justify-between gap-1">
              <span className="text-sm font-medium text-rose-600 dark:text-rose-400">자유 구성 모드</span>
              <span className="text-sm text-neutral-500 dark:text-neutral-400">{filled}/11명 · 예산 제한 없음</span>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="relative overflow-hidden rounded-2xl px-2 py-5" style={{ background: "#2f7d4a" }}>
            <div className="absolute left-0 right-0 top-1/2 border-t border-white/20" />
            <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
            <div className="relative flex flex-col gap-4">
              {rows.map((row, ri) => (
                <div key={ri} className="flex justify-around">
                  {row.map((slot) => {
                    const pid = picks[slot.id];
                    const pl = pid ? poolById[pid] : null;
                    const isSel = selected?.slot === slot.id && selected.mode === "placed";
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => clickSlot(slot)}
                        className={`flex w-[23%] flex-col items-center gap-1 rounded-lg p-1 transition-transform ${isSel ? "bg-white/20 ring-2 ring-white" : ""}`}
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
                            <span className="absolute -bottom-1.5 -right-2 rounded-full px-1.5 text-[11px] font-medium text-white" style={{ background: ovrBadgeColor(pl.ovr) }}>
                              {pl.ovr}
                            </span>
                          </div>
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-white/60 bg-white/10 text-lg text-white/80">+</div>
                        )}
                        <span className="max-w-[88px] truncate text-xs font-medium text-white">{pl ? pl.name : slot.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {activeSlotObj && (
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-white/[0.04]">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-900 dark:text-white">{activeSlotObj.label} 자리 — 가성비 후보 ({activeSlotObj.pos})</span>
                <button type="button" onClick={() => setActiveSlot(null)} className="text-xs text-neutral-400 hover:text-neutral-600">닫기</button>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="선수 이름 검색"
                className="mb-3 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
              />
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {candidates.length === 0 && <p className="py-4 text-center text-sm text-neutral-400">예산 내 후보가 없습니다. 다른 선수를 빼보세요.</p>}
                {candidates.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => viewCandidate(p.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${selected?.playerId === p.id ? "border-rose-400 ring-1 ring-rose-300 dark:border-rose-500/50 dark:ring-rose-500/30" : "border-neutral-200 hover:border-rose-300 dark:border-neutral-800 dark:hover:border-rose-500/40"} bg-white dark:bg-white/[0.03]`}
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
        </div>

        <div ref={cardRef} className="scroll-mt-4 lg:sticky lg:top-4 lg:self-start">
          <PlayerStatCard
            player={selectedPlayer}
            mode={selected?.mode ?? null}
            affordable={selectedAffordable}
            onPick={doPick}
            onRemove={doRemove}
            role={selected ? (roles[selected.slot] ?? "balanced") : null}
            onRoleChange={(rkey) => {
              if (selected) setRoles((prev) => ({ ...prev, [selected.slot]: rkey }));
            }}
            showRole={!freeMode}
          />
          {topTeams.length > 0 && (
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-white/[0.04]">
              <h3 className="mb-2 text-sm font-medium text-neutral-900 dark:text-white">상위 팀</h3>
              <div className="space-y-1.5">
                {topTeams.map((t, i) => (
                  <a key={t.id} href={`/dream-team/team/${t.id}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-4 flex-shrink-0 text-neutral-400">{i + 1}</span>
                      <span className="truncate text-neutral-700 hover:text-rose-600 dark:text-neutral-200">{t.name}</span>
                    </span>
                    <span className="flex-shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{TIERS[t.tier]?.name ?? t.tier} · {t.rating}</span>
                  </a>
                ))}
              </div>
              <a href="/dream-team/leaderboard" className="mt-3 block text-xs font-medium text-rose-600 hover:underline dark:text-rose-400">전체 리더보드 →</a>
            </div>
          )}
        </div>
      </div>

      {freeMode ? (
        <p className="mt-5 text-sm text-neutral-500 dark:text-neutral-400">
          {filled === 11
            ? `완성! 팀 종합 OVR ${teamOvr} — 마음껏 구성하고 선수 능력치를 비교해보세요.`
            : "예산 걱정 없이 좋아하는 현역 선수로 환상의 라인업을 채워보세요."}
        </p>
      ) : (
        <form action={formAction} className="mt-5">
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="formation" value={formation} />
          <input type="hidden" name="mentality" value={mentality} />
          <input type="hidden" name="players" value={playersPayload} />
          <div className="flex flex-wrap items-center gap-3">
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
            {state.ok && state.teamId && (
              <ShareButton
                url={`${siteUrl}/dream-team/team/${state.teamId}`}
                title={`${name} · ${tier.name} 드림팀`}
                text={`내 드림팀 "${name}" (${tier.name}·OVR ${teamOvr}) 이겨봐`}
                mine
              />
            )}
            {state.error && <span className="text-sm text-rose-600 dark:text-rose-400">{state.error}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
