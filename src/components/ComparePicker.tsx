"use client";
// 선수 비교 피커 — 선수 2명을 검색·선택해 /compare/{a}/{b} 로 이동. 검색은 기존 /api/transfers/suggest 재사용(축구 선수).

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Search } from "lucide-react";

export interface PickPlayer {
  id: string;
  name: string;
  team: string;
  photo: string | null;
  value: string;
}

function Slot({
  side,
  player,
  onPick,
  onClear,
}: {
  side: "A" | "B";
  player: PickPlayer | null;
  onPick: (p: PickPlayer) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickPlayer[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ring = side === "A" ? "focus:ring-rose-400/50" : "focus:ring-cyan-400/50";
  const dot = side === "A" ? "bg-rose-500" : "bg-cyan-500";

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/transfers/suggest?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        setResults(Array.isArray(d.players) ? d.players : []);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 220);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  if (player) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 ring-1 ring-black/5 shadow-sm dark:bg-white/[0.04] dark:ring-white/10">
        <span className={`w-1.5 h-8 rounded-full shrink-0 ${dot}`} />
        {player.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.photo} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 bg-neutral-100 dark:bg-neutral-800" />
        ) : (
          <span className="w-9 h-9 rounded-full shrink-0 bg-neutral-100 dark:bg-neutral-800" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-bold truncate">{player.name}</span>
          <span className="block text-xs text-neutral-500 truncate">{player.team}</span>
        </span>
        <button onClick={onClear} className="shrink-0 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200" aria-label="선택 해제">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 ring-1 ring-black/5 shadow-sm focus-within:ring-2 dark:bg-white/[0.04] dark:ring-white/10">
        <span className={`w-1.5 h-8 rounded-full shrink-0 ${dot}`} />
        <Search className="w-4 h-4 text-neutral-400 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={`선수 ${side} 검색 (이름·초성)`}
          className={`w-full bg-transparent outline-none text-sm placeholder:text-neutral-400 ${ring}`}
        />
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1.5 w-full max-h-72 overflow-y-auto rounded-xl bg-white py-1 ring-1 ring-black/10 shadow-lg dark:bg-neutral-900 dark:ring-white/10">
          {results.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => {
                  onPick(p);
                  setQ("");
                  setResults([]);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-white/[0.05]"
              >
                {p.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photo} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 bg-neutral-100 dark:bg-neutral-800" />
                ) : (
                  <span className="w-8 h-8 rounded-full shrink-0 bg-neutral-100 dark:bg-neutral-800" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">{p.name}</span>
                  <span className="block text-xs text-neutral-500 truncate">{p.team}</span>
                </span>
                {p.value && <span className="text-xs text-cyan-600 dark:text-cyan-400 font-semibold tabular-nums shrink-0">{p.value}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ComparePicker({ initialA = null }: { initialA?: PickPlayer | null }) {
  const router = useRouter();
  const [a, setA] = useState<PickPlayer | null>(initialA);
  const [b, setB] = useState<PickPlayer | null>(null);
  const sameId = !!a && !!b && a.id === b.id;
  const ready = !!a && !!b && !sameId;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Slot side="A" player={a} onPick={setA} onClear={() => setA(null)} />
        <Slot side="B" player={b} onPick={setB} onClear={() => setB(null)} />
      </div>
      <button
        disabled={!ready}
        onClick={() => ready && router.push(`/compare/${a!.id}/${b!.id}`)}
        className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-cyan-500 py-3 text-sm font-bold text-white shadow-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] enabled:hover:-translate-y-0.5 enabled:hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
      >
        비교 보기
      </button>
      {sameId && <p className="text-center text-xs text-rose-500">같은 선수는 비교할 수 없습니다.</p>}
    </div>
  );
}
