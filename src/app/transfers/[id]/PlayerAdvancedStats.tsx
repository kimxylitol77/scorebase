"use client";
// 선수 시즌 상세 스탯 펼치기 패널 — FotMob 구조(카테고리별 스탯 + 순위 바) + 우리 라이트/다크 톤.
// 값은 api-football 시즌 통계, 순위 바는 동일 포지션군 백분위(서버 산출). 합계/90분당 토글.

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface AdvancedStat {
  minutes?: number | null;
  goals?: number | null; assists?: number | null;
  shots?: number | null; sot?: number | null;
  keyPasses?: number | null; passAcc?: number | null;
  tackles?: number | null; interceptions?: number | null; blocks?: number | null;
  dribbles?: number | null; dribbleAtt?: number | null; dribbledPast?: number | null;
  duelsWon?: number | null; duelsTotal?: number | null;
  foulsDrawn?: number | null; foulsCommitted?: number | null;
  yellow?: number | null; red?: number | null;
}

type Row = {
  label: string;
  key: keyof AdvancedStat;
  /** 백분위 조회 키 (pct 맵) — 없으면 label 재사용 */
  pctKey?: string;
  /** 개수형(90분당 환산 O) vs 비율형(% 그대로) */
  kind: "count" | "pct";
  /** 비율 계산: 분자/분모 (kind=pct 이고 직접 필드가 아닐 때) */
  ratio?: [keyof AdvancedStat, keyof AdvancedStat];
  /** 낮을수록 좋음(반칙·제쳐짐) */
  invert?: boolean;
};

const CATEGORIES: { title: string; rows: Row[] }[] = [
  {
    title: "슈팅",
    rows: [
      { label: "득점", key: "goals", kind: "count" },
      { label: "슛", key: "shots", kind: "count" },
      { label: "유효 슈팅", key: "sot", kind: "count" },
      { label: "슈팅 정확도", key: "sot", pctKey: "shotAcc", kind: "pct", ratio: ["sot", "shots"] },
    ],
  },
  {
    title: "패스·창출",
    rows: [
      { label: "어시스트", key: "assists", kind: "count" },
      { label: "기회 창출", key: "keyPasses", kind: "count" },
      { label: "패스 정확도", key: "passAcc", kind: "pct" },
    ],
  },
  {
    title: "드리블·경합",
    rows: [
      { label: "드리블 성공", key: "dribbles", kind: "count" },
      { label: "드리블 성공률", key: "dribbles", pctKey: "dribbleRate", kind: "pct", ratio: ["dribbles", "dribbleAtt"] },
      { label: "경합 성공", key: "duelsWon", kind: "count" },
      { label: "경합 성공률", key: "duelsWon", pctKey: "duelRate", kind: "pct", ratio: ["duelsWon", "duelsTotal"] },
    ],
  },
  {
    title: "수비",
    rows: [
      { label: "태클", key: "tackles", kind: "count" },
      { label: "가로채기", key: "interceptions", kind: "count" },
      { label: "블록", key: "blocks", kind: "count" },
      { label: "드리블에 제쳐짐", key: "dribbledPast", kind: "count", invert: true },
    ],
  },
  {
    title: "반칙",
    rows: [
      { label: "획득한 파울", key: "foulsDrawn", kind: "count" },
      { label: "범한 파울", key: "foulsCommitted", kind: "count", invert: true },
      { label: "경고", key: "yellow", kind: "count", invert: true },
      { label: "퇴장", key: "red", kind: "count", invert: true },
    ],
  },
];

function barColor(pct: number) {
  if (pct >= 66) return "bg-emerald-500";
  if (pct >= 33) return "bg-amber-500";
  return "bg-rose-500";
}

export default function PlayerAdvancedStats({
  stat,
  pct,
}: {
  stat: AdvancedStat;
  pct: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [per90, setPer90] = useState(false);
  const mins = stat.minutes ?? 0;

  const fmt = (row: Row): string | null => {
    if (row.kind === "pct") {
      let v: number | null;
      if (row.ratio) {
        const [a, b] = row.ratio;
        const na = stat[a], nb = stat[b];
        v = na != null && nb != null && nb > 0 ? (na / nb) * 100 : null;
      } else {
        v = stat[row.key] as number | null;
      }
      return v == null ? null : `${Math.round(v)}%`;
    }
    const raw = stat[row.key] as number | null;
    if (raw == null) return null;
    if (per90) return mins > 0 ? ((raw / mins) * 90).toFixed(2) : "0";
    return String(raw);
  };

  // 실제로 값이 있는 행만 (재빌드 전 null 필드 자동 생략)
  const cats = CATEGORIES.map((c) => ({
    title: c.title,
    rows: c.rows.filter((r) => fmt(r) != null),
  })).filter((c) => c.rows.length > 0);

  if (cats.length === 0) return null;

  return (
    <section className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 sm:px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="text-base font-bold tracking-tight">
          <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">시즌 성적 상세</span>
          <span className="ml-2 text-xs font-medium text-neutral-400">순위는 같은 포지션 대비 백분위</span>
        </span>
        <ChevronDown className={`h-5 w-5 text-neutral-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 sm:px-5 pb-5">
          {/* 합계 / 90분당 토글 */}
          <div className="flex justify-end mb-4">
            <div className="inline-flex rounded-full bg-neutral-100 dark:bg-white/[0.06] p-0.5 text-xs font-semibold">
              {[["합계", false], ["90분당", true]].map(([label, v]) => (
                <button
                  key={String(label)}
                  onClick={() => setPer90(v as boolean)}
                  className={`px-3 py-1 rounded-full transition-colors ${
                    per90 === v
                      ? "bg-white text-neutral-900 shadow-sm dark:bg-white/90"
                      : "text-neutral-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            {cats.map((c) => (
              <div key={c.title}>
                <div className="text-xs font-bold text-neutral-500 mb-2">{c.title}</div>
                <div className="space-y-2.5">
                  {c.rows.map((row) => {
                    const p = pct[row.pctKey ?? (row.key as string)] ?? 50;
                    return (
                      <div key={row.label} className="grid grid-cols-[1fr_auto_minmax(80px,140px)] items-center gap-3">
                        <span className="text-sm text-neutral-600 dark:text-neutral-300 truncate">{row.label}</span>
                        <span className="text-sm font-bold tabular-nums text-right min-w-[3rem]">{fmt(row)}</span>
                        <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-white/[0.08] overflow-hidden">
                          <div className={`h-full rounded-full ${barColor(p)}`} style={{ width: `${Math.max(4, p)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
