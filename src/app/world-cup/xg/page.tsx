// /world-cup/xg — 월드컵 전 경기 xG(기대득점) 집계 트래커.
// 개별 경기 페이지엔 xG 가 흩어져 있어, 여기서 한 표로 모아 "실제 결과 vs xG 로 받을 만했던 결과"를 비교한다.
// 데이터: Match.fixtureStats (af expected_goals, [home, away] 순서·predictionEngine.ts 검증). 신규 수집 없음 — 기존 데이터 집계만.
import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { prisma } from "@/lib/db";
import { fifaCountryKo, fifaFlag } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";
import { xgFairnessPct } from "@/lib/xg/outcome";
import { SITE_URL } from "@/lib/site-url";
import AmbientGlow from "@/components/AmbientGlow";

export const revalidate = 600; // ISR — force-dynamic 제거(2026-07-02, searchParams 없음)

export const metadata: Metadata = {
  title: "월드컵 xG 트래커 — 전 경기 기대득점 vs 실제 결과",
  description:
    "2026 북중미 월드컵 전 경기의 xG(기대득점)를 한 표에 모았습니다. 팀별 xG와 실제 스코어를 비교해 '이길 만했던' 경기·이변·결정력·불운을 데이터로 추적합니다.",
  keywords: [
    "월드컵 xG", "기대득점", "xG 트래커", "월드컵 통계", "expected goals",
    "월드컵 경기 분석", "xG 비교", "월드컵 슈팅 질",
  ],
  alternates: { canonical: `${SITE_URL}/world-cup/xg` },
};

// 구조화 데이터 — WC xG 집계를 고유 데이터셋으로 인식.
const XG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: "2026 월드컵 xG(기대득점) 트래커",
  description: "2026 월드컵 전 경기의 팀별 xG 와 실제 결과 비교 데이터.",
  url: `${SITE_URL}/world-cup/xg`,
  keywords: ["월드컵 xG", "기대득점", "expected goals"],
  creator: { "@type": "Organization", name: "스코어베이스", url: SITE_URL },
  isAccessibleForFree: true,
  measurementTechnique: "api-football expected_goals 집계 vs 실제 득점 비교",
};

interface XgRow {
  matchId: number;
  externalId: string;
  startTime: Date;
  status: string;
  homeName: string;
  awayName: string;
  homeRaw: string;
  awayRaw: string;
  homeScore: number | null;
  awayScore: number | null;
  homeXg: number | null;
  awayXg: number | null;
}

function nameKo(en: string): string {
  return fifaCountryKo(en) ?? toKoreanTeamName(en) ?? en;
}

function kstDate(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
}

// fixtureStats 는 [home, away] 순서 고정 (af /fixtures/statistics, predictionEngine.ts:583 에서 394/394 검증).
// af 는 expected_goals 를 문자열("1.15")로 줄 수 있어 Number() 로 방어적 변환.
function parseXg(fixtureStats: string | null): { home: number | null; away: number | null } {
  if (!fixtureStats) return { home: null, away: null };
  try {
    const fs = JSON.parse(fixtureStats) as Array<{ expectedGoals?: unknown }>;
    const h = Number(fs[0]?.expectedGoals);
    const a = Number(fs[1]?.expectedGoals);
    return { home: Number.isFinite(h) ? h : null, away: Number.isFinite(a) ? a : null };
  } catch {
    return { home: null, away: null };
  }
}

