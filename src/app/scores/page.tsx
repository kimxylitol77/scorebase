// /scores — 라이브/종료/예정 통합 스코어 페이지.
// 종목 탭 (전체·축구·야구·농구·하키·e스포츠) + 일자 nav (어제·오늘·내일) + 리그 그룹화.
// 라이브 매치는 ScoresLiveCards (client) 가 별도 polling.

import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import {
  SPORTS,
  leaguesForSport,
  LEAGUE_DISPLAY,
  LEAGUE_ORDER,
  type SportCode,
} from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";
import LeagueBadge from "@/components/LeagueBadge";
import ScoresLiveCards from "@/components/ScoresLiveCards";
import { fetchAllLiveScores, type LiveMatch } from "@/lib/sports/live-scores";

// 외부 API 라이브 매치 결과를 30초 캐시 — /scores SSR 시점에 호출되지만
// 30초 동안은 캐시 hit, page 로딩 즉시.
const fetchLiveCached = unstable_cache(
  fetchAllLiveScores,
  ["scores-page-live"],
  { revalidate: 30, tags: ["live-scores"] },
);

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ date?: string; sport?: string }>;
}

export const metadata: Metadata = {
  title: "라이브 스코어 — 모든 리그 실시간",
  description:
    "EPL · KBO · NPB · MLB · NBA · NHL · UCL · LCK 13개 리그의 라이브 / 종료 / 예정 매치를 한 페이지에. 30초 자동 갱신.",
  alternates: { canonical: "https://www.scorebase.kr/scores" },
};

