// /admin/stats 의 기간별 카드 — 카드마다 7일·30일·전체 탭을 갖고, 다른 기간은 /api/admin/stats-range 로 한 번 받아 캐시한다.
// 초기값(7일)은 서버가 넘기고, 마운트 뒤 30일·전체를 순서대로 미리 받아 두어 탭을 누르면 대개 즉시 바뀐다.
// 상단 전역 기간 토글(페이지 전체 재요청, 수십 초)을 없애기 위해 만든 구조(2026-09-12). 계산은 lib/admin/stats-range 한 곳.
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BOT_CATEGORY_LABEL } from "@/lib/bot-detect";
import { DEVICE_LABEL } from "@/lib/device-detect";
import { CHANNEL_META } from "@/lib/referrer-channel";
import type { RangeStats, StatsRange } from "@/lib/admin/stats-range";
import { KpiCard, SectionCard, EmptyHint, ConcurrentHourChart, DAY_KO, RankRow } from "./StatsCards";

const LABEL: Record<StatsRange, string> = { "7d": "최근 7일", "30d": "최근 30일", all: "전체" };
const ORDER: StatsRange[] = ["7d", "30d", "all"];

interface Store {
  data: Partial<Record<StatsRange, RangeStats>>;
  loading: Partial<Record<StatsRange, boolean>>;
  failed: Partial<Record<StatsRange, string>>;
  ensure: (r: StatsRange) => void;
}
const Ctx = createContext<Store | null>(null);

export function RangeStatsProvider({ initial, children }: { initial: RangeStats; children: ReactNode }) {
  const [data, setData] = useState<Partial<Record<StatsRange, RangeStats>>>({ [initial.range]: initial });
  const [loading, setLoading] = useState<Partial<Record<StatsRange, boolean>>>({});
  const [failed, setFailed] = useState<Partial<Record<StatsRange, string>>>({});
  const inflight = useRef(new Set<StatsRange>());

  const ensure = useCallback((r: StatsRange) => {
    if (data[r] || inflight.current.has(r)) return;
    inflight.current.add(r);
    setLoading((s) => ({ ...s, [r]: true }));
    fetch(`/api/admin/stats-range?range=${r}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as RangeStats;
        setData((s) => ({ ...s, [r]: json }));
        setFailed((s) => ({ ...s, [r]: undefined }));
      })
      .catch((e: Error) => setFailed((s) => ({ ...s, [r]: e.message })))
      .finally(() => {
        inflight.current.delete(r);
        setLoading((s) => ({ ...s, [r]: false }));
      });
  }, [data]);

  // 마운트 뒤 나머지 기간을 순서대로 미리 받는다 — 30일 먼저, 그다음 전체(가장 느림).
  useEffect(() => {
    const t = setTimeout(() => {
      for (const r of ORDER) if (r !== initial.range) ensure(r);
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({ data, loading, failed, ensure }), [data, loading, failed, ensure]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 카드 하나의 기간 상태 — 탭·데이터·로딩. */
function useRangeCard(initialRange: StatsRange = "7d") {
  const store = useContext(Ctx);
  if (!store) throw new Error("RangeStatsProvider 밖에서 useRangeCard 호출");
  const [range, setRange] = useState<StatsRange>(initialRange);
  const pick = (r: StatsRange) => {
    setRange(r);
    store.ensure(r);
  };
  return { range, pick, data: store.data[range] ?? null, loading: !!store.loading[range], failed: store.failed[range], retry: () => store.ensure(range) };
}

function RangeTabs({ range, pick, id }: { range: StatsRange; pick: (r: StatsRange) => void; id: string }) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 dark:border-neutral-800 dark:bg-neutral-900">
      {ORDER.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => pick(k)}
          aria-pressed={k === range}
          aria-label={`${id} ${LABEL[k]}`}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            k === range ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100" : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          }`}
        >
          {LABEL[k]}
        </button>
      ))}
    </div>
  );
}

/** 카드 골격 — 제목 줄에 기간 탭, 본문은 데이터가 오면 render. 로딩·실패 상태 공통. */
function RangeCard({ id, title, subtitle, children }: {
  id: string;
  title: string;
  subtitle?: (d: RangeStats) => string;
  children: (d: RangeStats) => ReactNode;
}) {
  const c = useRangeCard();
  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h3 className="font-semibold">{title}</h3>
          {subtitle && c.data && <span className="text-xs text-neutral-500">{subtitle(c.data)}</span>}
        </div>
        <RangeTabs id={id} range={c.range} pick={c.pick} />
      </div>
      <Body c={c}>{children}</Body>
    </section>
  );
}