async function fetchRows(): Promise<XgRow[]> {
  const matches = await prisma.match.findMany({
    where: {
      league: "WORLD_CUP",
      status: { in: ["FINISHED", "LIVE"] },
      fixtureStats: { not: null },
    },
    orderBy: { startTime: "desc" },
    take: 200,
    select: {
      id: true,
      externalId: true,
      startTime: true,
      status: true,
      homeScore: true,
      awayScore: true,
      fixtureStats: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  const rows: XgRow[] = [];
  for (const m of matches) {
    const { home, away } = parseXg(m.fixtureStats);
    if (home == null && away == null) continue; // xG 없는 매치는 트래커에서 제외
    rows.push({
      matchId: m.id,
      externalId: m.externalId,
      startTime: m.startTime,
      status: m.status,
      homeName: nameKo(m.homeTeam.name),
      awayName: nameKo(m.awayTeam.name),
      homeRaw: m.homeTeam.name,
      awayRaw: m.awayTeam.name,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      homeXg: home,
      awayXg: away,
    });
  }
  return rows;
}

// xG 판정 — "받을 만했던" 승자(xG)와 실제 승자를 비교해 한 단어로.
type Tone = "upset" | "asExpected" | "tight" | "live";
function verdict(r: XgRow): { label: string; tone: Tone } {
  if (r.status === "LIVE") return { label: "진행 중", tone: "live" };
  const hx = r.homeXg ?? 0;
  const ax = r.awayXg ?? 0;
  const hs = r.homeScore ?? 0;
  const as_ = r.awayScore ?? 0;
  const margin = hx - ax;
  const xgWinner = margin > 0.3 ? "H" : margin < -0.3 ? "A" : "T"; // T = 팽팽
  const actual = hs > as_ ? "H" : hs < as_ ? "A" : "D";
  if (xgWinner === "T") return { label: "팽팽", tone: "tight" };
  if (actual === "D") {
    const fav = xgWinner === "H" ? r.homeName : r.awayName;
    return { label: `${fav} 우세→무`, tone: "upset" };
  }
  if (xgWinner !== actual) {
    const winner = actual === "H" ? r.homeName : r.awayName;
    return { label: `이변·${winner} 승`, tone: "upset" };
  }
  return { label: "xG대로", tone: "asExpected" };
}

const TONE_CLS: Record<Tone, string> = {
  upset: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  asExpected: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  tight: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  live: "bg-rose-600 text-white",
};

// 결과 부합도 — 이 xG 내용이면 실제 결과가 나올 확률. 낮을수록 이변·불운.
function fairnessOf(r: XgRow): number | null {
  if (r.status === "LIVE") return null;
  if (r.homeXg == null || r.awayXg == null || r.homeScore == null || r.awayScore == null) return null;
  return xgFairnessPct(r.homeXg, r.awayXg, r.homeScore, r.awayScore);
}

function fairnessCls(pct: number): string {
  if (pct >= 50) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 25) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function xgCell(r: XgRow) {
  const h = r.homeXg;
  const a = r.awayXg;
  const hi = h != null && a != null ? (h > a ? "H" : a > h ? "A" : "") : "";
  return (
    <span className="tabular-nums">
      <span className={hi === "H" ? "font-bold text-emerald-600 dark:text-emerald-400" : ""}>
        {h != null ? h.toFixed(2) : "–"}
      </span>
      <span className="text-neutral-400 mx-1">–</span>
      <span className={hi === "A" ? "font-bold text-emerald-600 dark:text-emerald-400" : ""}>
        {a != null ? a.toFixed(2) : "–"}
      </span>
    </span>
  );
}

export default async function WorldCupXgPage() {
  const rows = await fetchRows();

  return (
    <main className="relative mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <AmbientGlow />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(XG_JSONLD) }}
      />
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <Link href="/world-cup" className="hover:underline" prefetch={false}>
            2026 월드컵
          </Link>
          <span>/</span>
          <span>xG 트래커</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> xG 트래커
        </span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">월드컵 xG 트래커</h1>
        <p className="text-sm leading-relaxed text-neutral-500 break-keep dark:text-neutral-400">
          2026 월드컵 전 경기의 <strong>xG(기대득점)</strong>와 실제 스코어를 한 표로. 슈팅의 질로
          누가 <strong>이길 만했는지</strong>, 어디서 이변·결정력·불운이 갈렸는지 추적합니다.
          <br className="hidden sm:block" />
          최근 경기 순. 종료·진행 중 경기만(예정 경기는 xG 없음).
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-white/10 p-10 text-center">
          <div className="text-sm text-neutral-500 break-keep">아직 집계할 xG 데이터가 없습니다.</div>
          <div className="mt-2 text-[11px] text-neutral-400 break-keep">
            경기 종료 후 통계가 수집되면 자동으로 표시됩니다.
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <div className="hidden md:grid grid-cols-[56px_minmax(0,1fr)_72px_120px_minmax(0,120px)] gap-3 px-4 py-2 text-[10px] font-bold tracking-wider uppercase text-neutral-500 border-b border-black/5 dark:border-white/5">
            <div>날짜</div>
            <div>경기</div>
            <div className="text-center">스코어</div>
            <div className="text-center">xG (홈–원정)</div>
            <div className="text-right">판정 · 부합도</div>
          </div>
          <ul className="divide-y divide-black/5 dark:divide-white/5">
            {rows.map((r) => {
              const v = verdict(r);
              const fair = fairnessOf(r);
              const score =
                r.homeScore != null && r.awayScore != null
                  ? `${r.homeScore} - ${r.awayScore}`
                  : "-";
              return (
                <li key={r.matchId}>
                  <Link
                    href={`/live/WORLD_CUP/${r.externalId}`}
                    prefetch={false}
                    className="block px-4 py-3 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
                  >
                    {/* mobile */}
                    <div className="md:hidden space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                        <span>{kstDate(r.startTime)}</span>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${TONE_CLS[v.tone]}`}
                          >
                            {v.label}
                          </span>
                          {fair != null && (
                            <span className={`text-[10px] font-bold tabular-nums ${fairnessCls(fair)}`}>
                              부합 {fair}%
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="text-sm font-medium truncate">
                        {fifaFlag(r.homeRaw)} {r.homeName}{" "}
                        <span className="text-neutral-400 tabular-nums">{score}</span>{" "}
                        {r.awayName} {fifaFlag(r.awayRaw)}
                      </div>
                      <div className="text-xs text-neutral-500">xG {xgCell(r)}</div>
                    </div>
                    {/* desktop */}
                    <div className="hidden md:grid grid-cols-[56px_minmax(0,1fr)_72px_120px_minmax(0,120px)] gap-3 items-center text-sm">
                      <div className="text-[11px] text-neutral-500 tabular-nums">
                        {kstDate(r.startTime)}
                      </div>
                      <div className="truncate">
                        <span className="font-medium">
                          {fifaFlag(r.homeRaw)} {r.homeName}
                        </span>
                        <span className="text-neutral-400 mx-1.5">vs</span>
                        <span className="font-medium">
                          {r.awayName} {fifaFlag(r.awayRaw)}
                        </span>
                        {r.status === "LIVE" && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                            LIVE
                          </span>
                        )}
                      </div>
                      <div className="text-center tabular-nums font-semibold">{score}</div>
                      <div className="text-center text-[13px]">{xgCell(r)}</div>
                      <div className="text-right">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${TONE_CLS[v.tone]}`}
                        >
                          {v.label}
                        </span>
                        {fair != null && (
                          <div className={`mt-0.5 text-[10px] font-bold tabular-nums ${fairnessCls(fair)}`}>
                            부합 {fair}%
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* SEO 본문 — xG 개념 + WC 내부링크 (thin 탈출) */}
      <section className="border-t border-black/5 dark:border-white/10 pt-8 space-y-3">
        <h2 className="text-base sm:text-lg font-bold tracking-tight break-keep">xG(기대득점)란?</h2>
        <p className="text-sm leading-relaxed text-neutral-600 break-keep dark:text-neutral-400">
          xG(expected goals, 기대득점)는 각 슈팅이 골로 연결될 확률을 합산해 한 팀이 그 경기에서
          <strong> 평균적으로 몇 골을 넣을 만했는지</strong>를 추정한 값입니다. 실제 스코어가 운·결정력·골키퍼
          선방에 좌우되는 반면, xG 는 만들어낸 <strong>기회의 질</strong>을 보여줍니다. 적은 xG 로 많이 넣었다면
          결정력(또는 행운), 높은 xG 로 못 넣었다면 불운·낭비로 읽을 수 있습니다.
        </p>
        <p className="text-sm leading-relaxed text-neutral-600 break-keep dark:text-neutral-400">
          이 표의 <strong>판정</strong>은 xG 우위 팀과 실제 승자를 비교한 것입니다. 둘이 다르면
          <strong> 이변</strong>, 같으면 <strong>xG대로</strong>, xG 차가 작으면 <strong>팽팽</strong>으로
          표시합니다. <strong>부합도</strong>는 양 팀 xG 를 기대득점으로 한 포아송 모델에서 실제
          결과(승·무·패)가 나올 확률입니다 — 낮을수록 내용과 동떨어진 결과, 즉 이변이나 불운입니다.
          경기를 누르면 라인업·팀 통계·모멘텀 상세로 이동합니다.
        </p>
        <p className="text-sm leading-relaxed text-neutral-600 break-keep dark:text-neutral-400">
          우승 확률·진출 시뮬레이션은{" "}
          <Link
            href="/predictions/WORLD_CUP"
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            prefetch={false}
          >
            월드컵 예측
          </Link>
          , 일정·조별 전력은{" "}
          <Link
            href="/world-cup"
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            prefetch={false}
          >
            월드컵 데이터 센터
          </Link>
          에서 확인할 수 있습니다.
        </p>
        <p className="inline-flex items-center gap-1.5 text-[11px] text-neutral-400 break-keep">
          <Info className="h-3 w-3 shrink-0" aria-hidden /> xG 출처: api-football(expected_goals). 일부 경기는 통계 미제공으로 누락될 수 있습니다.
        </p>
      </section>
    </main>
  );
}
