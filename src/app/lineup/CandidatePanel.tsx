"use client";
// 선수 후보 패널 — 활성 노드(빈 슬롯/선수)에 실선수 검색·배치 또는 커스텀 이름 입력·삭제.
import { useState, useMemo } from "react";
import { X, UserPlus, Trash2 } from "lucide-react";
import type { PoolPlayer } from "./types";
import type { Pos } from "@/lib/lineup/formations";

interface Props {
  pool: PoolPlayer[];
  pos: Pos;
  clubKey?: string | null;
  label: string;
  filled: boolean;
  usedIds: Set<string>;
  onPick: (p: PoolPlayer) => void;
  onCustom: (name: string) => void;
  onDelete: () => void;
  onClose: () => void;
  benchMode?: boolean; // 후보 명단 추가 모드 — 삭제 버튼 숨김, 다중 선택(패널 유지)
}

const POS_KO: Record<Pos, string> = { GK: "골키퍼", DF: "수비수", MF: "미드필더", FW: "공격수" };

export default function CandidatePanel({ pool, pos, clubKey, label, filled, usedIds, onPick, onCustom, onDelete, onClose, benchMode }: Props) {
  const [search, setSearch] = useState("");
  const [customName, setCustomName] = useState("");

  // 클럽 모드(검색 없음 + 클럽 로드) = 스쿼드 전원을 포지션 섹션으로 — 슬롯 포지션과 무관하게
  // 전부 보이고, 누구를 골라도 이 자리에 배치된다 (포지션별만 보여 "선수가 없다" 혼란 방지).
  const POS_ORDER: Pos[] = ["GK", "DF", "MF", "FW"];
  const clubGroups = useMemo(() => {
    const q = search.trim();
    if (q !== "" || !clubKey) return null;
    const members = pool
      .filter((p) => !usedIds.has(p.id) && p.clubKey === clubKey)
      .sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || b.ovr - a.ovr);
    if (members.length === 0) return null;
    const order = [pos, ...POS_ORDER.filter((g) => g !== pos)]; // 이 슬롯 포지션 섹션 먼저
    return order
      .map((g) => ({ pos: g, players: members.filter((p) => p.pos === g) }))
      .filter((g) => g.players.length > 0);
  }, [pool, pos, usedIds, search, clubKey]);

  const candidates = useMemo(() => {
    if (clubGroups) return clubGroups.flatMap((g) => g.players);
    const q = search.trim();
    // 검색 = 전체 풀·전 포지션 (슬롯 포지션 일치 → 같은 클럽 → OVR 순 정렬)
    return pool
      .filter((p) => !usedIds.has(p.id) && (q === "" ? p.pos === pos : p.name.includes(q)))
      .sort((a, b) => {
        const ap = a.pos === pos ? 1 : 0;
        const bp = b.pos === pos ? 1 : 0;
        if (ap !== bp) return bp - ap;
        if (clubKey) {
          const ac = a.clubKey === clubKey ? 1 : 0;
          const bc = b.clubKey === clubKey ? 1 : 0;
          if (ac !== bc) return bc - ac;
        }
        return b.ovr - a.ovr;
      })
      .slice(0, 40);
  }, [pool, pos, usedIds, search, clubKey, clubGroups]);

  function pickCustom() {
    const n = customName.trim();
    if (!n) return;
    onCustom(n);
    setCustomName("");
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-white/[0.04]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-900 dark:text-white">{label}</span>
        <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!benchMode && (
        <button
          type="button"
          onClick={onDelete}
          className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> {filled ? "이 선수 빼기" : "이 자리 삭제"}
        </button>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="선수 이름 검색"
        className="mb-2 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
      />

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
        {(clubGroups ?? [{ pos: null as Pos | null, players: candidates }]).map((g) => (
          <div key={g.pos ?? "all"} className="space-y-1.5">
            {g.pos && clubGroups && (
              <p className="sticky top-0 z-10 -mx-1 bg-white px-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:bg-neutral-900">
                {POS_KO[g.pos]} <span className="font-normal">{g.players.length}</span>
              </p>
            )}
            {g.players.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p)}
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
                  <span className="block truncate text-sm font-medium text-neutral-900 dark:text-white">
                    {p.name}
                    {p.number != null && <span className="ml-1 font-normal text-neutral-400">({p.number})</span>}
                    {p.isNew && <span className="ml-1.5 rounded bg-rose-500/10 px-1 py-0.5 align-middle text-[9px] font-bold text-rose-600 dark:text-rose-400">NEW</span>}
                  </span>
                  <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">{p.team}</span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
