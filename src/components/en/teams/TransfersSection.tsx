// components__teams__TransfersSection (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

"use client";

import { useEffect, useState } from "react";
import { toEnglishTeamName } from "@/lib/i18n/en";

interface Item {
  playerId: number;
  playerName: string;
  date: string;
  type: string;
  direction: "in" | "out";
  oppTeam: string;
  oppLogo?: string;
}

interface Props {
  teamId: number;
}

const TYPE_KO: Record<string, string> = {
  Loan: "Loan",
  "Loan return": "Loan return",
  "Free transfer": "Free transfer",
  Free: "Free transfer",
  "N/A": "—",
};

export default function TransfersSection({ teamId }: Props) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/transfers/team/${teamId}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { items?: Item[] };
        if (!alive) return;
        setItems(j.items ?? []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [teamId]);

  if (loading) return null;
  if (!items || items.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 mb-3">
        🔄 Recent transfers
      </h2>
      <div className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 overflow-hidden">
        <ul className="divide-y divide-neutral-100 dark:divide-white/5">
          {items.map((it, i) => {
            const playerKo = it.playerName;
            const oppKo = toEnglishTeamName(it.oppTeam);
            const typeKo = TYPE_KO[it.type] ?? it.type;
            const isIn = it.direction === "in";
            return (
              <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span
                  className={`shrink-0 inline-flex items-center justify-center w-12 text-[10px] font-bold rounded-md py-1 ${
                    isIn
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400"
                  }`}
                >
                  {isIn ? "In" : "Out"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{playerKo}</div>
                  <div className="text-[11px] text-neutral-500 truncate">
                    {isIn ? "← " : "→ "}
                    {oppKo}
                    {typeKo !== "—" && <span className="text-neutral-400"> · {typeKo}</span>}
                  </div>
                </div>
                <span className="text-[10px] text-neutral-400 tabular-nums whitespace-nowrap">
                  {it.date}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
