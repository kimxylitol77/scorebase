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
}

export default function CandidatePanel({ pool, pos, clubKey, label, filled, usedIds, onPick, onCustom, onDelete, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [customName, setCustomName] = useState("");

  const candidates = useMemo(() => {
    const q = search.trim();
    return pool
      .filter((p) => p.pos === pos && !usedIds.has(p.id) && (q === "" || p.name.includes(q)))
      .sort((a, b) => {
        // 선택한 팀의 선수를 먼저 — 선수 교체 시 같은 팀 후보가 위로 오게.
        if (clubKey) {
          const ac = a.clubKey === clubKey ? 1 : 0;
          const bc = b.clubKey === clubKey ? 1 : 0;
          if (ac !== bc) return bc - ac;
        }
        return b.ovr - a.ovr;
      })
      .slice(0, 40);
  }, [pool, pos, usedIds, search, clubKey]);

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

      <button
        type="button"
        onClick={onDelete}
        className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
      >
        <Trash2 className="h-3.5 w-3.5" /> {filled ? "이 선수 빼기" : "이 자리 삭제"}
      </button>

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
        {candidates.map((p) => (
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
              <span className="block truncate text-sm font-medium text-neutral-900 dark:text-white">{p.name}</span>
              <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">{p.team}</span>
            </span>
            <span className="flex-shrink-0 text-sm font-semibold text-neutral-900 dark:text-white">{p.ovr}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
