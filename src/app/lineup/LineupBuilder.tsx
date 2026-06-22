"use client";
// 라인업 전술판 빌더 — 포메이션 피치에 실선수/커스텀 선수를 클릭 배치하고 이미지 카드로 공유.
// 게임(드림팀)과 분리: 저장·예산·Elo 없음. 시각화 + 공유가 전부.

import { useState, useMemo, useCallback } from "react";
import { Share2, Download, Link2, Plus, X, UserPlus, Check, Shirt } from "lucide-react";
import { FORMATIONS, FORMATION_NAMES, KITS, KIT_BY_KEY, type Slot } from "@/lib/lineup/formations";
import { encodeLineup, type LineupState, type SlotPick } from "@/lib/lineup/lineup-state";

// 빌더가 쓰는 선수 필드만 (페이지가 슬림 매핑해 전달 — radar 등 무거운 필드 제외).
export interface PoolPlayer {
  id: string;
  name: string;
  pos: "GK" | "DF" | "MF" | "FW";
  ovr: number;
  team: string;
  photo: string | null;
}

interface Props {
  pool: PoolPlayer[];
  initial: LineupState | null;
}

function ovrBadgeColor(ovr: number): string {
  return ovr >= 90 ? "#be3455" : ovr >= 80 ? "#475569" : "#52525b";
}

// initial(공유 링크 복원) → slotId 기준 picks 맵으로.
function initialPicks(initial: LineupState | null): Record<string, SlotPick> {
  if (!initial || !FORMATIONS[initial.f]) return {};
  const out: Record<string, SlotPick> = {};
  FORMATIONS[initial.f].forEach((slot, i) => {
    const pick = initial.p[i];
    if (pick) out[slot.id] = pick;
  });
  return out;
}

