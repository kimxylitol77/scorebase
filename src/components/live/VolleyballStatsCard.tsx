"use client";
// 배구 경기 상세 기술 통계 — TheSports detail_live.stats 를 경기 전체·세트별 탭으로 보여준다.
import { useState } from "react";

// ts 배구 stat 코드 — 2026-09-27 아시안게임 인도-베트남 실측으로 역산(6+9=총득점, 8=6/7, 11=9/10).
// 예전 라벨("서브 득점 성공"·"리시브 성공")은 에이스·리시브로 오해되는 이름이라 뜻대로 바꿨다.
const STAT: Record<number, { label: string; pct?: boolean }> = {
  3: { label: "득점" },
  1: { label: "서브 에이스" },
  4: { label: "서브 범실" },
  6: { label: "브레이크 득점 (내 서브 때)" },
  7: { label: "서브 횟수" },
  8: { label: "브레이크 성공률", pct: true },
  9: { label: "사이드아웃 득점 (상대 서브 때)" },
  10: { label: "상대 서브 횟수" },
  11: { label: "사이드아웃 성공률", pct: true },
  2: { label: "최다 연속 득점" },
  5: { label: "타임아웃" },
};
const ORDER = [3, 1, 4, 6, 7, 8, 9, 10, 11, 2, 5];

type Row = [number, number, number];

function fmt(v: number, pct?: boolean): string {
  if (!pct) return String(v);
  // 비율은 0~1 소수로 온다 — 혹시 이미 퍼센트면 그대로
  const p = v <= 1 ? v * 100 : v;
  return `${Math.round(p)}%`;
}

export default function VolleyballStatsCard({
  stats,
  homeKo,
  awayKo,
}: {
  stats?: unknown[] | null;
  homeKo: string;
  awayKo: string;
}) {
  const periods = (Array.isArray(stats) ? stats : [])
    .filter((s): s is [number, unknown[]] => Array.isArray(s) && Array.isArray(s[1]) && s[1].length > 0)
    .map(([n, rows]) => ({
      n: Number(n),
      rows: rows.filter((r): r is Row => Array.isArray(r) && r.length >= 3 && STAT[Number(r[0])] != null),
    }))
    .filter((p) => Number.isFinite(p.n) && p.rows.length > 0)
    .sort((a, b) => a.n - b.n);
  const [sel, setSel] = useState(0);
  if (periods.length === 0) return null;
  const cur = periods.find((p) => p.n === sel) ?? periods[0];
  const byId = new Map(cur.rows.map((r) => [Number(r[0]), r]));

  return (
    <div className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">기술 통계</span>
        {periods.length > 1 && (
          <div className="flex gap-1 overflow-x-auto">
            {periods.map((p) => (
              <button
                key={p.n}
                type="button"
                onClick={() => setSel(p.n)}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                  p.n === cur.n
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "bg-neutral-100 text-neutral-500 hover:text-neutral-800 dark:bg-white/[0.06] dark:text-neutral-400"
                }`}
              >
                {p.n === 0 ? "전체" : `${p.n}세트`}
              </button>
            ))}
          </div>
        )}
      </div>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-[11px] text-neutral-500">
            <th className="text-left font-medium pb-2 truncate max-w-[100px]">{homeKo}</th>
            <th className="text-center font-medium pb-2">항목</th>
            <th className="text-right font-medium pb-2 truncate max-w-[100px]">{awayKo}</th>
          </tr>
        </thead>
        <tbody>
          {ORDER.filter((id) => byId.has(id)).map((id) => {
            const [, h, a] = byId.get(id)!;
            const s = STAT[id];
            // 범실·타임아웃은 적을수록 좋은 게 아니라 중립 — 강조하지 않는다
            const neutral = id === 4 || id === 5 || id === 7 || id === 10;
            return (
              <tr key={id} className="border-t border-black/5 dark:border-white/5">
                <td className={`py-1.5 text-left font-bold ${!neutral && h > a ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{fmt(h, s.pct)}</td>
                <td className="py-1.5 text-center text-neutral-500 text-xs break-keep">{s.label}</td>
                <td className={`py-1.5 text-right font-bold ${!neutral && a > h ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{fmt(a, s.pct)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] leading-snug text-neutral-400 break-keep">
        브레이크는 내 서브 차례에 딴 점수, 사이드아웃은 상대 서브를 받아 딴 점수입니다. 두 값을 더하면 총 득점입니다.
      </p>
    </div>
  );
}
