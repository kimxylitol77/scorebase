// KBO·NPB 포스트시즌 대진표 페이지 본문(서버) — 헤더·라운드 일정·대진표·시드 현황·시리즈별 경기·방식 설명. MLB 대진표 페이지와 같은 구성.
import Link from "next/link";
import { CalendarDays, Info, Trophy } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import TeamLogoImg from "@/components/TeamLogoImg";
import LadderBracket, { kstTime } from "@/components/baseball/LadderBracket";
import { SITE_URL } from "@/lib/site-url";
import { breadcrumbLd, jsonLdScript, orgRef } from "@/lib/seo/jsonld";
import { REGULAR_GAMES, type LadderLeague, type LSeries } from "@/lib/sports/baseball/ladder-postseason";
import type { LadderPage } from "@/lib/sports/baseball/kbo-npb-postseason";

const LOGO_CHIP = "dark:rounded-full dark:bg-white/90 dark:p-[2px]";

const COPY: Record<LadderLeague, { title: string; eyebrow: string; rounds: Array<{ label: string; keys: string[] }>; format: string[]; organizer: { name: string; url: string } }> = {
  KBO: {
    title: "KBO 포스트시즌 대진표",
    eyebrow: "KBO Postseason",
    rounds: [
      { label: "와일드카드", keys: ["wc"] },
      { label: "준플레이오프", keys: ["spo"] },
      { label: "플레이오프", keys: ["po"] },
      { label: "한국시리즈", keys: ["ks"] },
    ],
    format: [
      "정규시즌 1~5위가 나갑니다. 아래 순위 팀이 이기면 한 계단씩 올라가 위 순위 팀과 붙는 계단식입니다.",
      "와일드카드 결정전은 4위와 5위가 4위 홈에서 최대 2경기를 합니다. 4위가 1승을 안고 시작해 1경기만 이기거나 비겨도 올라가고, 5위는 2경기를 모두 이겨야 합니다.",
      "준플레이오프(3위)와 플레이오프(2위)는 5전 3선승제, 한국시리즈(1위)는 7전 4선승제입니다.",
    ],
    organizer: { name: "KBO", url: "https://www.koreabaseball.com" },
  },
  NPB: {
    title: "NPB 포스트시즌 대진표",
    eyebrow: "NPB Postseason",
    rounds: [
      { label: "CS 퍼스트", keys: ["fs-c", "fs-p"] },
      { label: "CS 파이널", keys: ["final-c", "final-p"] },
      { label: "일본시리즈", keys: ["js"] },
    ],
    format: [
      "센트럴·퍼시픽 리그마다 1~3위가 클라이맥스 시리즈(CS)에 나갑니다.",
      "퍼스트 스테이지는 2위와 3위가 2위 홈에서 3전 2선승제로 붙고, 승패가 같으면 2위가 올라갑니다.",
      "파이널 스테이지는 1위가 1승을 안고 시작해 먼저 4승을 채우면 올라가며, 최대 6경기를 모두 1위 홈에서 합니다. 승패가 같으면 1위가 올라갑니다.",
      "일본시리즈는 두 리그 챔피언의 7전 4선승제입니다. 1차전 개최는 해마다 번갈아 짝수 해 센트럴, 홀수 해 퍼시픽 챔피언이 먼저 홈에서 합니다.",
    ],
    organizer: { name: "Nippon Professional Baseball", url: "https://npb.jp" },
  },
};

const md = (iso: string) => new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(iso)).replace(/\.\s?/g, "/").replace(/\/$/, "");

