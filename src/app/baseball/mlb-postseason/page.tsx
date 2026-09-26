// MLB 포스트시즌 대진표 — 와일드카드·디비전·챔피언십·월드시리즈 트리(월드컵 브래킷 문법) + 시드 경쟁 + 한국 선수 소속팀.
// 데이터: MLB 공식 statsapi(순위표·포스트시즌 시리즈·시즌 날짜) + 우리 Elo·로고·경기 링크 — lib/sports/mlb-postseason.ts
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, CalendarDays, Info, Trophy } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import TeamLogoImg from "@/components/TeamLogoImg";
import MlbPostseasonBracket from "@/components/baseball/MlbPostseasonBracket";
import { SITE_URL } from "@/lib/site-url";
import { breadcrumbLd, jsonLdScript, orgRef } from "@/lib/seo/jsonld";
import { currentMlbSeason, getMlbPostseason } from "@/lib/sports/mlb-postseason";
import { ROUND_LABEL, type MlbRound, type SeedRow } from "@/lib/sports/mlb-postseason-build";
import { BASEBALL_KOREA_PLAYERS } from "@/lib/sports/baseball-korea";
import { toKoreanTeamName } from "@/lib/team-names";

export const revalidate = 300;

const SEASON = currentMlbSeason();
const PATH = "/baseball/mlb-postseason";
/** 다크 모드에서 남색·갈색 로고가 묻혀 밝은 원 위에 — 대진표 컴포넌트와 같은 값(클라이언트 모듈 상수는 서버에서 못 가져온다) */
const LOGO_CHIP = "dark:rounded-full dark:bg-white/90 dark:p-[2px]";

export const metadata: Metadata = {
  title: `MLB 포스트시즌 대진표 ${SEASON} — 와일드카드·디비전·챔피언십·월드시리즈 일정`,
  description: `${SEASON} MLB 포스트시즌(가을야구) 대진표를 한국어로. 와일드카드 시리즈부터 월드시리즈까지 시드·일정(한국시간)·시리즈 스코어, AI 시리즈 승리 확률, 김하성·송성문·이정후 소속팀 진출 현황까지 실시간 갱신.`,
  keywords: ["MLB 포스트시즌", "MLB 플레이오프", "MLB 포스트시즌 대진표", "월드시리즈", "와일드카드 시리즈", "디비전 시리즈", "챔피언십 시리즈", "가을야구", "MLB 포스트시즌 일정", "스코어베이스"],
  alternates: { canonical: `${SITE_URL}${PATH}` },
  openGraph: {
    title: `MLB 포스트시즌 대진표 ${SEASON}`,
    description: "와일드카드부터 월드시리즈까지 — 시드·일정·시리즈 스코어·AI 시리즈 승리 확률.",
    url: `${SITE_URL}${PATH}`,
  },
};

/** "2026-09-27" 같은 현지 날짜 → "9/27" */
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

const weekday = (d: string) => ["일", "월", "화", "수", "목", "금", "토"][new Date(`${d}T12:00:00Z`).getUTCDay()];

function daysUntil(localDate: string, now: Date): number {
  // 현지 날짜 끝(미국 서부 기준 대략 다음 날 UTC 07시)까지 — 날짜 차이만 보면 되므로 정오 UTC 로 비교
  const end = Date.parse(`${localDate}T12:00:00Z`);
  return Math.ceil((end - now.getTime()) / 86400_000);
}