export default function LineupBuilder({ pool, initial }: Props) {
  const [formation, setFormation] = useState(initial?.f && FORMATIONS[initial.f] ? initial.f : "4-3-3");
  const [title, setTitle] = useState(initial?.t ?? "나의 베스트 11");
  const [subtitle, setSubtitle] = useState(initial?.s ?? "");
  const [kit, setKit] = useState(initial?.k && KIT_BY_KEY[initial.k] ? initial.k : "grass");
  const [picks, setPicks] = useState<Record<string, SlotPick>>(() => initialPicks(initial));
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [customName, setCustomName] = useState("");
  const [copied, setCopied] = useState(false);

  const slots = FORMATIONS[formation];
  const poolById = useMemo(() => {
    const m: Record<string, PoolPlayer> = {};
    for (const p of pool) m[p.id] = p;
    return m;
  }, [pool]);

  const activeSlotObj = activeSlot ? slots.find((s) => s.id === activeSlot) ?? null : null;
  const usedIds = useMemo(() => {
    const s = new Set<string>();
    for (const v of Object.values(picks)) if (typeof v === "string") s.add(v);
    return s;
  }, [picks]);

  const candidates = useMemo(() => {
    if (!activeSlotObj) return [];
    const q = search.trim();
    return pool
      .filter((p) => p.pos === activeSlotObj.pos && !usedIds.has(p.id) && (q === "" || p.name.includes(q)))
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 40);
  }, [activeSlotObj, search, pool, usedIds]);

  const filled = slots.filter((s) => picks[s.id]).length;

  const closePanel = useCallback(() => {
    setActiveSlot(null);
    setSearch("");
    setCustomName("");
  }, []);

  function clickSlot(slot: Slot) {
    setActiveSlot((cur) => (cur === slot.id ? null : slot.id));
    setSearch("");
    setCustomName("");
  }
  function pickPlayer(playerId: string) {
    if (!activeSlot) return;
    setPicks((p) => ({ ...p, [activeSlot]: playerId }));
    closePanel();
  }
  function pickCustom() {
    const n = customName.trim();
    if (!activeSlot || !n) return;
    setPicks((p) => ({ ...p, [activeSlot]: { n } }));
    closePanel();
  }
  function removeSlot(slotId: string) {
    setPicks((p) => {
      const n = { ...p };
      delete n[slotId];
      return n;
    });
    closePanel();
  }

  // 공유 상태 → 코드 → URL.
  const code = useMemo(() => {
    const state: LineupState = {
      f: formation,
      t: title.slice(0, 30),
      s: subtitle.slice(0, 40),
      k: kit,
      p: slots.map((s) => picks[s.id] ?? null),
    };
    return encodeLineup(state);
  }, [formation, title, subtitle, kit, slots, picks]);

  const ogUrl = `/api/og/lineup?d=${code}`;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/lineup?d=${code}` : `/lineup?d=${code}`;

  async function onShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: title || "나의 베스트 11", url: shareUrl });
        return;
      } catch {
        /* 취소·미지원 → 복사 폴백 */
      }
    }
    onCopy();
  }
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* 클립보드 거부 무시 */
    }
  }

  const kitObj = KIT_BY_KEY[kit];

  return (
    <div className="mt-6">
      {/* 상단 컨트롤 */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">팀 이름</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={30}
            placeholder="나의 베스트 11"
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-base font-medium text-neutral-900 outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
          />
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">부제 (선택)</label>
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            maxLength={40}
            placeholder="예) 2026 드림 스쿼드"
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">포메이션</span>
          <select
            value={formation}
            onChange={(e) => {
              setFormation(e.target.value);
              closePanel();
            }}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
          >
            {FORMATION_NAMES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400">
            <Shirt className="h-3.5 w-3.5" /> 키트
          </span>
          <div className="flex gap-1.5">
            {KITS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKit(k.key)}
                title={k.label}
                aria-label={k.label}
                className={`h-6 w-6 rounded-full ring-2 transition-transform ${kit === k.key ? "ring-rose-500 scale-110" : "ring-transparent hover:scale-105"}`}
                style={{ background: `linear-gradient(135deg, ${k.from}, ${k.to})` }}
              />
            ))}
          </div>
        </div>
        <span className="ml-auto text-sm text-neutral-500 dark:text-neutral-400">{filled}/11명</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* 피치 */}
        <div>
          <div
            className="relative w-full overflow-hidden rounded-2xl"
            style={{ aspectRatio: "4 / 5", background: `linear-gradient(to bottom, ${kitObj.from}, ${kitObj.to})` }}
          >
            {/* 라인 */}
            <div className="pointer-events-none absolute inset-[4%] rounded-md border-2 border-white/15" />
            <div className="pointer-events-none absolute inset-x-[4%] top-1/2 border-t-2 border-white/15" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[18%] w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/15" />

            {slots.map((slot) => {
              const pick = picks[slot.id];
              const player = typeof pick === "string" ? poolById[pick] : null;
              const customLabel = pick && typeof pick !== "string" ? pick.n : null;
              const isActive = activeSlot === slot.id;
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => clickSlot(slot)}
                  className="absolute flex flex-col items-center"
                  style={{ left: `${slot.x}%`, top: `${slot.y}%`, transform: "translate(-50%, -50%)", width: "21%" }}
                >
                  <span className={`relative flex items-center justify-center rounded-full transition ${isActive ? "ring-4 ring-white" : ""}`}>
                    {player ? (
                      <span className="relative block h-[clamp(34px,8vw,56px)] w-[clamp(34px,8vw,56px)] overflow-hidden rounded-full bg-white/90 ring-2 ring-white/70">
                        {player.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={player.photo} alt={player.name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-sm font-bold text-emerald-800">{player.name.slice(0, 2)}</span>
                        )}
                        <span className="absolute -bottom-1 -right-1 rounded-full px-1.5 text-[10px] font-bold text-white ring-1 ring-white/60" style={{ background: ovrBadgeColor(player.ovr) }}>
                          {player.ovr}
                        </span>
                      </span>
                    ) : customLabel ? (
                      <span className="flex h-[clamp(34px,8vw,56px)] w-[clamp(34px,8vw,56px)] items-center justify-center rounded-full bg-white/85 text-sm font-bold text-neutral-700 ring-2 ring-white/70">
                        {customLabel.slice(0, 2)}
                      </span>
                    ) : (
                      <span className="flex h-[clamp(34px,8vw,56px)] w-[clamp(34px,8vw,56px)] items-center justify-center rounded-full border-2 border-dashed border-white/60 bg-white/10 text-white/80">
                        <Plus className="h-4 w-4" />
                      </span>
                    )}
                  </span>
                  <span className="mt-1 max-w-full truncate rounded px-1 text-[clamp(9px,2.4vw,12px)] font-semibold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
                    {player ? player.name : customLabel ?? slot.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 공유 액션 */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href={ogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
            >
              <Download className="h-4 w-4" /> 이미지로 저장
            </a>
            <button
              type="button"
              onClick={onShare}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200"
            >
              <Share2 className="h-4 w-4" /> 공유
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Link2 className="h-4 w-4" />}
              {copied ? "복사됨" : "링크 복사"}
            </button>
          </div>
        </div>

        {/* 후보 패널 */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          {activeSlotObj ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-white/[0.04]">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-900 dark:text-white">
                  {activeSlotObj.label} 자리 · {activeSlotObj.pos}
                </span>
                <button type="button" onClick={closePanel} className="text-neutral-400 hover:text-neutral-600">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {picks[activeSlotObj.id] && (
                <button
                  type="button"
                  onClick={() => removeSlot(activeSlotObj.id)}
                  className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
                >
                  <X className="h-3.5 w-3.5" /> 이 자리 비우기
                </button>
              )}

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="선수 이름 검색"
                className="mb-2 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
              />

              {/* 커스텀 이름 직접 입력 */}
              <div className="mb-3 flex gap-1.5">
                <input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && pickCustom()}
                  maxLength={16}
                  placeholder="직접 입력 (이름)"
                  className="w-full rounded-lg border border-dashed border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-600 dark:bg-white/[0.04] dark:text-white"
                />
                <button
                  type="button"
                  onClick={pickCustom}
                  disabled={!customName.trim()}
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-neutral-800 px-3 text-xs font-medium text-white disabled:opacity-40 dark:bg-white/10"
                >
                  <UserPlus className="h-3.5 w-3.5" /> 추가
                </button>
              </div>

              <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
                {candidates.length === 0 && <p className="py-4 text-center text-sm text-neutral-400">해당 선수가 없습니다.</p>}
                {candidates.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickPlayer(p.id)}
                    className="flex w-full items-center gap-3 rounded-lg border border-neutral-200 bg-white p-2 text-left transition-colors hover:border-rose-300 dark:border-neutral-800 dark:bg-white/[0.03] dark:hover:border-rose-500/40"
                  >
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                      {p.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photo} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs text-neutral-500">{p.name.slice(0, 2)}</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-900 dark:text-white">{p.name}</span>
                      <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">{p.team}</span>
                    </span>
                    <span className="flex-shrink-0 text-sm font-semibold text-neutral-900 dark:text-white">{p.ovr}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-white/[0.02] dark:text-neutral-400">
              피치의 빈자리를 눌러 선수를 채워보세요. 실제 빅5 선수를 검색하거나 직접 이름을 입력할 수 있어요.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