export default function LadderPostseasonView({ league, season, page, path }: { league: LadderLeague; season: number; page: LadderPage | null; path: string }) {
  const c = COPY[league];
  const model = page?.model;
  const series = model?.series ?? [];
  const byKey = Object.fromEntries(series.map((s) => [s.key, s]));
  const started = series.some((s) => s.state !== "SCHEDULED");
  const current = series.find((s) => s.state === "LIVE") ?? series.find((s) => s.state === "SCHEDULED" && s.top.id != null && s.bottom.id != null && s.games.length > 0);
  const left = model ? Math.max(0, ...Object.values(model.seeds).flat().map((r) => REGULAR_GAMES[league] - r.played)) : 0;
  const status = !model
    ? "공식 순위 데이터를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."
    : model.champion
      ? `${model.champion.name} 우승으로 ${season} 포스트시즌이 끝났습니다.`
      : started
        ? `${current?.label ?? "포스트시즌"} 진행 중 — 시리즈 스코어와 다음 경기가 갱신됩니다.`
        : !model.regularDone
          ? `정규시즌 진행 중(팀당 남은 경기 최대 ${left}경기) — 지금 대진은 현재 순위 기준 예상이며, 순위가 확정되는 대로 자동으로 바뀝니다.`
          : "정규시즌이 끝나 대진이 확정됐습니다. 첫 경기 일정이 나오면 여기에 채워집니다.";

  const roundDates = c.rounds.map((r) => {
    const ds = r.keys.flatMap((k) => byKey[k]?.games.map((g) => g.date) ?? []).sort();
    return { label: r.label, from: ds[0] ?? null, to: ds[ds.length - 1] ?? null, live: r.keys.some((k) => byKey[k]?.state === "LIVE") };
  });
  const played = series.filter((s) => s.games.length > 0);

  const jsonLd = [
    breadcrumbLd([{ name: "홈", path: "/" }, { name: "야구", path: "/baseball" }, { name: c.title, path }]),
    {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: `${season} ${league} 포스트시즌`,
      sport: "Baseball",
      startDate: roundDates[0].from ?? undefined,
      endDate: roundDates[roundDates.length - 1].to ?? undefined,
      eventStatus: "https://schema.org/EventScheduled",
      url: `${SITE_URL}${path}`,
      organizer: { "@type": "SportsOrganization", ...c.organizer },
      publisher: orgRef(),
    },
  ];
  const card = "rounded-[1.75rem] bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-6 dark:bg-white/[0.04] dark:shadow-none dark:ring-white/10";
  const chip = "rounded-full bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-200 dark:hover:bg-white/10";
  const logo = (id: number, name: string, dim?: boolean) =>
    page?.logoById[id] ? (
      <TeamLogoImg url={page.logoById[id]} name={name} size={18} className={`h-[18px] w-[18px] object-contain ${dim ? "opacity-70" : ""} ${LOGO_CHIP}`} fallbackClassName="h-[18px] w-[18px] rounded-full bg-neutral-200" />
    ) : null;

  return (
    <main className="relative mx-auto max-w-[1280px] space-y-6 px-4 py-10 sm:px-6 sm:py-14">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> {c.eyebrow} {season}
        </span>
        <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight break-keep sm:text-4xl">
          <Trophy className="h-7 w-7 shrink-0 text-amber-500 sm:h-8 sm:w-8" aria-hidden />
          {c.title}
        </h1>
        <p className="max-w-3xl text-sm text-neutral-600 break-keep dark:text-neutral-400">{status}</p>
        <ol className="flex flex-wrap gap-2 pt-1" aria-label="라운드 일정">
          {roundDates.map(({ label, from, to, live }) => (
            <li key={label} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ring-1 ${live ? "bg-rose-500/10 font-semibold text-rose-700 ring-rose-500/30 dark:text-rose-300" : "bg-white text-neutral-700 ring-black/5 dark:bg-white/[0.04] dark:text-neutral-300 dark:ring-white/10"}`}>
              <CalendarDays className="h-3.5 w-3.5 opacity-60" aria-hidden />
              <span className="font-semibold">{label}</span>
              {from && <span className="tabular-nums text-neutral-500 dark:text-neutral-400">{md(from) === md(to!) ? md(from) : `${md(from)}~${md(to!)}`}</span>}
            </li>
          ))}
        </ol>
        <Link href={`/baseball/postseason/stats?league=${league}`} className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400">
          포스트시즌 선수 통계
        </Link>
      </header>

      {model && (
        <section aria-label="대진표" className={card}>
          <LadderBracket model={model} logoById={page.logoById} />
        </section>
      )}

      {model && (
        <section aria-labelledby="seeds-h" className="space-y-3">
          <h2 id="seeds-h" className="text-lg font-bold tracking-tight">
            시드 현황 <span className="text-sm font-normal text-neutral-500">{model.regularDone ? "확정" : "현재 순위 기준"}</span>
          </h2>
          <div className={`grid gap-4 ${league === "NPB" ? "md:grid-cols-2" : ""}`}>
            {Object.entries(model.seeds).map(([g, rows]) => (
              <div key={g || "all"} className={card}>
                {g && <h3 className="mb-3 text-sm font-bold">{g}리그</h3>}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-neutral-500">
                      <th scope="col" className="w-10 pb-2 font-medium">시드</th>
                      <th scope="col" className="pb-2 font-medium">팀</th>
                      <th scope="col" className="pb-2 text-right font-medium">승-무-패</th>
                      <th scope="col" className="hidden pb-2 text-right font-medium sm:table-cell">승률</th>
                      <th scope="col" className="pb-2 text-right font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.teamId} className="border-t border-black/5 dark:border-white/10">
                        <td className="py-2 font-bold tabular-nums text-neutral-500">{r.seed}</td>
                        <td className="py-2">
                          <span className="flex items-center gap-2">
                            {logo(r.teamId, r.name)}
                            <Link href={`/teams/${r.teamId}`} prefetch={false} className="whitespace-nowrap font-semibold hover:underline">{r.name}</Link>
                          </span>
                        </td>
                        <td className="py-2 text-right tabular-nums">{r.wins}-{r.draws}-{r.losses}</td>
                        <td className="hidden py-2 text-right tabular-nums sm:table-cell">{r.pct.toFixed(3).replace(/^0/, "")}</td>
                        <td className="py-2 text-right">
                          {r.clinched ? (
                            <span className="whitespace-nowrap rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">진출 확정</span>
                          ) : (
                            <span className="whitespace-nowrap rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">경쟁 중</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {model.chase[g]?.map((r) => (
                      <tr key={r.teamId} className="border-t border-dashed border-black/10 text-neutral-500 dark:border-white/10">
                        <td className="py-2 text-[11px]">추격</td>
                        <td className="py-2">
                          <span className="flex items-center gap-2">{logo(r.teamId, r.name, true)}{r.name}</span>
                        </td>
                        <td className="py-2 text-right tabular-nums">{r.wins}-{r.draws}-{r.losses}</td>
                        <td className="hidden py-2 text-right tabular-nums sm:table-cell">{r.pct.toFixed(3).replace(/^0/, "")}</td>
                        <td className="whitespace-nowrap py-2 text-right text-[11px] tabular-nums">{r.eliminated ? "탈락" : `${r.gamesBack}경기 차`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-neutral-400 break-keep">
            진출 확정은 남은 경기를 모두 져도 추격 팀이 모두 이겼을 때보다 승률이 높을 때만 표시합니다(동률·상대 전적은 따지지 않아 실제 확정보다 늦게 뜰 수 있습니다).
          </p>
        </section>
      )}

      {played.length > 0 && (
        <section className={card} aria-labelledby="games-h">
          <h2 id="games-h" className="mb-3 text-base font-bold tracking-tight">시리즈별 경기</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {played.map((s) => <SeriesGames key={s.key} s={s} />)}
          </div>
        </section>
      )}

      <section className={card} aria-labelledby="format-h">
        <h2 id="format-h" className="mb-3 flex items-center gap-2 text-base font-bold tracking-tight">
          <Info className="h-4 w-4 text-rose-500" aria-hidden /> {league} 포스트시즌 방식
        </h2>
        <ul className="space-y-1.5 text-sm leading-relaxed text-neutral-600 break-keep dark:text-neutral-400">
          {c.format.map((t) => <li key={t}>{t}</li>)}
          <li>AI 시리즈 승리 확률은 스코어베이스 자체 Elo 레이팅으로 경기별 승률을 구한 뒤(홈 경기 소폭 가산), 1승 어드밴티지와 홈 순서를 넣어 계산한 추정치입니다. 선발 로테이션·부상은 반영하지 않습니다.</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Link href={`/baseball/postseason/stats?league=${league}`} className={chip}>포스트시즌 선수 통계</Link>
          <Link href={`/standings/${league}`} className={chip}>{league} 순위표</Link>
          <Link href={`/leagues/${league}`} className={chip}>{league} 리그 페이지</Link>
          <Link href="/baseball/mlb-postseason" className={chip}>MLB 포스트시즌 대진표</Link>
          <Link href="/baseball" className={chip}>야구 허브</Link>
        </div>
        <p className="mt-3 text-[11px] text-neutral-400">
          출처 {league === "KBO" ? "KBO 공식 순위·경기 결과" : "NPB 공식 순위·npb.jp 경기 일정"} · 5분마다 갱신
        </p>
      </section>
    </main>
  );
}

function SeriesGames({ s }: { s: LSeries }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-bold">{s.label}</span>
        <span className="tabular-nums text-neutral-500">
          {s.top.name} {s.winsTop}{s.advantage ? `(+${s.advantage})` : ""} - {s.winsBottom} {s.bottom.name}
        </span>
      </div>
      <ol className="divide-y divide-black/5 rounded-xl ring-1 ring-black/5 dark:divide-white/10 dark:ring-white/10">
        {s.games.map((g, i) => {
          const home = g.homeId === s.top.id ? s.top.name : s.bottom.name;
          const away = g.homeId === s.top.id ? s.bottom.name : s.top.name;
          const scored = g.homeScore != null && g.awayScore != null;
          const inner = (
            <span className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
              <span className="w-8 shrink-0 text-[11px] text-neutral-400">{i + 1}차전</span>
              <span className="w-28 shrink-0 text-[11px] tabular-nums text-neutral-500">{kstTime(g.date)}</span>
              <span className="min-w-0 flex-1 truncate">
                {away} <span className="tabular-nums font-semibold">{scored ? `${g.awayScore} - ${g.homeScore}` : "vs"}</span> {home}
                <span className="ml-1 text-[10px] text-neutral-400">({home} 홈)</span>
              </span>
              {g.state === "LIVE" && <span className="shrink-0 text-[10px] font-semibold text-rose-600">LIVE</span>}
            </span>
          );
          return (
            <li key={g.id}>
              {g.href ? (
                g.href.startsWith("http") ? (
                  <a href={g.href} target="_blank" rel="nofollow noopener" className="block hover:bg-neutral-50 dark:hover:bg-white/[0.04]">{inner}</a>
                ) : (
                  <Link href={g.href} prefetch={false} className="block hover:bg-neutral-50 dark:hover:bg-white/[0.04]">{inner}</Link>
                )
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
