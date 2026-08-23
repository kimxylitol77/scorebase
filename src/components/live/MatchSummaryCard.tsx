// 경기 상세 최상단 요약 카드 — 시장 확률 vs AI 확률·최대 차이·결장·라인업 확정·배당 변동·모델 신뢰도·위험 요소.
// AI 수치를 먼저 내세우지 않고 근거(시장 대비)와 위험을 같은 카드에 둔다 (2026-08-22 리뷰 반영).
// 데이터가 없는 칸은 "데이터 없음"으로 비워 두고 절대 추정치로 채우지 않는다.

import Link from "next/link";

export interface SummaryProb {
  home: number;
  draw: number | null;
  away: number;
}

export interface MatchSummaryCardProps {
  homeNameKo: string;
  awayNameKo: string;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
  /** AI 모델 확률 (0~1) */
  ai: SummaryProb | null;
  /** 시장 평균 확률 — 마진 제거 후 (0~1) */
  market: SummaryProb | null;
  /** 시장 평균 배당 (마진 포함 raw implied 산출용) */
  rawOdds: { home: number | null; draw: number | null; away: number | null } | null;
  /** 평균에 들어간 북메이커 수 */
  bookmakers: number | null;
  /** 주요 결장 (예상 XI 포함 여부 기준 상위) */
  absences: { home: string[]; away: string[] } | null;
  lineup: "confirmed" | "predicted" | "none";
  /** 배당 흐름 — 오프닝 대비 현재 홈/원정 배당 변화율 (+ 상승 / − 하락) */
  oddsMove: { home: number; away: number; points: number } | null;
  /** 모델 신뢰도 재료 — 유사 확률대 표본·보정 오차 */
  calibration: { sampleSize: number; gapPts: number } | null;
  injuriesHref?: string | null;
}

