// 가성비 구단 랭킹 — 스쿼드 몸값 1억€당 승점으로 빅5 구단을 줄 세운다.
// "잘하는 팀"이 아니라 "쓴 돈 대비 뽑아낸 성적" 순위다(바르사가 리그 1위여도 하위에 온다).
// 리그마다 몸값 수준이 달라(EPL 최저 290M vs 라리가 최저 55M) 리그 간 비교는 성립하지 않는다 → 리그별로만 정렬.
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import TeamBadge from "@/components/TeamBadge";
import CiteBox from "@/components/CiteBox";
import { Coins, TrendingDown } from "lucide-react";
import { SITE_URL } from "@/lib/site-url";
import { ogPageImage } from "@/lib/seo/og";
import { teamDisplayKo } from "@/lib/team-names";
import { jsonLdScript } from "@/lib/seo/jsonld";
import { koEnLanguages } from "@/lib/i18n/en";

export const revalidate = 3600;

const LEAGUES: { key: string; label: string }[] = [
  { key: "EPL", label: "프리미어리그" },
  { key: "LALIGA", label: "라리가" },
  { key: "SERIE_A", label: "세리에 A" },
  { key: "BUNDESLIGA", label: "분데스리가" },
  { key: "LIGUE_1", label: "리그 1" },
];

// 스쿼드 가치는 팀 내 시장가치 상위 N명 합계. PlayerMarketValue 에는 유스·방출 잔여 선수가
// 섞여 있어(같은 빅5인데 팀별 30~88명) 전원 합산하면 명단이 두꺼운 팀만 손해를 본다.
const SQUAD_TOP_N = 25;
const MIN_SQUAD = 18; // 상위 N명을 채우지 못하는 팀은 제외
const MIN_PLAYED = 10; // 시즌 초 소표본 왜곡 차단

interface Row {
  teamId: number;
  name: string;
  logoUrl: string | null;
  points: number;
  played: number;
  value: number; // €
  eff: number; // 1억€당 승점
}

export const metadata: Metadata = {
  title: "가성비 구단 랭킹 — 몸값 대비 승점 (빅5 리그)",
  description:
    "프리미어리그·라리가·세리에A·분데스리가·리그1 구단을 스쿼드 시장가치 1억 유로당 승점으로 줄 세운 랭킹. 돈을 가장 효율적으로 쓴 구단과 가장 비효율적으로 쓴 구단을 리그별로 비교합니다.",
  keywords: [
    "가성비 구단", "스쿼드 가치", "몸값 대비 성적", "축구 구단 효율", "프리미어리그 몸값",
    "라리가 스쿼드 가치", "축구 시장가치 랭킹",
  ],
  alternates: {
    canonical: `${SITE_URL}/rankings/value-clubs`,
    languages: koEnLanguages("/rankings/value-clubs", "/en/rankings/value-clubs"),
  },
  openGraph: {
    title: "가성비 구단 랭킹 — 몸값 대비 승점",
    description: "빅5 구단을 스쿼드 시장가치 1억 유로당 승점으로 줄 세웠습니다.",
    url: `${SITE_URL}/rankings/value-clubs`,
    images: ogPageImage({ title: "가성비 구단 랭킹", subtitle: "몸값 1억€당 승점", tag: "빅5" }),
  },
};

// 유럽 축구 시즌 경계는 7월 1일. 다만 Match 에 season 컬럼이 없고 비시즌엔 새 시즌 경기가
// 0건이라, 현 시즌 표본이 미달이면 직전 시즌으로 한 칸 물러난다.
function seasonWindow(offset: number): { from: Date; to: Date; label: string } {
  const now = new Date();
  const y = now.getUTCFullYear() - (now.getUTCMonth() >= 6 ? 0 : 1) - offset;
  return {
    from: new Date(Date.UTC(y, 6, 1)),
    to: new Date(Date.UTC(y + 1, 6, 1)),
    label: `${y}-${String((y + 1) % 100).padStart(2, "0")}`,
  };
}