function parseKstDate(s: string | undefined): Date {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00+09:00`);
  }
  // 오늘 (KST 자정)
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  return new Date(
    Date.UTC(
      nowKst.getUTCFullYear(),
      nowKst.getUTCMonth(),
      nowKst.getUTCDate(),
      -9, // KST 0시 = UTC 전날 15시 → KST 자정을 UTC 로 변환
    ),
  );
}

function kstDateLabel(d: Date): string {
  return d.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function kstHHmm(d: Date): string {
  return d.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function dateQuery(d: Date): string {
  // KST 기준 yyyy-mm-dd
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}

export default async function ScoresPage({ searchParams }: Props) {
  const sp = await searchParams;
  const sport = (
    SPORTS.find((s) => s.code === sp.sport)?.code ?? "all"
  ) as SportCode;
  const leagues = leaguesForSport(sport);
  const day = parseKstDate(sp.date);
  const dayEnd = new Date(day.getTime() + 24 * 3600 * 1000);

  const [matches, liveMatches] = await Promise.all([
    prisma.match.findMany({
      where: {
        league: { in: leagues },
        startTime: { gte: day, lt: dayEnd },
        // 연기/취소된 매치(POSTPONED)는 라이브 스코어에서 숨김 — 매치는
        // DB 에 남기고(글 페이지에서는 접근 가능) 일자별 list 에서만 제외.
        status: { not: "POSTPONED" },
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        // 매치별 PREVIEW/RECAP article — 클릭 시 deep-link 용
        articles: {
          where: { status: "PUBLISHED" },
          select: { slug: true, type: true },
        },
      },
      orderBy: { startTime: "asc" },
    }),
    fetchLiveCached(),
  ]);

  // 외부 라이브 데이터 매칭 — externalId 우선, 안 되면 이름+시간 fallback.
  // 우리 collector 는 ESPN ID 쓰는데 (MLB/NBA/NHL/MLS) 라이브 API 는 API-Sports/BDL/
  // API-Football ID 라 다른 시스템 → externalId 만으로는 매칭 실패. NPB 만 같은 ID 시스템.
  const liveByExternalId = new Map<string, LiveMatch>();
  const liveByNameTime = new Map<string, LiveMatch>();
  function normalizeName(s: string): string {
    // DB 측은 한글 (예: '클리블랜드 캐벌리어스'), API 측은 영문 (예: 'Cleveland
    // Cavaliers') 인 케이스가 있어 (NBA/NHL), toKoreanTeamName 으로 양쪽 한국어 통일
    // 후 정규화. (이미 한국어면 그대로 반환, 영문이면 한국어로 변환)
    const ko = toKoreanTeamName(s);
    return ko
      .toLowerCase()
      // 흔한 축구 suffix 제거 (DB 'Seattle Sounders FC' vs API 'Seattle Sounders' 등)
      .replace(/\b(fc|sc|cf|united|club|esports|f\.c\.|s\.c\.)\b/g, "")
      .replace(/[\s.·\-_]/g, "");
  }
  for (const lm of liveMatches) {
    const rawId = lm.id.replace(/^[a-z]+-/i, "");
    liveByExternalId.set(rawId, lm);
    // fallback key: league + 정규화 home/away 이름 (시간 제외 — BDL NBA 처럼
    // startTime 이 date-only 인 경우도 대응. 같은 날 같은 두 팀 LIVE 동시 X 라 unique)
    const home = normalizeName(lm.homeName);
    const away = normalizeName(lm.awayName);
    liveByNameTime.set(`${lm.league}|${home}|${away}`, lm);
  }
  function matchLive(m: { externalId: string; league: string; startTime: Date; homeTeam: { name: string }; awayTeam: { name: string } }): LiveMatch | undefined {
    const byId = liveByExternalId.get(m.externalId);
    if (byId) return byId;
    const key = `${m.league}|${normalizeName(m.homeTeam.name)}|${normalizeName(m.awayTeam.name)}`;
    return liveByNameTime.get(key);
  }

  // 야구 매치 starter JSON 파싱 — KBO/NPB/MLB 만 적용
  function parseStarter(json: string | null): string | null {
    if (!json) return null;
    try {
      const obj = JSON.parse(json) as { name?: string };
      return obj.name?.trim() || null;
    } catch {
      return null;
    }
  }
  const BASEBALL_LEAGUES = new Set(["KBO", "NPB", "MLB"]);

  // 매치별 PREVIEW / RECAP slug 분리 — 둘 다 있으면 row 우측에 각각 칩 노출.
  function pickArticleSlugs(arts: { slug: string; type: string }[]): {
    preview?: string;
    recap?: string;
  } {
    return {
      preview: arts.find((a) => a.type === "PREVIEW")?.slug,
      recap: arts.find((a) => a.type === "RECAP")?.slug,
    };
  }

  // 리그별 그룹화 + 우선순위 정렬
  const byLeague = new Map<string, typeof matches>();
  for (const m of matches) {
    if (!byLeague.has(m.league)) byLeague.set(m.league, []);
    byLeague.get(m.league)!.push(m);
  }
  const groups = [...byLeague.entries()].sort(([a], [b]) => {
    return (LEAGUE_ORDER[a] ?? 99) - (LEAGUE_ORDER[b] ?? 99);
  });

  const totalCount = matches.length;
  // Stale LIVE 보정 후 카운트 — row 와 동일한 effStatus 로직
  function effStatusFor(m: { externalId: string; status: string; startTime: Date }): string {
    if (liveByExternalId.has(m.externalId)) return "LIVE";
    if (
      m.status === "LIVE" &&
      Date.now() - m.startTime.getTime() > 4 * 3600 * 1000
    ) return "FINISHED";
    return m.status;
  }
  const liveCount = matches.filter((m) => effStatusFor(m) === "LIVE").length;
  const finishedCount = matches.filter((m) => effStatusFor(m) === "FINISHED").length;
  const scheduledCount = matches.filter((m) => effStatusFor(m) === "SCHEDULED").length;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-5">
      {/* 헤더 */}
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
          라이브 스코어
        </h1>
        <p className="text-sm text-neutral-500">
          {kstDateLabel(day)} · 총 {totalCount}경기
          {liveCount > 0 && (
            <span className="ml-2 text-rose-600 dark:text-rose-400 font-semibold">
              ● LIVE {liveCount}
            </span>
          )}
          {finishedCount > 0 && (
            <span className="ml-2 text-neutral-400">종료 {finishedCount}</span>
          )}
          {scheduledCount > 0 && (
            <span className="ml-2 text-neutral-400">예정 {scheduledCount}</span>
          )}
        </p>
      </header>

      {/* 라이브 매치 (외부 API 실시간 스코어) */}
      <ScoresLiveCards sport={sport} />

      {/* 종목 탭 */}
      <nav className="flex gap-1 overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {SPORTS.map((s) => {
          const active = s.code === sport;
          const dateStr = sp.date ?? dateQuery(day);
          return (
            <Link
              key={s.code}
              href={`/scores?sport=${s.code}&date=${dateStr}`}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
                active
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800"
              }`}
            >
              <span aria-hidden>{s.emoji}</span>
              {s.label}
            </Link>
          );
        })}
      </nav>

      {/* 일자 nav — 어제 ~ +5일 칩 7개 (네이버 스포츠 스타일) */}
      <nav className="flex gap-1.5 overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {(() => {
          const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
          const todayMidUtc = new Date(
            Date.UTC(
              nowKst.getUTCFullYear(),
              nowKst.getUTCMonth(),
              nowKst.getUTCDate(),
              -9,
            ),
          );
          const selectedDs = sp.date ?? dateQuery(day);
          return Array.from({ length: 7 }, (_, i) => {
            const offset = i - 1; // -1 (어제) ~ +5
            const d = new Date(
              todayMidUtc.getTime() + offset * 24 * 3600 * 1000,
            );
            const ds = dateQuery(d);
            const active = ds === selectedDs;
            const isToday = offset === 0;
            const kst = new Date(d.getTime() + 9 * 3600 * 1000);
            const mm = kst.getUTCMonth() + 1;
            const dd = kst.getUTCDate();
            const weekday = d.toLocaleDateString("ko-KR", {
              timeZone: "Asia/Seoul",
              weekday: "short",
            });
            return (
              <Link
                key={ds}
                href={`/scores?sport=${sport}&date=${ds}`}
                className={`shrink-0 min-w-[68px] sm:flex-1 inline-flex flex-col items-center px-3 py-2 rounded-lg text-xs whitespace-nowrap transition tabular-nums ${
                  active
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-bold"
                    : "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 font-medium"
                }`}
              >
                <span
                  className={`text-[10px] h-[14px] leading-[14px] ${
                    isToday
                      ? active
                        ? "opacity-80"
                        : "text-rose-600 dark:text-rose-400 font-bold"
                      : "opacity-0"
                  }`}
                >
                  {isToday ? "오늘" : "—"}
                </span>
                <span className="mt-0.5">
                  {mm}/{dd} ({weekday})
                </span>
              </Link>
            );
          });
        })()}
      </nav>

      {/* 리그 그룹 list */}
      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-neutral-500 text-sm">
          이 날짜 / 종목 조합엔 매치가 없습니다.
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([league, list]) => (
            <section key={league}>
              <div className="flex items-center justify-between mb-2">
                <Link
                  href={`/leagues/${league}`}
                  className="inline-flex items-center gap-2 hover:opacity-80 transition"
                >
                  <LeagueBadge league={league} size="md" />
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                    {LEAGUE_DISPLAY[league] ?? league}
                  </span>
                </Link>
                <span className="text-[11px] text-neutral-400 tabular-nums">
                  {list.length}경기
                </span>
              </div>
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-950">
                {list.map((m) => {
                  const slugs = pickArticleSlugs(m.articles);
                  const isBaseball = BASEBALL_LEAGUES.has(m.league);
                  // 외부 라이브 데이터로 status/score override (DB cron 사이클 보강)
                  // matchLive 가 externalId 우선, 안 되면 league+시작시간+이름 fallback
                  const live = matchLive(m);
                  // Stale LIVE 보정: DB 가 LIVE 인데 외부 API 가 라이브로 안 잡고,
                  // 매치 시작 후 4시간이 지났으면 사실상 종료로 본다.
                  // (collect cron 사이클 간 시간에 stale 상태가 남는 케이스)
                  const elapsedMs = Date.now() - m.startTime.getTime();
                  const staleLive =
                    !live &&
                    m.status === "LIVE" &&
                    elapsedMs > 4 * 3600 * 1000;
                  const effStatus = live
                    ? "LIVE"
                    : staleLive
                      ? "FINISHED"
                      : m.status;
                  const effHomeScore = live ? live.homeScore : m.homeScore;
                  const effAwayScore = live ? live.awayScore : m.awayScore;
                  return (
                    <MatchRow
                      key={m.id}
                      homeName={toKoreanTeamName(m.homeTeam.name)}
                      awayName={toKoreanTeamName(m.awayTeam.name)}
                      homeShortName={m.homeTeam.shortName ?? null}
                      awayShortName={m.awayTeam.shortName ?? null}
                      homeLogo={m.homeTeam.logoUrl}
                      awayLogo={m.awayTeam.logoUrl}
                      homeScore={effHomeScore}
                      awayScore={effAwayScore}
                      status={effStatus}
                      timeLabel={kstHHmm(m.startTime)}
                      liveStatusLabel={live?.statusLabel ?? null}
                      league={m.league}
                      previewSlug={slugs.preview}
                      recapSlug={slugs.recap}
                      homeStarter={
                        isBaseball ? parseStarter(m.homeStarter) : null
                      }
                      awayStarter={
                        isBaseball ? parseStarter(m.awayStarter) : null
                      }
                    />
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="text-[11px] text-neutral-500 leading-relaxed pt-2">
        ⓘ 라이브 스코어는 30초 자동 갱신. 종료·예정 매치는 우리 매치 DB 의 일자별 일정.
      </p>
    </div>
  );
}

function TeamLogo({ url, name }: { url: string | null; name: string }) {
  if (url) {
    // Liquipedia (LCK 로고) 는 hotlink Referer 검사로 외부 사이트에서 직접
    // 가져오지 못함 → Next.js image optimizer 통해 서버가 fetch 후 재제공.
    // 다른 리그 CDN (ESPN/api-sports/football-data) 은 hotlink 허용해서
    // plain <img> 로 직접 → image optimizer 비용/한도 안 씀.
    if (url.includes("liquipedia.net")) {
      return (
        <Image
          src={url}
          alt=""
          width={28}
          height={28}
          className="w-6 h-6 sm:w-7 sm:h-7 object-contain shrink-0"
          unoptimized={false}
        />
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="w-6 h-6 sm:w-7 sm:h-7 object-contain shrink-0"
        loading="lazy"
      />
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-neutral-200 dark:bg-neutral-800 text-[10px] font-bold text-neutral-500 shrink-0">
      {name.slice(0, 1)}
    </span>
  );
}

function MatchRow({
  homeName,
  awayName,
  homeShortName,
  awayShortName,
  homeLogo,
  awayLogo,
  homeScore,
  awayScore,
  status,
  timeLabel,
  liveStatusLabel,
  league,
  previewSlug,
  recapSlug,
  homeStarter,
  awayStarter,
}: {
  homeName: string;
  awayName: string;
  homeShortName?: string | null;
  awayShortName?: string | null;
  homeLogo: string | null;
  awayLogo: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  timeLabel: string;
  liveStatusLabel?: string | null;
  league: string;
  previewSlug?: string;
  recapSlug?: string;
  homeStarter?: string | null;
  awayStarter?: string | null;
}) {
  // 모바일에선 shortName (예: 'NS', '두산', 'T1'), 데스크탑은 풀네임.
  // shortName 없으면 풀네임 fallback.
  const homeMobile = homeShortName || homeName;
  const awayMobile = awayShortName || awayName;
  const hasArticle = !!(previewSlug || recapSlug);
  const isLive = status === "LIVE";
  const isFinished = status === "FINISHED";
  const statusBadge = isLive ? (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 whitespace-nowrap"
      title={liveStatusLabel ?? "LIVE"}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
      <span>LIVE</span>
      {liveStatusLabel && (
        <span className="font-semibold opacity-90 tabular-nums">
          · {liveStatusLabel}
        </span>
      )}
    </span>
  ) : isFinished ? (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
      종료
    </span>
  ) : (
    <span className="text-[11px] font-medium text-neutral-400 tabular-nums">
      {timeLabel}
    </span>
  );

  return (
    <li className="group relative hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition px-2 sm:px-4 py-3 grid grid-cols-[4.5rem_1fr_4rem] sm:grid-cols-[6.5rem_1fr_6rem] gap-1.5 sm:gap-3 items-center text-sm">
      <div className="flex items-center justify-center">
        {statusBadge}
      </div>
      <div className="min-w-0 grid grid-cols-[1fr_auto_1fr] gap-1.5 sm:gap-3 items-center">
        {/* 원정팀 */}
        <div className="min-w-0 flex items-center gap-1.5 sm:gap-2.5 justify-end">
          <div className="min-w-0 text-right">
            <div className="truncate font-medium">
              <span className="sm:hidden">{awayMobile}</span>
              <span className="hidden sm:inline">{awayName}</span>
            </div>
            {awayStarter && (
              <div className="truncate text-[10px] text-neutral-500 mt-0.5">
                선발 {awayStarter}
              </div>
            )}
          </div>
          <TeamLogo url={awayLogo} name={awayName} />
        </div>
        {/* 스코어 */}
        <div className="text-center font-black tabular-nums tracking-tight min-w-[3rem]">
          {homeScore != null && awayScore != null ? (
            <span className={isLive ? "text-rose-600 dark:text-rose-400" : ""}>
              {awayScore} - {homeScore}
            </span>
          ) : (
            <span className="text-neutral-300 dark:text-neutral-600">vs</span>
          )}
        </div>
        {/* 홈팀 */}
        <div className="min-w-0 flex items-center gap-1.5 sm:gap-2.5">
          <TeamLogo url={homeLogo} name={homeName} />
          <div className="min-w-0">
            <div className="truncate font-medium">
              <span className="sm:hidden">{homeMobile}</span>
              <span className="hidden sm:inline">{homeName}</span>
            </div>
            {homeStarter && (
              <div className="truncate text-[10px] text-neutral-500 mt-0.5">
                선발 {homeStarter}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* 글 칩 — PREVIEW / RECAP 별도 (있는 것만) */}
      <div className="flex items-center justify-end gap-1 sm:gap-1.5">
        {previewSlug ? (
          <Link
            href={`/articles/${previewSlug}`}
            prefetch={false}
            className="px-1.5 sm:px-2 py-1 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition whitespace-nowrap"
          >
            프리뷰
          </Link>
        ) : null}
        {recapSlug ? (
          <Link
            href={`/articles/${recapSlug}`}
            prefetch={false}
            className="px-1.5 sm:px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition whitespace-nowrap"
          >
            리뷰
          </Link>
        ) : null}
        {!previewSlug && !recapSlug ? (
          <Link
            href={`/leagues/${league}`}
            prefetch={false}
            className="hidden sm:inline-block text-[10px] text-neutral-300 dark:text-neutral-700"
            title="아직 글 없음"
          >
            —
          </Link>
        ) : null}
      </div>
      {/* 데스크탑 호버 popover */}
      <div className="hidden sm:block pointer-events-none absolute z-20 left-1/2 -translate-x-1/2 top-full mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-lg px-3 py-2 text-xs whitespace-nowrap">
          <div className="font-semibold text-neutral-900 dark:text-white">
            {awayName} <span className="text-neutral-400">vs</span> {homeName}
          </div>
          <div className="mt-0.5 text-neutral-500">
            {isLive
              ? "● 진행 중"
              : isFinished
                ? `종료 · ${awayScore ?? 0} - ${homeScore ?? 0}`
                : `예정 · KST ${timeLabel}`}
            {hasArticle && (
              <span className="ml-2 text-blue-600 dark:text-blue-400">
                · {previewSlug && recapSlug ? "프리뷰 + 리뷰" : previewSlug ? "프리뷰" : "리뷰"} 있음
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