const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const pts = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%p`;

/** 시장 raw implied (마진 포함) — 1/odds, 정규화 안 함 */
function rawImplied(o: number | null): number | null {
  return o != null && o > 0 ? 1 / o : null;
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold tracking-wider uppercase text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="mt-0.5 text-[13px] text-neutral-900 dark:text-neutral-100 break-keep">{children}</div>
    </div>
  );
}

export default function MatchSummaryCard(p: MatchSummaryCardProps) {
  const { homeNameKo, awayNameKo, ai, market, rawOdds, bookmakers, absences, lineup, oddsMove, calibration } = p;
  if (!ai && !market && !absences && lineup === "none" && !oddsMove) return null;

  const sides: Array<{ key: "home" | "draw" | "away"; label: string }> = [
    { key: "home", label: `${homeNameKo} 승` },
    { key: "draw", label: "무승부" },
    { key: "away", label: `${awayNameKo} 승` },
  ];
  const hasDraw = (ai?.draw ?? market?.draw) != null;
  const rows = sides.filter((s) => s.key !== "draw" || hasDraw);

  // 가장 큰 AI-시장 차이
  let best: { label: string; diff: number; aiV: number; mkV: number } | null = null;
  if (ai && market) {
    for (const s of rows) {
      const a = ai[s.key];
      const m = market[s.key];
      if (a == null || m == null) continue;
      const d = a - m;
      if (!best || Math.abs(d) > Math.abs(best.diff)) best = { label: s.label, diff: d, aiV: a, mkV: m };
    }
  }
  const diffState = (d: number) =>
    d >= 0.05
      ? "AI 가 시장보다 높게 봄 — 참고 가능한 가치 차이"
      : d <= -0.05
        ? "시장이 AI 보다 높게 봄 — AI 과소평가 또는 모델 한계"
        : Math.abs(d) >= 0.02
          ? "작은 차이"
          : "시장과 거의 일치";

  // 모델 신뢰도 — 유사 확률대 표본과 보정 오차로만 판정 (없으면 "산출 불가")
  const conf = calibration
    ? calibration.sampleSize >= 80 && calibration.gapPts < 5
      ? { label: "높음", cls: "text-emerald-600 dark:text-emerald-400" }
      : calibration.sampleSize >= 30
        ? { label: "보통", cls: "text-amber-600 dark:text-amber-400" }
        : { label: "낮음", cls: "text-rose-600 dark:text-rose-400" }
    : null;

  // 위험 요소 — 데이터로 판정되는 것만
  const risks: string[] = [];
  if (p.status === "SCHEDULED" && lineup !== "confirmed") risks.push(lineup === "predicted" ? "라인업 미확정 (예상 XI 기준)" : "라인업 정보 없음");
  const absN = (absences?.home.length ?? 0) + (absences?.away.length ?? 0);
  if (absN >= 3) risks.push(`결장 ${absN}명 — 전력 변동 가능`);
  if (oddsMove && Math.max(Math.abs(oddsMove.home), Math.abs(oddsMove.away)) >= 0.08) risks.push("배당 급변 — 시장 재평가 중");
  if (best && Math.abs(best.diff) >= 0.1) risks.push("AI-시장 괴리 큼 — 모델 과신 주의");
  if (calibration && calibration.gapPts >= 5) risks.push(`유사 경기에서 모델 보정 오차 ${calibration.gapPts.toFixed(1)}%p`);
  if (!market) risks.push("시장 배당 없음 — AI 단독 판단");
  if (bookmakers != null && bookmakers > 0 && bookmakers < 5) risks.push(`배당 표본 ${bookmakers}곳 — 시장 평균 신뢰 낮음`);

  return (
    <section
      aria-labelledby="match-summary-title"
      className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4 sm:p-5 space-y-4"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 id="match-summary-title" className="text-sm font-bold tracking-tight">경기 요약</h2>
        <span className="text-[11px] text-neutral-500">시장 vs AI · 결장 · 위험 요소</span>
      </header>

      {/* 확률 비교표 */}
      {(ai || market) && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] tabular-nums">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="text-left font-semibold py-1">결과</th>
                <th className="text-right font-semibold py-1">AI 확률</th>
                <th className="text-right font-semibold py-1">경기 전 시장(마진 제거)</th>
                <th className="text-right font-semibold py-1 hidden sm:table-cell">경기 전 시장(마진 포함)</th>
                <th className="text-right font-semibold py-1">차이</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-white/10">
              {rows.map((s) => {
                const a = ai?.[s.key] ?? null;
                const m = market?.[s.key] ?? null;
                const r = rawOdds ? rawImplied(rawOdds[s.key]) : null;
                const d = a != null && m != null ? a - m : null;
                return (
                  <tr key={s.key}>
                    <td className="py-1.5 pr-2 font-medium truncate max-w-[9rem]">{s.label}</td>
                    <td className="py-1.5 text-right font-bold">{pct(a)}</td>
                    <td className="py-1.5 text-right">{pct(m)}</td>
                    <td className="py-1.5 text-right text-neutral-500 hidden sm:table-cell">{pct(r)}</td>
                    <td className={`py-1.5 text-right font-semibold ${d == null ? "text-neutral-400" : d > 0.02 ? "text-emerald-600 dark:text-emerald-400" : d < -0.02 ? "text-rose-600 dark:text-rose-400" : "text-neutral-500"}`}>
                      {d == null ? "—" : pts(d)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1.5 text-[11px] text-neutral-500 break-keep">
            시장 확률은 {bookmakers ? `해외 ${bookmakers}곳 경기 전 평균 배당` : "경기 전 평균 배당"}의 역수를 합이 100%가 되게 정규화한 값(마진 제거)입니다. 실시간 배당은 아래 배당 섹션에 따로 있습니다(표본이 달라 값이 다를 수 있음).
            {best && (
              <>
                {" "}가장 큰 차이는 <strong className="text-neutral-800 dark:text-neutral-200">{best.label} {pts(best.diff)}</strong> — {diffState(best.diff)}.
              </>
            )}
            {" "}AI 예측은 경기 결과를 보장하지 않습니다.
          </p>
        </div>
      )}

      {/* 상태 격자 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 pt-3 border-t border-neutral-100 dark:border-white/10">
        <Cell label="라인업">
          {lineup === "confirmed" ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">확정 라인업</span>
          ) : lineup === "predicted" ? (
            <span className="text-amber-600 dark:text-amber-400 font-semibold">예상 라인업</span>
          ) : (
            <span className="text-neutral-400">데이터 없음</span>
          )}
        </Cell>
        <Cell label="주요 결장">
          {absences && absN > 0 ? (
            <span>
              {absences.home.slice(0, 2).join(", ")}
              {absences.home.length > 2 ? ` 외 ${absences.home.length - 2}` : ""}
              {absences.home.length > 0 && absences.away.length > 0 ? " · " : ""}
              {absences.away.slice(0, 2).join(", ")}
              {absences.away.length > 2 ? ` 외 ${absences.away.length - 2}` : ""}
              {p.injuriesHref && (
                <Link href={p.injuriesHref} className="ml-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline">
                  명단
                </Link>
              )}
            </span>
          ) : absences ? (
            <span className="text-neutral-500">확인된 결장 없음</span>
          ) : (
            <span className="text-neutral-400">데이터 없음</span>
          )}
        </Cell>
        <Cell label="배당 변동">
          {oddsMove ? (
            <span>
              <span className={oddsMove.home < 0 ? "text-rose-600 dark:text-rose-400" : oddsMove.home > 0 ? "text-blue-600 dark:text-blue-400" : ""}>
                홈 {oddsMove.home > 0 ? "▲" : oddsMove.home < 0 ? "▼" : "—"} {Math.abs(oddsMove.home * 100).toFixed(1)}%
              </span>
              {" · "}
              <span className={oddsMove.away < 0 ? "text-rose-600 dark:text-rose-400" : oddsMove.away > 0 ? "text-blue-600 dark:text-blue-400" : ""}>
                원정 {oddsMove.away > 0 ? "▲" : oddsMove.away < 0 ? "▼" : "—"} {Math.abs(oddsMove.away * 100).toFixed(1)}%
              </span>
              <span className="block text-[10px] text-neutral-400">오프닝 대비 · {oddsMove.points}회 기록 · ▼=돈 몰림</span>
            </span>
          ) : (
            <span className="text-neutral-400">기록 없음</span>
          )}
        </Cell>
        <Cell label="모델 신뢰도">
          {conf && calibration ? (
            <span>
              <span className={`font-semibold ${conf.cls}`}>{conf.label}</span>
              <span className="block text-[10px] text-neutral-400">유사 확률대 {calibration.sampleSize}경기 · 보정 오차 {calibration.gapPts.toFixed(1)}%p</span>
            </span>
          ) : (
            <span className="text-neutral-400">표본 부족</span>
          )}
        </Cell>
      </div>

      {/* 위험 요소 */}
      <div className="pt-3 border-t border-neutral-100 dark:border-white/10">
        <div className="text-[10px] font-semibold tracking-wider uppercase text-neutral-500 dark:text-neutral-400">주요 위험 요소</div>
        {risks.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-[12px] text-neutral-700 dark:text-neutral-300">
            {risks.map((r) => (
              <li key={r} className="flex gap-1.5">
                <span className="text-amber-500" aria-hidden>•</span>
                <span className="break-keep">{r}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[12px] text-neutral-500">기준을 넘은 위험 요소가 없습니다.</p>
        )}
      </div>
    </section>
  );
}