export default async function ValueClubsPage() {
  // 1) 팀별 스쿼드 가치 — ts player 의 team_id 를 TeamSourceId 로 우리 Team 에 붙인다.
  const squads = await prisma.$queryRaw<
    { teamId: number; nameKo: string | null; name: string; logoUrl: string | null; players: number; value: number }[]
  >`
    SELECT "teamId", "nameKo", name, "logoUrl", count(*)::int AS players, sum(v)::float AS value
    FROM (
      SELECT t.id AS "teamId", t."nameKo", t.name, t."logoUrl", p."currentValue" AS v,
             row_number() OVER (PARTITION BY t.id ORDER BY p."currentValue" DESC) AS rn
      FROM "PlayerMarketValue" p
      JOIN "TeamSourceId" ts ON ts."externalId" = p."teamId" AND ts.source = 'thesports'
      JOIN "Team" t ON t.id = ts."teamId"
      WHERE p."currentValue" > 0
    ) x
    WHERE rn <= ${SQUAD_TOP_N}
    GROUP BY "teamId", "nameKo", name, "logoUrl"
    HAVING count(*) >= ${MIN_SQUAD}
  `;
  const squadMap = new Map(squads.map((s) => [s.teamId, s]));

  const keys = LEAGUES.map((l) => l.key);
  const pointsIn = (w: { from: Date; to: Date }) =>
    prisma.$queryRaw<{ league: string; teamId: number; points: number; played: number }[]>`
      SELECT league, "teamId", sum(pt)::int AS points, count(*)::int AS played
      FROM (
        SELECT m.league, m."homeTeamId" AS "teamId",
               CASE WHEN m."homeScore" > m."awayScore" THEN 3
                    WHEN m."homeScore" = m."awayScore" THEN 1 ELSE 0 END AS pt
        FROM "Match" m
        WHERE m.status = 'FINISHED' AND m.league = ANY(${keys}) AND m."homeScore" IS NOT NULL
          AND m."startTime" >= ${w.from} AND m."startTime" < ${w.to}
        UNION ALL
        SELECT m.league, m."awayTeamId",
               CASE WHEN m."awayScore" > m."homeScore" THEN 3
                    WHEN m."homeScore" = m."awayScore" THEN 1 ELSE 0 END
        FROM "Match" m
        WHERE m.status = 'FINISHED' AND m.league = ANY(${keys}) AND m."homeScore" IS NOT NULL
          AND m."startTime" >= ${w.from} AND m."startTime" < ${w.to}
      ) x
      GROUP BY league, "teamId"
    `;

  // 현 시즌 → 표본 미달이면 직전 시즌.
  let season = seasonWindow(0);
  let pts = await pointsIn(season);
  if (pts.filter((p) => p.played >= MIN_PLAYED).length < 10) {
    season = seasonWindow(1);
    pts = await pointsIn(season);
  }

  const byLeague = new Map<string, Row[]>();
  for (const p of pts) {
    if (p.played < MIN_PLAYED) continue;
    const s = squadMap.get(p.teamId);
    if (!s) continue;
    const arr = byLeague.get(p.league) ?? [];
    arr.push({
      teamId: p.teamId,
      name: teamDisplayKo(s, p.league),
      logoUrl: s.logoUrl,
      points: p.points,
      played: p.played,
      value: s.value,
      eff: p.points / (s.value / 100_000_000),
    });
    byLeague.set(p.league, arr);
  }
  for (const arr of byLeague.values()) arr.sort((a, b) => b.eff - a.eff);

  const sections = LEAGUES.map((l) => ({ ...l, rows: byLeague.get(l.key) ?? [] })).filter((s) => s.rows.length >= 5);
  const totalTeams = sections.reduce((n, s) => n + s.rows.length, 0);

  const fmtValue = (v: number) => `${(v / 1_000_000).toFixed(0)}M€`;
  const citeUrl = `${SITE_URL}/rankings/value-clubs`;
  const citeDate = new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });
  const best = sections[0]?.rows[0];
  const citation = best
    ? `가성비 구단 랭킹 ${season.label} — ${sections.map((s) => `${s.label} 1위 ${s.rows[0].name} ${s.rows[0].eff.toFixed(1)}점/1억€`).join(", ")} (빅5 ${totalTeams}팀, 스쿼드 상위 ${SQUAD_TOP_N}명 기준 · 출처 Scorebase ${citeUrl}, ${citeDate})`
    : `가성비 구단 랭킹 — 몸값 대비 승점 (출처 Scorebase ${citeUrl})`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `가성비 구단 랭킹 ${season.label} — 몸값 대비 승점`,
    description: "빅5 리그 구단을 스쿼드 시장가치 1억 유로당 승점으로 정렬한 효율 랭킹 데이터셋.",
    url: citeUrl,
    keywords: ["가성비 구단", "스쿼드 가치", "몸값 대비 성적"],
    creator: { "@type": "Organization", name: "스코어베이스", url: SITE_URL },
    isAccessibleForFree: true,
  };

  return (
    <main className="relative max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <header className="mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
          <Coins className="h-3 w-3" aria-hidden /> {season.label} 시즌
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">
          가성비 구단 랭킹
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
          스쿼드 몸값 <strong className="text-zinc-800 dark:text-white/80">1억 유로당 승점</strong>으로 줄 세웠습니다.
          잘하는 팀 순위가 아니라 <strong className="text-zinc-800 dark:text-white/80">쓴 돈 대비 얼마나 뽑아냈나</strong>의 순위라,
          우승팀이 맨 아래에 오기도 합니다.
        </p>
      </header>

      {sections.length > 1 && (
        <nav className="mb-8 flex flex-wrap gap-2">
          {sections.map((s) => (
            <a
              key={s.key}
              href={`#${s.key}`}
              className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-medium text-zinc-600 shadow-sm ring-1 ring-zinc-200/70 transition-colors hover:text-zinc-900 dark:bg-white/[0.04] dark:text-white/60 dark:ring-white/10 dark:hover:text-white"
            >
              {s.label}
            </a>
          ))}
        </nav>
      )}

      <div className="space-y-10">
        {sections.map((s) => {
          const max = s.rows[0].eff;
          return (
            <section key={s.key} id={s.key} className="scroll-mt-20">
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{s.label}</h2>
                <span className="text-[12px] text-zinc-400 dark:text-white/30">{s.rows.length}팀</span>
              </div>
              <div className="space-y-1.5">
                {s.rows.map((r, i) => {
                  const top = i === 0;
                  const worst = i === s.rows.length - 1;
                  return (
                    <div
                      key={r.teamId}
                      className={`relative overflow-hidden rounded-xl bg-white p-3 shadow-sm ring-1 dark:bg-white/[0.04] ${
                        top
                          ? "ring-2 ring-emerald-400/60 dark:ring-emerald-400/40"
                          : worst
                            ? "ring-rose-300/60 dark:ring-rose-400/25"
                            : "ring-zinc-200/70 dark:ring-white/10"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-6 shrink-0 text-center text-sm font-bold tabular-nums ${
                            top ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400 dark:text-white/30"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <TeamBadge logoUrl={r.logoUrl} size={22} className="shrink-0 bg-white rounded-sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <Link
                              href={`/teams/${r.teamId}`}
                              className="truncate text-[14px] font-semibold text-zinc-900 underline-offset-2 hover:underline dark:text-white"
                            >
                              {r.name}
                              {top && <span className="ml-1.5 align-middle text-[10px] font-bold text-emerald-500">가성비 1위</span>}
                              {worst && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 align-middle text-[10px] font-bold text-rose-500">
                                  <TrendingDown className="h-3 w-3" aria-hidden /> 최하위
                                </span>
                              )}
                            </Link>
                            <span
                              className={`shrink-0 text-[17px] font-bold tabular-nums ${
                                top ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-700 dark:text-white/70"
                              }`}
                            >
                              {r.eff.toFixed(1)}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]">
                            <div
                              className={`h-full rounded-full ${top ? "bg-emerald-500" : "bg-zinc-300 dark:bg-white/20"}`}
                              style={{ width: `${(r.eff / max) * 100}%` }}
                            />
                          </div>
                          <div className="mt-1 text-[11px] tabular-nums text-zinc-400 dark:text-white/30">
                            승점 {r.points} · {r.played}경기 · 스쿼드 {fmtValue(r.value)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-10 space-y-4">
        <div className="rounded-2xl bg-zinc-50 p-5 text-[13px] leading-relaxed text-zinc-600 ring-1 ring-zinc-200/70 dark:bg-white/[0.03] dark:text-white/50 dark:ring-white/10">
          <p className="font-semibold text-zinc-700 dark:text-white/70">계산 방법</p>
          <p className="mt-1.5">
            <strong>승점 ÷ (스쿼드 시장가치 ÷ 1억 유로)</strong> 입니다. 숫자가 클수록 적은 돈으로 많은 승점을 얻은 것입니다.
            스쿼드 가치는 팀 내 시장가치 <strong>상위 {SQUAD_TOP_N}명</strong>의 합입니다. 명단 전체를 더하면 유스와 방출
            대기 선수까지 섞여(같은 빅5인데 팀별 30~88명) 명단이 두꺼운 팀만 손해를 보기 때문입니다.
            {" "}{MIN_PLAYED}경기 미만 팀은 제외합니다.
          </p>
          <p className="mt-2">
            <strong>리그끼리 비교하지 마세요.</strong> 리그마다 몸값 수준 자체가 달라(같은 시즌 최저 스쿼드가
            프리미어리그는 약 290M€, 라리가는 약 55M€) 리그를 넘어선 숫자 비교는 의미가 없습니다. 같은 리그 안에서만 줄을 세웠습니다.
          </p>
          <p className="mt-2 text-zinc-500 dark:text-white/40">
            구단 스쿼드 가치와 평균 나이는{" "}
            <Link href="/transfers" className="font-medium text-rose-600 underline-offset-2 hover:underline dark:text-rose-400">
              이적시장
            </Link>
            에서, 리그 순위는{" "}
            <Link href="/standings" className="font-medium text-rose-600 underline-offset-2 hover:underline dark:text-rose-400">
              순위표
            </Link>
            에서 볼 수 있습니다.
          </p>
        </div>
        <CiteBox citation={citation} url={citeUrl} />
      </section>
    </main>
  );
}
