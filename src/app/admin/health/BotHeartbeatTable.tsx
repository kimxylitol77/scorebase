"use client";

import { useMemo, useState } from "react";

export interface BotRow {
  name: string;
  ko: string;
  role: string;
  status: "정상" | "지연" | "다운";
  statusColor: "emerald" | "amber" | "rose";
  lastAtIso: string;
  ageMs: number;
  intervalMs: number;
  provider?: string | null;
  model?: string | null;
  host?: string | null;
}

type SortKey = "name" | "ko" | "status" | "lastAt" | "interval";
type Dir = "asc" | "desc";

const STATUS_ORDER: Record<BotRow["status"], number> = {
  다운: 0,
  지연: 1,
  정상: 2,
};

function fmtAge(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}초`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}분`;
  if (ms < 86400_000) return `${(ms / 3600_000).toFixed(1)}시간`;
  return `${Math.round(ms / 86400_000)}일`;
}

function fmtKstShort(iso: string): string {
  const d = new Date(iso);
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${String(k.getUTCMonth() + 1).padStart(2, "0")}/${String(k.getUTCDate()).padStart(2, "0")} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

export default function BotHeartbeatTable({ rows }: { rows: BotRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [dir, setDir] = useState<Dir>("asc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "ko":
          cmp = a.ko.localeCompare(b.ko);
          break;
        case "status":
          cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          if (cmp === 0) cmp = b.ageMs - a.ageMs;
          break;
        case "lastAt":
          cmp = a.ageMs - b.ageMs;
          break;
        case "interval":
          cmp = a.intervalMs - b.intervalMs;
          break;
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, dir]);

  const toggle = (key: SortKey) => {
    if (sortKey === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDir("asc");
    }
  };

  const arrow = (key: SortKey) =>
    sortKey === key ? (dir === "asc" ? " ▲" : " ▼") : "";

  const statusBadge = (s: BotRow["status"], color: BotRow["statusColor"]) => {
    const map = {
      emerald: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
      amber: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400",
      rose: "bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400",
    } as const;
    return (
      <span
        className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${map[color]}`}
      >
        ● {s}
      </span>
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.03] text-xs text-neutral-600 dark:text-neutral-400">
          <tr>
            <Th onClick={() => toggle("status")}>
              상태{arrow("status")}
            </Th>
            <Th onClick={() => toggle("ko")}>
              봇{arrow("ko")}
            </Th>
            <Th onClick={() => toggle("lastAt")}>
              마지막 ping{arrow("lastAt")}
            </Th>
            <Th onClick={() => toggle("interval")}>
              예상 주기{arrow("interval")}
            </Th>
            <Th onClick={() => toggle("name")}>
              식별자{arrow("name")}
            </Th>
            <th className="px-3 py-2 text-left font-semibold">model</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-white/10">
          {sorted.map((r) => (
            <tr key={r.name} className="hover:bg-neutral-50 dark:hover:bg-white/[0.02]">
              <td className="px-3 py-2 whitespace-nowrap">{statusBadge(r.status, r.statusColor)}</td>
              <td className="px-3 py-2">
                <div className="font-semibold">{r.ko}</div>
                <div className="text-[11px] text-neutral-500">{r.role}</div>
              </td>
              <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                <div>{fmtKstShort(r.lastAtIso)} KST</div>
                <div className="text-[11px] text-neutral-500">{fmtAge(r.ageMs)} 전</div>
              </td>
              <td className="px-3 py-2 tabular-nums text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                {fmtAge(r.intervalMs)}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-neutral-500">{r.name}</td>
              <td className="px-3 py-2 text-[11px] text-neutral-500">
                {r.provider || ""}
                {r.provider && r.model ? " · " : ""}
                {r.model || ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className="px-3 py-2 text-left font-semibold cursor-pointer select-none hover:text-neutral-900 dark:hover:text-neutral-200 whitespace-nowrap"
    >
      {children}
    </th>
  );
}
