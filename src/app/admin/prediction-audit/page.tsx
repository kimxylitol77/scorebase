import Link from "next/link";
import { Prisma } from "@prisma/client";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { POSTMORTEM_CAUSE_LABELS } from "@/lib/predict/postmortem";
import { runPredictionAuditNow } from "./actions";

export const dynamic = "force-dynamic";

const PER_PAGE = 40;

const CAUSE_STYLES: Record<string, string> = {
  CORRECT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  DATA_GAP: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
  PERSONNEL_UNAVAILABLE_AT_PICK: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  PERSONNEL_CHANGED: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  MARKET_MOVED_AGAINST: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  OVERCONFIDENT: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
  RED_CARD_EVENT: "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200",
  XG_RESULT_GAP: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  MODEL_MISS: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

interface Props {
  searchParams: Promise<{
    model?: string;
    market?: string;
    cause?: string;
    result?: string;
    page?: string;
    graded?: string;
    analyzed?: string;
  }>;
}

function percent(numerator: number, denominator: number): string {
  return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : "-";
}

function formatDate(value: Date): string {
  return value.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function evidenceFlags(value: Prisma.JsonValue): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const flags = (value as Record<string, unknown>).flags;
  return Array.isArray(flags) ? flags.filter((flag): flag is string => typeof flag === "string") : [];
}

export default async function PredictionAuditPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const model = sp.model ?? "ALL";
  const market = sp.market ?? "ALL";
  const cause = sp.cause ?? "ALL";
  const result = sp.result ?? "ALL";
  const requestedPage = Math.max(1, Number(sp.page ?? "1") || 1);

  const scopeWhere: Prisma.PredictionPostmortemWhereInput = {};
  if (model !== "ALL") scopeWhere.model = model;
  if (market !== "ALL") scopeWhere.market = market;

  const listWhere: Prisma.PredictionPostmortemWhereInput = { ...scopeWhere };
  if (cause !== "ALL") listWhere.primaryCause = cause;
  if (result === "CORRECT") listWhere.correct = true;
  if (result === "WRONG") listWhere.correct = false;

  const [
    total,
    correct,
    actionableWrong,
    quality,
    pendingSnapshots,
    causeGroups,
    modelRows,
    listCount,
  ] = await Promise.all([
    prisma.predictionPostmortem.count({ where: scopeWhere }),
    prisma.predictionPostmortem.count({ where: { ...scopeWhere, correct: true } }),
    prisma.predictionPostmortem.count({
      where: { ...scopeWhere, correct: false, actionable: true },
    }),
    prisma.predictionPostmortem.aggregate({ where: scopeWhere, _avg: { dataQuality: true } }),
    prisma.predictionContextSnapshot.count({
      where: { stage: "PREDICTION", reviewedAt: null },
    }),
    prisma.predictionPostmortem.groupBy({
      by: ["primaryCause"],
      where: { ...scopeWhere, correct: false },
      _count: { _all: true },
      orderBy: { _count: { primaryCause: "desc" } },
    }),
    prisma.predictionContextSnapshot.findMany({
      distinct: ["model"],
      select: { model: true },
      orderBy: { model: "asc" },
    }),
    prisma.predictionPostmortem.count({ where: listWhere }),
  ]);

  const wrong = total - correct;
  const totalPages = Math.max(1, Math.ceil(listCount / PER_PAGE));
  const page = Math.min(requestedPage, totalPages);
  const rows = await prisma.predictionPostmortem.findMany({
    where: listWhere,
    orderBy: { analyzedAt: "desc" },
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
    include: {
      prediction: {
        select: { pick: true, prob: true, line: true, predictedAt: true },
      },
      match: {
        select: {
          league: true,
          startTime: true,
          homeScore: true,
          awayScore: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });
  const maxCauseCount = Math.max(1, ...causeGroups.map((group) => group._count._all));

  const baseParams = new URLSearchParams();
  if (model !== "ALL") baseParams.set("model", model);
  if (market !== "ALL") baseParams.set("market", market);
  if (cause !== "ALL") baseParams.set("cause", cause);
  if (result !== "ALL") baseParams.set("result", result);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/admin"
            className="text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-white"
          >
            관리자 메인
          </Link>
          <div className="mt-2 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald-600" aria-hidden="true" />
            <h1 className="text-2xl font-bold">AI 예측 감사</h1>
          </div>
          <p className="mt-1 text-sm text-neutral-500">관리자 전용 · 회원 화면 미노출 · 규칙 v1</p>
        </div>
        <form action={runPredictionAuditNow}>
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-neutral-900 px-3 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            title="종료 경기 채점 후 새 오답 분석 실행"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            지금 분석
          </button>
        </form>
      </header>

      {sp.analyzed != null && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          채점 {sp.graded ?? "0"}건 · 신규 분석 {sp.analyzed}건 완료
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="예측 감사 요약">
        <Metric label="분석 시장" value={total.toLocaleString()} />
        <Metric label="적중률" value={percent(correct, total)} detail={`${correct}/${total}`} />
        <Metric label="개선 가능 오답" value={actionableWrong.toLocaleString()} detail={percent(actionableWrong, wrong)} />
        <Metric label="평균 데이터 품질" value={quality._avg.dataQuality == null ? "-" : `${quality._avg.dataQuality.toFixed(0)}점`} />
        <Metric label="분석 대기" value={pendingSnapshots.toLocaleString()} detail="경기·모델" />
      </section>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 border-y border-neutral-200 py-4 dark:border-neutral-800"
      >
        <FilterSelect name="model" label="모델" value={model}>
          <option value="ALL">전체</option>
          {modelRows.map((row) => <option key={row.model} value={row.model}>{row.model}</option>)}
        </FilterSelect>
        <FilterSelect name="market" label="시장" value={market}>
          <option value="ALL">전체</option>
          <option value="1X2">1X2</option>
          <option value="HANDICAP">핸디캡</option>
          <option value="OU">오버/언더</option>
        </FilterSelect>
        <FilterSelect name="result" label="결과" value={result}>
          <option value="ALL">전체</option>
          <option value="WRONG">오답</option>
          <option value="CORRECT">적중</option>
        </FilterSelect>
        <FilterSelect name="cause" label="우선 분류" value={cause}>
          <option value="ALL">전체</option>
          {Object.entries(POSTMORTEM_CAUSE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </FilterSelect>
        <button
          type="submit"
          className="h-9 rounded-md border border-neutral-300 px-3 text-sm font-semibold transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          적용
        </button>
        <Link href="/admin/prediction-audit" className="flex h-9 items-center px-2 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
          초기화
        </Link>
      </form>

      <section className="grid gap-6 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,2.2fr)]">
        <div className="space-y-3">
          <h2 className="text-sm font-bold">오답 신호 분포</h2>
          {causeGroups.length === 0 ? (
            <p className="border-t border-neutral-200 py-6 text-sm text-neutral-500 dark:border-neutral-800">수집된 오답이 없습니다.</p>
          ) : (
            <div className="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              {causeGroups.map((group) => (
                <div key={group.primaryCause}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate">{POSTMORTEM_CAUSE_LABELS[group.primaryCause] ?? group.primaryCause}</span>
                    <span className="tabular-nums text-neutral-500">{group._count._all}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-rose-500"
                      style={{ width: `${(group._count._all / maxCauseCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold">분석 기록</h2>
            <span className="text-xs tabular-nums text-neutral-500">{listCount.toLocaleString()}건</span>
          </div>
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-neutral-300 px-4 py-12 text-center text-sm text-neutral-500 dark:border-neutral-700">
              새 예측부터 경기 전 스냅샷이 저장됩니다.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">경기</th>
                    <th className="px-3 py-2.5 text-left font-medium">모델·시장</th>
                    <th className="px-3 py-2.5 text-left font-medium">예측</th>
                    <th className="px-3 py-2.5 text-left font-medium">결과</th>
                    <th className="px-3 py-2.5 text-left font-medium">우선 분류</th>
                    <th className="px-3 py-2.5 text-right font-medium">품질</th>
                    <th className="px-3 py-2.5 text-right font-medium">배당 이동</th>
                    <th className="px-3 py-2.5 text-right font-medium">분석 시각</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {rows.map((row) => {
                    const flags = evidenceFlags(row.evidence);
                    return (
                      <tr key={row.id} className="align-top hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                        <td className="px-3 py-3">
                          <div className="font-medium">{row.match.homeTeam.name} vs {row.match.awayTeam.name}</div>
                          <div className="mt-1 text-xs text-neutral-500">
                            {row.match.league} · {formatDate(row.match.startTime)}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium">{row.model}</div>
                          <div className="mt-1 text-xs text-neutral-500">{row.market}{row.prediction.line != null ? ` ${row.prediction.line}` : ""}</div>
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          <div className="font-semibold">{row.prediction.pick}</div>
                          <div className="mt-1 text-xs text-neutral-500">{(row.prediction.prob * 100).toFixed(1)}%</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className={row.correct ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                            {row.correct ? "적중" : "오답"}
                          </div>
                          <div className="mt-1 text-xs tabular-nums text-neutral-500">
                            {row.match.homeScore ?? "-"} : {row.match.awayScore ?? "-"}
                          </div>
                        </td>
                        <td className="max-w-[260px] px-3 py-3">
                          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${CAUSE_STYLES[row.primaryCause] ?? CAUSE_STYLES.MODEL_MISS}`}>
                            {POSTMORTEM_CAUSE_LABELS[row.primaryCause] ?? row.primaryCause}
                          </span>
                          {row.actionable && <span className="ml-1.5 text-xs font-semibold text-rose-600">개선 후보</span>}
                          {flags.length > 0 && (
                            <div className="mt-1.5 truncate text-[11px] text-neutral-400" title={flags.join(", ")}>
                              {flags.slice(0, 3).join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{row.dataQuality}</td>
                        <td className={`px-3 py-3 text-right tabular-nums ${row.marketMovePp != null && row.marketMovePp <= -4 ? "font-semibold text-rose-600" : "text-neutral-500"}`}>
                          {row.marketMovePp == null ? "-" : `${row.marketMovePp > 0 ? "+" : ""}${row.marketMovePp.toFixed(2)}%p`}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right text-xs text-neutral-500">{formatDate(row.analyzedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {totalPages > 1 && (
        <nav className="flex items-center justify-end gap-2 text-sm" aria-label="페이지 이동">
          <PageLink page={page - 1} disabled={page <= 1} params={baseParams}>이전</PageLink>
          <span className="px-2 text-xs tabular-nums text-neutral-500">{page}/{totalPages}</span>
          <PageLink page={page + 1} disabled={page >= totalPages} params={baseParams}>다음</PageLink>
        </nav>
      )}
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <strong className="text-xl tabular-nums">{value}</strong>
        {detail && <span className="text-xs tabular-nums text-neutral-400">{detail}</span>}
      </div>
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-neutral-500">
      {label}
      <select
        name={name}
        defaultValue={value}
        className="h-9 min-w-32 rounded-md border border-neutral-300 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
      >
        {children}
      </select>
    </label>
  );
}

function PageLink({
  page,
  disabled,
  params,
  children,
}: {
  page: number;
  disabled: boolean;
  params: URLSearchParams;
  children: React.ReactNode;
}) {
  if (disabled) return <span className="rounded-md border border-neutral-200 px-3 py-1.5 text-neutral-300 dark:border-neutral-800 dark:text-neutral-700">{children}</span>;
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return <Link href={`/admin/prediction-audit?${next.toString()}`} className="rounded-md border border-neutral-300 px-3 py-1.5 transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">{children}</Link>;
}