function Body({ c, children }: { c: ReturnType<typeof useRangeCard>; children: (d: RangeStats) => ReactNode }) {
  if (c.data) return <>{children(c.data)}</>;
  if (c.failed)
    return (
      <div className="py-6 text-center text-sm text-rose-600">
        불러오지 못했습니다 ({c.failed}).{" "}
        <button type="button" onClick={c.retry} className="underline">다시 시도</button>
      </div>
    );
  return <div className="py-8 text-center text-sm text-neutral-400 animate-pulse">{LABEL[c.range]} 계산 중… (처음 한 번만 걸립니다)</div>;
}

const fmtSec = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`);

/** 사람 트래픽 KPI 두 줄 — 누적 PV(전체)는 서버가 넘긴다. */
export function HumanKpiCards({ totalAll }: { totalAll: number }) {
  const c = useRangeCard();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-neutral-500">기간 지표 · 봇·의심 세션 제외</span>
        <RangeTabs id="사람 KPI" range={c.range} pick={c.pick} />
      </div>
      <Body c={c}>
        {(d) => (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="누적 PV (전체 — 사람+봇)" value={totalAll} />
              <KpiCard label="오늘 방문자" value={d.todayUnique} sub={`PV ${d.todayPV.toLocaleString()}`} accent />
              <KpiCard label="어제 방문자" value={d.yesterdayUnique} sub={`PV ${d.yesterdayPV.toLocaleString()}`} />
              <KpiCard label={`${d.label} 방문자`} value={d.rangeUnique} sub={`PV ${d.rangePV.toLocaleString()}`} />
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label={`${d.label} 평균 체류`} value={fmtSec(d.avgSessionSec)} accent sub="페이지 이동으로 관측된 시간만" />
              <KpiCard label="이탈률" value={d.bounceRate} suffix="%" sub={`1페이지 세션 · 열린 탭 체류 미반영 · 의심 봇 ${d.suspiciousCount.toLocaleString()}세션 제외`} />
              <KpiCard label="세션 수" value={d.sessionCount} sub={`방문자 ${d.rangeUnique.toLocaleString()}명 기준`} />
              <KpiCard label="세션당 PV" value={d.sessionCount ? (d.rangePV / d.sessionCount).toFixed(1) : "0"} sub="페이지 깊이" />
            </div>
          </>
        )}
      </Body>
    </div>
  );
}

export function ConcurrentCard() {
  return (
    <RangeCard id="동시 접속" title="동시 접속" subtitle={(d) => `${d.concurrent.bucketMinutes}분 창 고유 세션 · ${d.label}${d.range === "all" ? " (최근 30일까지)" : ""}`}>
      {(d) => (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <KpiCard
              label="피크"
              value={d.concurrent.peak}
              suffix="명"
              accent
              sub={d.concurrent.peakAt ? `${new Date(new Date(d.concurrent.peakAt).getTime() + 9 * 3_600_000).toISOString().replace("T", " ").slice(5, 16)} KST` : "—"}
            />
            <KpiCard label="평균" value={d.concurrent.avg.toFixed(1)} suffix="명" sub="빈 시간 포함" />
            <KpiCard label="중앙값" value={d.concurrent.median} suffix="명" />
            <KpiCard label="상위 5%" value={d.concurrent.p95} suffix="명" sub="붐빌 때 이 정도" />
          </div>
          <ConcurrentHourChart hours={d.concurrentHours} />
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
                  <th className="py-2 font-medium">날짜 (KST)</th>
                  <th className="py-2 font-medium text-right">피크</th>
                  <th className="py-2 font-medium text-right">시각</th>
                  <th className="py-2 font-medium text-right">평균</th>
                </tr>
              </thead>
              <tbody>
                {d.concurrentDays.map((x) => (
                  <tr key={x.day} className="border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                    <td className="py-1.5">
                      {x.day.slice(5)} ({DAY_KO[new Date(`${x.day}T00:00:00Z`).getUTCDay()]})
                      {x.partial && <span className="ml-1.5 text-[10px] text-neutral-400">부분</span>}
                    </td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">{x.peak}</td>
                    <td className="py-1.5 text-right text-neutral-500 tabular-nums">{x.peakAt}</td>
                    <td className={`py-1.5 text-right tabular-nums ${x.partial ? "text-neutral-400" : "text-neutral-500"}`}>{x.avg.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-neutral-500 break-keep">
            heartbeat(실시간 패널)는 이력을 남기지 않아 과거 구간은 PV 로 근사합니다 — 같은 창 안에 PV 를 낸 고유 세션 수(GA 활성 사용자와 같은 정의).
            봇 {d.suspiciousCount.toLocaleString()}세션 제외 기준은 위 방문자 지표와 동일합니다. &quot;부분&quot; 은 조회 구간에 하루가 다 담기지 않은 날 —
            평균은 담긴 시간대만의 값이라 다른 날과 직접 비교하지 마세요.
          </p>
        </>
      )}
    </RangeCard>
  );
}

export function DeviceCard() {
  return (
    <RangeCard id="디바이스" title="디바이스 분포" subtitle={(d) => d.label}>
      {(d) =>
        d.device.total === 0 ? (
          <EmptyHint />
        ) : (
          <ul className="grid grid-cols-3 gap-3">
            {d.device.rows.map((x) => {
              const meta = DEVICE_LABEL[x.type];
              return (
                <li key={x.type} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 text-center bg-white dark:bg-neutral-950">
                  <div className="text-3xl">{meta.emoji}</div>
                  <div className="mt-1 text-xs font-medium text-neutral-500">{meta.label}</div>
                  <div className="mt-1 text-2xl font-black tabular-nums">{x.count.toLocaleString()}</div>
                  <div className="mt-1 text-sm font-semibold text-blue-600 dark:text-blue-400 tabular-nums">{x.pct}%</div>
                  <div className="mt-2 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${x.pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )
      }
    </RangeCard>
  );
}

export function PopularPagesCard() {
  return (
    <RangeCard id="인기 페이지" title="인기 페이지" subtitle={(d) => d.label}>
      {(d) =>
        d.topPaths.length === 0 ? (
          <EmptyHint />
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {d.topPaths.map((x, i) => (
              <RankRow key={x.path} rank={i + 1} label={x.path} href={x.path} pct={(x.count / d.topPaths[0].count) * 100} value={x.count} />
            ))}
          </ul>
        )
      }
    </RangeCard>
  );
}

export function ExitPagesCard() {
  return (
    <RangeCard id="이탈 페이지" title="이탈 페이지 TOP 10" subtitle={(d) => `${d.label} · 세션의 마지막 페이지 기준 · 의심 봇 제외`}>
      {(d) =>
        d.exitPaths.length === 0 ? (
          <EmptyHint />
        ) : (
          <>
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {d.exitPaths.map((e, i) => (
                <RankRow
                  key={e.path}
                  rank={i + 1}
                  label={e.path}
                  href={e.path}
                  labelMax="36%"
                  bar="bg-rose-500"
                  pct={(e.exits / d.exitPaths[0].exits) * 100}
                  value={
                    <>
                      {e.exits.toLocaleString()}
                      <span className="ml-3 text-xs font-normal" title="그 페이지를 본 세션 중 그 페이지가 마지막이었던 비율">이탈률 {e.rate}%</span>
                    </>
                  }
                />
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-neutral-500 leading-relaxed">
              이탈률 = 그 페이지를 본 세션 중 그 페이지에서 방문이 끝난 비율. 많이 보이는 페이지일수록 이탈 세션 수도 자연히 크니, 순위(절대 수)와 이탈률(비율)을 같이 보세요.
            </p>
          </>
        )
      }
    </RangeCard>
  );
}

export function HostCard() {
  return (
    <RangeCard id="도메인별" title="도메인별 방문자·PV" subtitle={(d) => `${d.label} · 사람 기준`}>
      {(d) =>
        d.hosts.rows.length === 0 ? (
          <EmptyHint message="아직 도메인이 기록된 방문이 없습니다. host 기록은 추가(2026-06-04) 이후 PV 부터 — 이전 PV 는 '도메인 미상'." />
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {d.hosts.rows.map((h, i) => (
              <RankRow
                key={h.host}
                rank={i + 1}
                label={h.host}
                labelMax="38%"
                bar="bg-violet-500"
                pct={(h.pv / d.hosts.rows[0].pv) * 100}
                value={
                  <>
                    방문자 {h.unique.toLocaleString()} · PV {h.pv.toLocaleString()}
                    <span className="text-neutral-400"> ({d.hosts.totalPv > 0 ? Math.round((h.pv / d.hosts.totalPv) * 100) : 0}%)</span>
                  </>
                }
              />
            ))}
          </ul>
        )
      }
    </RangeCard>
  );
}

export function AiServicesCard() {
  return (
    <RangeCard id="AI 서비스" title="AI 서비스별 유입" subtitle={(d) => `${d.label} · AI 링크 클릭 ${d.aiServices.reduce((a, r) => a + r.pv, 0).toLocaleString()}회 (사람 · referrer·utm_source 기준)`}>
      {(d) => (
        <>
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
                <th className="text-left font-medium pb-2 pr-2 w-28">서비스</th>
                <th className="text-right font-medium pb-2 px-1 w-16">방문자</th>
                <th className="text-right font-medium pb-2 px-1 w-14">클릭</th>
                <th className="text-left font-medium pb-2 pl-3">많이 들어온 페이지</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {d.aiServices.map((r) => (
                <tr key={r.name} className={r.pv === 0 ? "opacity-40" : undefined}>
                  <td className="py-2 pr-2 font-medium">{r.name}</td>
                  <td className="py-2 px-1 text-right tabular-nums font-semibold">{r.unique.toLocaleString()}</td>
                  <td className="py-2 px-1 text-right tabular-nums">{r.pv.toLocaleString()}</td>
                  <td className="py-2 pl-3 text-xs text-neutral-500 truncate">{r.topPaths.length === 0 ? "—" : r.topPaths.map((p) => `${p.path} (${p.count})`).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-neutral-400 leading-relaxed">
            ChatGPT·Copilot·Perplexity 는 링크에 utm_source 를 붙여 거의 전부 잡힙니다. Claude·Gemini 는 태그를 안 붙이고 referrer 만 남기므로
            앱·인앱 브라우저처럼 referrer 가 빠지는 경로는 &quot;직접&quot; 으로 섞입니다(하한값). AI 가 답변에서 우리를 언급만 하고 클릭이 없으면 여기에 안 잡힙니다.
          </p>
        </>
      )}
    </RangeCard>
  );
}

export function SearchQueriesCard() {
  return (
    <RangeCard id="검색 키워드" title="검색 키워드 (네이버·다음·빙)" subtitle={(d) => `${d.label} · 검색 유입 ${d.searchQueries.reduce((s, q) => s + q.count, 0)}회`}>
      {(d) =>
        d.searchQueries.length === 0 ? (
          <EmptyHint message="아직 검색어가 잡힌 유입이 없습니다. 네이버·다음 검색 유입부터 쌓입니다 (구글·빙 검색어는 아래 '검색 성과' 섹션에서 확인 — referrer 에 검색어를 안 남김)." />
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {d.searchQueries.map((q, i) => (
              <RankRow
                key={q.query}
                rank={i + 1}
                label={q.query}
                labelMax="45%"
                bar="bg-teal-500"
                pct={(q.count / d.searchQueries[0].count) * 100}
                value={q.count}
                extra={<span className="text-base">{CHANNEL_META[q.channel].emoji}</span>}
              />
            ))}
          </ul>
        )
      }
    </RangeCard>
  );
}

export function ExternalLandingsCard() {
  return (
    <RangeCard id="외부 유입 랜딩" title="외부 유입 랜딩 페이지 TOP 10" subtitle={(d) => `${d.label} · 직접 제외`}>
      {(d) =>
        d.externalLandings.length === 0 ? (
          <EmptyHint message="외부(검색·SNS·타 사이트) 유입이 도착한 페이지가 아직 없습니다." />
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {d.externalLandings.map((x, i) => (
              <RankRow key={x.path} rank={i + 1} label={x.path} href={x.path} mono labelMax="55%" bar="bg-indigo-400/80" pct={(x.count / d.externalLandings[0].count) * 100} value={x.count} />
            ))}
          </ul>
        )
      }
    </RangeCard>
  );
}

export function ReferralDomainsCard() {
  return (
    <RangeCard id="기타 사이트" title="기타 사이트 상세 (referral)" subtitle={(d) => `${d.label} · ${d.referralDomains.length}개`}>
      {(d) => {
        if (d.referralDomains.length === 0) return <EmptyHint message="기타 사이트(referral) 유입이 없습니다." />;
        const max = d.referralDomains[0].count;
        const row = (x: { domain: string; count: number }, i: number) => (
          <RankRow key={x.domain} rank={i + 1} label={x.domain} mono labelMax="45%" bar="bg-sky-400/80" pct={max > 0 ? (x.count / max) * 100 : 0} value={x.count} />
        );
        const head = d.referralDomains.slice(0, 10);
        const rest = d.referralDomains.slice(10);
        return (
          <>
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">{head.map(row)}</ul>
            {rest.length > 0 && (
              <details className="group mt-1">
                <summary className="cursor-pointer list-none py-2 text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline select-none">
                  <span className="group-open:hidden">+ 나머지 {rest.length}개 펼치기</span>
                  <span className="hidden group-open:inline">접기</span>
                </summary>
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 border-t border-neutral-200 dark:border-neutral-800">{rest.map((x, i) => row(x, i + 10))}</ul>
              </details>
            )}
          </>
        );
      }}
    </RangeCard>
  );
}

/** AI 크롤러 — 기간 KPI 한 칸 + 봇별 PV + 본 페이지. 오늘·어제·24h 는 기간과 무관해 서버가 넘긴다. */
export function AiBotRangeCards({ today, yesterday, last24h }: { today: number; yesterday: number; last24h: number }) {
  const c = useRangeCard();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-500">기간 지표</span>
        <RangeTabs id="AI 크롤러" range={c.range} pick={c.pick} />
      </div>
      <Body c={c}>
        {(d) => (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="오늘 AI PV" value={today} accent sub="ChatGPT·Claude 등" />
              <KpiCard label="어제 AI PV" value={yesterday} sub="비교 baseline" />
              <KpiCard label="최근 24시간" value={last24h} sub="rolling window" />
              <KpiCard label={`${d.label} AI PV`} value={d.aiBots.rangePV} sub="기간 합계" />
            </div>
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SectionCard title="AI 봇별 PV" subtitle={d.label}>
                {d.aiBots.byName.length === 0 ? (
                  <EmptyHint message="AI 크롤러 방문이 아직 없습니다. 색인되면 GPTBot/ClaudeBot 등이 잡힙니다." />
                ) : (
                  <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {d.aiBots.byName.map((b, i) => (
                      <RankRow key={b.name} rank={i + 1} label={b.name} labelMax="50%" bar="bg-emerald-500" pct={(b.count / d.aiBots.byName[0].count) * 100} value={b.count} />
                    ))}
                  </ul>
                )}
              </SectionCard>
              <SectionCard title="AI 봇이 본 페이지 TOP 15" subtitle={d.label}>
                {d.aiBots.topPaths.length === 0 ? (
                  <EmptyHint />
                ) : (
                  <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {d.aiBots.topPaths.map((p, i) => (
                      <RankRow key={p.path} rank={i + 1} label={p.path} href={p.path} mono labelMax="55%" bar="bg-emerald-400/80" pct={(p.count / d.aiBots.topPaths[0].count) * 100} value={p.count} />
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          </>
        )}
      </Body>
    </div>
  );
}

/** 전체 봇 트래픽 — 기간 KPI + 카테고리 분포 + TOP 12. 봇 오늘·어제는 서버(30일 원본) 값. */
export function BotRangeCards({ today, yesterday }: { today: number; yesterday: number }) {
  const c = useRangeCard();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-500">기간 지표 · 의심 세션(위장 스크레이퍼)은 봇으로 집계</span>
        <RangeTabs id="봇 트래픽" range={c.range} pick={c.pick} />
      </div>
      <Body c={c}>
        {(d) => (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label={`봇 비율 (${d.label})`} value={d.bots.ratio} suffix="%" />
              <KpiCard label="봇 오늘" value={today} accent />
              <KpiCard label="봇 어제" value={yesterday} />
              <KpiCard label={`봇 ${d.label}`} value={d.bots.rangeCount} />
            </div>
            <SectionCard title={`봇 카테고리 분포 (${d.label})`} subtitle="유형별 합계">
              {d.bots.total === 0 ? (
                <EmptyHint message="봇 트래픽이 잡히지 않았습니다." />
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  {d.bots.categories.map((x) => {
                    const meta = BOT_CATEGORY_LABEL[x.category];
                    return (
                      <li key={x.category} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 text-center bg-white dark:bg-neutral-950">
                        <div className="text-2xl">{meta.emoji}</div>
                        <div className="mt-1 text-[11px] font-medium text-neutral-500">{meta.label}</div>
                        <div className="mt-0.5 text-lg font-bold tabular-nums">{x.count}</div>
                        <div className="text-[10px] text-neutral-400">{d.bots.total > 0 ? Math.round((x.count / d.bots.total) * 100) : 0}%</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>
            <SectionCard title={`봇 TOP 12 (${d.label})`} subtitle="이름별 PV">
              {d.bots.top.length === 0 ? (
                <EmptyHint />
              ) : (
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {d.bots.top.map((b, i) => (
                    <RankRow
                      key={b.name}
                      rank={i + 1}
                      label={b.name}
                      labelMax="40%"
                      bar="bg-amber-500"
                      pct={(b.count / d.bots.top[0].count) * 100}
                      value={b.count.toLocaleString()}
                      extra={<span className="text-base">{BOT_CATEGORY_LABEL[b.category].emoji}</span>}
                    />
                  ))}
                </ul>
              )}
            </SectionCard>
          </>
        )}
      </Body>
    </div>
  );
}