export default async function MlbPostseasonPage() {
  const page = await getMlbPostseason(SEASON);

  const now = new Date();
  const series = page?.data.series ?? [];
  const started = series.some((s) => s.state !== "SCHEDULED");
  const roundDates = (["wc", "ds", "lcs", "ws"] as MlbRound[]).map((r) => {
    const ds = series.filter((s) => s.round === r).flatMap((s) => s.games.map((g) => g.officialDate)).filter((d): d is string => !!d).sort();
    return { r, from: ds[0] ?? null, to: ds[ds.length - 1] ?? null, live: series.some((s) => s.round === r && s.state === "LIVE") };
  });
  const regLeft = page?.regularSeasonEnd ? daysUntil(page.regularSeasonEnd, now) : null;

  const status = !page
    ? "MLB 공식 데이터를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."
    : page.data.champion
      ? `${page.data.champion.name} 월드시리즈 우승으로 ${SEASON} 포스트시즌이 끝났습니다.`
      : started
        ? `${ROUND_LABEL[series.find((s) => s.state === "LIVE")?.round ?? series.find((s) => s.state === "SCHEDULED")?.round ?? "ws"]} 진행 중 — 시리즈 스코어와 다음 경기가 실시간으로 갱신됩니다.`
        : regLeft != null && regLeft >= 0
          ? `정규시즌 마지막 경기는 현지 ${md(page.regularSeasonEnd!)}(${weekday(page.regularSeasonEnd!)}) — 지금 대진은 현재 순위 기준 예상이며, 순위가 확정되는 대로 자동으로 바뀝니다.`
          : "정규시즌 종료 — 포스트시즌 대진이 확정되는 대로 채워집니다.";

  // 한국 선수 소속팀 현황 — 메이저리그 한국 선수 전원의 팀이 시드 안(진출권)인지, 추격 중인지, 밖인지
  const seedAll: SeedRow[] = page ? [...page.data.seeds.AL, ...page.data.seeds.NL] : [];
  const chaseAll = page ? [...page.data.chase.AL, ...page.data.chase.NL] : [];
  const koreaTeams = new Map<number, { players: string[]; name: string; note: string; inField: boolean }>();
  for (const p of BASEBALL_KOREA_PLAYERS) {
    if (p.level !== "MLB" || p.team?.id == null) continue;
    const id = p.team.id;
    const cur = koreaTeams.get(id);
    if (cur) {
      cur.players.push(p.nameKo);
      continue;
    }
    const seed = seedAll.find((x) => x.id === id);
    const chase = chaseAll.find((x) => x.id === id);
    koreaTeams.set(id, {
      players: [p.nameKo],
      name: seed?.name ?? chase?.name ?? (toKoreanTeamName(p.team.name, "MLB") || p.team.name),
      note: seed ? `${seed.seed}번 시드${seed.status ? ` · ${seed.status}` : " · 경쟁 중"}` : chase ? `와일드카드 ${chase.gamesBack}경기 차` : "진출권 밖",
      inField: !!seed,
    });
  }

  const jsonLd = [
    breadcrumbLd([
      { name: "홈", path: "/" },
      { name: "야구", path: "/baseball" },
      { name: "MLB 포스트시즌 대진표", path: PATH },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: `${SEASON} MLB 포스트시즌`,
      sport: "Baseball",
      startDate: page?.postSeasonStart ?? roundDates[0].from ?? undefined,
      endDate: roundDates[3].to ?? undefined,
      eventStatus: "https://schema.org/EventScheduled",
      url: `${SITE_URL}${PATH}`,
      organizer: { "@type": "SportsOrganization", name: "Major League Baseball", url: "https://www.mlb.com" },
      publisher: orgRef(),
    },
  ];

  const card =
    "rounded-[1.75rem] bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-6 dark:bg-white/[0.04] dark:shadow-none dark:ring-white/10";

  return (
    <main className="relative mx-auto max-w-[1480px] space-y-6 px-4 py-10 sm:px-6 sm:py-14">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> MLB Postseason {SEASON}
        </span>
        <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight break-keep sm:text-4xl">
          <Trophy className="h-7 w-7 shrink-0 text-amber-500 sm:h-8 sm:w-8" aria-hidden />
          MLB 포스트시즌 대진표
        </h1>
        <p className="max-w-3xl text-sm text-neutral-600 break-keep dark:text-neutral-400">{status}</p>
        <Link
          href="/baseball/postseason/stats?league=MLB"
          className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400"
        >
          <BarChart3 className="h-4 w-4" aria-hidden /> 포스트시즌 선수 통계
        </Link>
        <ol className="flex flex-wrap gap-2 pt-1" aria-label="라운드 일정">
          {roundDates.map(({ r, from, to, live }) => (
            <li
              key={r}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ring-1 ${
                live
                  ? "bg-rose-500/10 font-semibold text-rose-700 ring-rose-500/30 dark:text-rose-300"
                  : "bg-white text-neutral-700 ring-black/5 dark:bg-white/[0.04] dark:text-neutral-300 dark:ring-white/10"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5 opacity-60" aria-hidden />
              <span className="font-semibold">{ROUND_LABEL[r]}</span>
              {from && <span className="tabular-nums text-neutral-500 dark:text-neutral-400">{from === to ? md(from) : `${md(from)}~${md(to!)}`}</span>}
            </li>
          ))}
          <li className="self-center text-[11px] text-neutral-400">날짜는 미국 현지 기준 · 경기 시각은 카드에 한국시간</li>
        </ol>
      </header>

      {page && (
        <section aria-label="대진표" className={`${card} sm:p-4`}>
          <MlbPostseasonBracket
            series={series}
            logoById={page.logoById}
            teamPageById={page.teamPageById}
            gameHrefByPk={page.gameHrefByPk}
          />
        </section>
      )}

      {page && koreaTeams.size > 0 && (
        <section className={card} aria-labelledby="korea-h">
          <h2 id="korea-h" className="mb-3 text-base font-bold tracking-tight">
            <span aria-hidden>🇰🇷</span> 한국 선수 소속팀
          </h2>
          <ul className="flex flex-wrap gap-2">
            {[...koreaTeams.entries()].sort((x, y) => Number(y[1].inField) - Number(x[1].inField)).map(([id, t]) => {
              return (
                <li key={id} className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm ${t.inField ? "bg-emerald-500/[0.07] ring-1 ring-emerald-500/20" : "bg-neutral-50 dark:bg-white/[0.03]"}`}>
                  {page.logoById[id] && (
                    <TeamLogoImg url={page.logoById[id]} name={t.name} size={20} className={`h-5 w-5 object-contain ${LOGO_CHIP}`} fallbackClassName="h-5 w-5 rounded-full bg-neutral-200" />
                  )}
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-rose-600 dark:text-rose-400">{t.players.join("·")}</span>
                  <span className={`text-xs tabular-nums ${t.inField ? "font-semibold text-emerald-700 dark:text-emerald-300" : "text-neutral-500"}`}>{t.note}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {page && (
        <section aria-labelledby="seeds-h" className="space-y-3">
          <h2 id="seeds-h" className="text-lg font-bold tracking-tight">
            시드 현황 <span className="text-sm font-normal text-neutral-500">{page.data.fieldSet ? "확정" : "현재 순위 기준"}</span>
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {(["AL", "NL"] as const).map((lg) => (
              <div key={lg} className={card}>
                <h3 className="mb-3 text-sm font-bold">{lg === "AL" ? "아메리칸리그" : "내셔널리그"}</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-neutral-500">
                      <th scope="col" className="w-10 pb-2 font-medium">시드</th>
                      <th scope="col" className="pb-2 font-medium">팀</th>
                      <th scope="col" className="pb-2 text-right font-medium">승-패</th>
                      <th scope="col" className="pb-2 text-right font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.data.seeds[lg].map((r) => (
                      <tr key={r.id} className="border-t border-black/5 dark:border-white/10">
                        <td className="py-2 font-bold tabular-nums text-neutral-500">{r.seed}</td>
                        <td className="py-2">
                          <span className="flex items-center gap-2">
                            {page.logoById[r.id] && (
                              <TeamLogoImg url={page.logoById[r.id]} name={r.name} size={18} className={`h-[18px] w-[18px] object-contain ${LOGO_CHIP}`} fallbackClassName="h-[18px] w-[18px] rounded-full bg-neutral-200" />
                            )}
                            {page.teamPageById[r.id] ? (
                              <Link href={`/teams/${page.teamPageById[r.id]}`} prefetch={false} className="whitespace-nowrap font-semibold hover:underline">{r.name}</Link>
                            ) : (
                              <span className="font-semibold">{r.name}</span>
                            )}
                            <span className="hidden whitespace-nowrap text-[10px] text-neutral-400 sm:inline">{r.divisionWinner ? "지구 1위" : "와일드카드"}</span>
                          </span>
                        </td>
                        <td className="py-2 text-right tabular-nums">{r.wins}-{r.losses}</td>
                        <td className="py-2 text-right">
                          {r.status ? (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">{r.status}</span>
                          ) : (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">경쟁 중</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {page.data.chase[lg].map((c) => (
                      <tr key={c.id} className="border-t border-dashed border-black/10 text-neutral-500 dark:border-white/10">
                        <td className="py-2 text-[11px]">추격</td>
                        <td className="py-2">
                          <span className="flex items-center gap-2">
                            {page.logoById[c.id] && (
                              <TeamLogoImg url={page.logoById[c.id]} name={c.name} size={18} className={`h-[18px] w-[18px] object-contain opacity-70 ${LOGO_CHIP}`} fallbackClassName="h-[18px] w-[18px] rounded-full bg-neutral-200" />
                            )}
                            {c.name}
                          </span>
                        </td>
                        <td className="py-2 text-right tabular-nums">{c.wins}-{c.losses}</td>
                        <td className="py-2 text-right text-[11px] tabular-nums">와일드카드 {c.gamesBack}경기 차</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={card} aria-labelledby="format-h">
        <h2 id="format-h" className="mb-3 flex items-center gap-2 text-base font-bold tracking-tight">
          <Info className="h-4 w-4 text-rose-500" aria-hidden /> MLB 포스트시즌 방식
        </h2>
        <ul className="space-y-1.5 text-sm leading-relaxed text-neutral-600 break-keep dark:text-neutral-400">
          <li>리그마다 6팀, 모두 12팀이 나갑니다. 지구 우승 3팀이 승률 순으로 1~3번, 지구 우승을 못 한 팀 중 승률 상위 3팀이 와일드카드로 4~6번 시드입니다.</li>
          <li>1·2번 시드는 와일드카드 시리즈 없이 디비전 시리즈로 바로 올라갑니다.</li>
          <li>와일드카드 시리즈(3전 2선승)는 3번 대 6번, 4번 대 5번이 붙고 세 경기 모두 상위 시드 홈에서 열립니다.</li>
          <li>디비전 시리즈(5전 3선승)에서 1번 시드는 4·5번 승자, 2번 시드는 3·6번 승자와 만납니다. 이어 리그 챔피언십 시리즈와 월드시리즈(각 7전 4선승)로 우승을 가립니다.</li>
          <li>
            AI 시리즈 승리 확률은 스코어베이스 자체 Elo 레이팅으로 경기별 승률을 구한 뒤(홈 경기 소폭 가산), 시리즈 홈 순서대로 계산한 추정치입니다.
            선발 로테이션·부상은 반영하지 않으며 배당과 다를 수 있습니다.
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Link href="/baseball/postseason/stats?league=MLB" className="rounded-full bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-200 dark:hover:bg-white/10">포스트시즌 선수 통계</Link>
          <Link href="/leagues/MLB" className="rounded-full bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-200 dark:hover:bg-white/10">MLB 리그 페이지</Link>
          <Link href="/baseball/korea" className="rounded-full bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-200 dark:hover:bg-white/10">해외파 한국 야구 선수</Link>
          <Link href="/baseball" className="rounded-full bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-200 dark:hover:bg-white/10">야구 허브</Link>
        </div>
        <p className="mt-3 text-[11px] text-neutral-400">출처 MLB 공식 기록(statsapi.mlb.com) · 5분마다 갱신</p>
      </section>
    </main>
  );
}
