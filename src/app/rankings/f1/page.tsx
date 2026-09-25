// F1 챔피언십 순위 — 드라이버·컨스트럭터. ESPN core standings + 한글명(위키/Haiku) + 팀 컬러.
// 배경·한계는 docs/f1-championship/context-notes.md

import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import TeamBadge from "@/components/TeamBadge";
import DriverAvatar from "@/components/scores/f1/DriverAvatar";
import CountryMark from "@/components/golf/CountryMark";
import { fetchF1Championship, fetchF1Season, F1_TEAM_LOGO } from "@/lib/sports/espn-f1";
import { breadcrumbLd, datasetLd } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site-url";
import { koEnLanguages } from "@/lib/i18n/en";

export const revalidate = 1800;

const YEAR = String(new Date().getFullYear());

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const isTeam = sp?.view === "team";
  // 시즌 일정·결과 — 한국시간 레이스 시각·우승자·폴. "F1 일정" 검색 착지점.
  if (sp?.view === "calendar") {
    return {
      title: `F1 ${YEAR} 그랑프리 일정·결과 — 한국시간 레이스 시각·우승자`,
      description: `${YEAR} 포뮬러 1 전 그랑프리 일정을 한국시간으로. 끝난 대회는 우승자·폴 포지션, 남은 대회는 레이스 시각까지 — 스코어베이스.`,
      keywords: ["F1 일정", "F1 경기 일정", "F1 그랑프리 일정", "F1 한국시간", "F1 결과", "F1 우승자"],
      alternates: { canonical: `${SITE_URL}/rankings/f1?view=calendar` },
    };
  }
  const label = isTeam ? "컨스트럭터(팀)" : "드라이버";
  return {
    title: `F1 ${label} 챔피언십 순위 — 포인트·우승 (${YEAR})`,
    description: `${YEAR} 포뮬러 1 ${label} 챔피언십 순위를 한국어로. 포인트·우승 횟수·선두와의 격차까지 한눈에. 페르스타펀·해밀턴·르클레르 등 드라이버와 레드불·페라리·맥라렌 팀 순위 — 스코어베이스.`,
    keywords: [
      "F1 순위", "F1 드라이버 순위", "F1 챔피언십", "포뮬러1 순위", "컨스트럭터 순위",
      "F1 포인트", "페르스타펀", "해밀턴", "르클레르", "노리스",
    ],
    alternates: {
      canonical: `${SITE_URL}/rankings/f1${isTeam ? "?view=team" : ""}`,
      languages: koEnLanguages(
        `/rankings/f1${isTeam ? "?view=team" : ""}`,
        `/en/rankings/f1${isTeam ? "?view=team" : ""}`,
      ),
    },
  };
}

export default async function F1RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  const isTeam = sp?.view === "team";
  const isCalendar = sp?.view === "calendar";
  const [{ drivers, constructors }, season] = await Promise.all([
    fetchF1Championship(YEAR),
    isCalendar ? fetchF1Season(YEAR) : Promise.resolve([]),
  ]);
  const view = isCalendar ? "calendar" : isTeam ? "team" : "driver";
  const jsonLd = [
    breadcrumbLd([
      { name: "홈", path: "/" },
      { name: "기타 종목", path: "/other" },
      { name: "F1 챔피언십", path: "/rankings/f1" },
    ]),
    datasetLd({
      name: `F1 ${YEAR} ${isCalendar ? "그랑프리 일정·결과" : isTeam ? "컨스트럭터 챔피언십 순위" : "드라이버 챔피언십 순위"}`,
      description: `스코어베이스가 ESPN 데이터로 갱신하는 ${YEAR} 포뮬러 1 ${isCalendar ? "그랑프리 일정(한국시간)·우승자·폴 포지션" : "순위·포인트·우승 횟수"}.`,
      path: `/rankings/f1${isCalendar ? "?view=calendar" : isTeam ? "?view=team" : ""}`,
      variableMeasured: isCalendar ? ["그랑프리", "레이스 시각", "우승자", "폴 포지션"] : ["순위", "포인트", "우승"],
      temporalCoverage: YEAR,
    }),
  ];

  const leader = drivers[0];

  return (
    <main className="relative max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <AmbientGlow />

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> F1 · {YEAR} 시즌
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-keep">
          F1 챔피언십 순위
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          {YEAR} 포뮬러 1 드라이버·컨스트럭터 순위. 포인트와 우승 횟수, 선두와의 격차를 한국어로 봅니다.
          {leader && (
            <>
              {" "}현재 선두는 <strong className="text-neutral-800 dark:text-neutral-200">{leader.nameKo ?? leader.name}</strong>
              {leader.teamKo && ` (${leader.teamKo})`} · {leader.points}포인트.
            </>
          )}
        </p>
      </header>

      {/* 뷰 탭 */}
      <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-100/60 p-1 dark:border-neutral-800 dark:bg-white/[0.04]">
        {[
          { key: "driver", label: "드라이버", href: "/rankings/f1" },
          { key: "team", label: "컨스트럭터", href: "/rankings/f1?view=team" },
          { key: "calendar", label: "일정·결과", href: "/rankings/f1?view=calendar" },
        ].map((t) => {
          const on = t.key === view;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? "bg-white font-bold text-rose-600 shadow-sm dark:bg-white/10 dark:text-rose-300"
                  : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/scores?sport=f1"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          🏎️ F1 그랑프리 일정·결과
        </Link>
        <Link
          href="/salaries/f1"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          드라이버 연봉 랭킹
        </Link>
      </div>

      {isCalendar ? (
        <F1Calendar season={season} koByName={new Map(drivers.map((d) => [d.name, d.nameKo]))} />
      ) : (isTeam ? constructors.length : drivers.length) === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-sm text-neutral-500">
          챔피언십 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      ) : isTeam ? (
        /* 컨스트럭터 */
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <div className="grid grid-cols-[40px_1fr_56px_56px_72px] items-center gap-2 border-b border-neutral-100 px-3 sm:px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:border-neutral-800">
            <span className="text-center">순위</span>
            <span>팀</span>
            <span className="text-center">우승</span>
            <span className="text-center">폴</span>
            <span className="text-right">포인트</span>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {constructors.map((c) => (
              <li key={c.name} className="grid grid-cols-[40px_1fr_56px_56px_72px] items-center gap-2 px-3 sm:px-4 py-3">
                <span className={`text-center font-black tabular-nums ${c.rank <= 3 ? "text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-300"}`}>
                  {c.rank}
                </span>
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-4 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color ?? "#9CA3AF" }}
                    aria-hidden
                  />
                  <TeamBadge logoUrl={F1_TEAM_LOGO[c.name] ?? null} size={22} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-white">
                      {c.nameKo ?? c.name}
                    </span>
                    {c.nameKo && <span className="block truncate text-[11px] text-neutral-400">{c.name}</span>}
                  </span>
                </span>
                <span className={`text-center text-sm tabular-nums ${c.wins > 0 ? "font-bold text-amber-500" : "text-neutral-400"}`}>
                  {c.wins}
                </span>
                <span className="text-center text-sm tabular-nums text-neutral-500">{c.poles}</span>
                <span className="text-right text-sm font-black tabular-nums text-neutral-900 dark:text-white">
                  {c.points}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        /* 드라이버 */
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <div className="grid grid-cols-[40px_1fr_52px_60px_72px] items-center gap-2 border-b border-neutral-100 px-3 sm:px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:border-neutral-800">
            <span className="text-center">순위</span>
            <span>드라이버</span>
            <span className="text-center">우승</span>
            <span className="text-center">격차</span>
            <span className="text-right">포인트</span>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {drivers.map((d) => (
              <li key={d.athleteId}>
                <Link
                  href={`/rankings/f1/${d.athleteId}`}
                  className="grid grid-cols-[40px_1fr_52px_60px_72px] items-center gap-2 px-3 sm:px-4 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.04]"
                >
                <span className={`text-center font-black tabular-nums ${d.rank <= 3 ? "text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-300"}`}>
                  {d.rank}
                </span>
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: d.teamColor ?? "#9CA3AF" }}
                    aria-hidden
                  />
                  <DriverAvatar
                    photo={`https://a.espncdn.com/i/headshots/rpm/players/full/${d.athleteId}.png`}
                    flag={null}
                    country={d.countryEn}
                    name={d.nameKo ?? d.name}
                  />
                  <CountryMark src={d.flag} country={d.countryEn} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-white">
                      {d.nameKo ?? d.name}
                      {d.carNumber && (
                        <span className="ml-1.5 align-middle text-[10px] font-bold text-neutral-400">#{d.carNumber}</span>
                      )}
                    </span>
                    <span className="block truncate text-[11px] text-neutral-400">
                      {d.teamKo ?? d.team ?? ""}
                      {d.dnf > 0 && ` · DNF ${d.dnf}`}
                    </span>
                  </span>
                </span>
                <span className={`text-center text-sm tabular-nums ${d.wins > 0 ? "font-bold text-amber-500" : "text-neutral-400"}`}>
                  {d.wins}
                </span>
                <span className="text-center text-[12px] tabular-nums text-neutral-500">
                  {d.rank === 1 ? "—" : `-${d.behind}`}
                </span>
                <span className="text-right text-sm font-black tabular-nums text-neutral-900 dark:text-white">
                  {d.points}
                </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="text-[11px] text-neutral-400 leading-relaxed pt-2">
        레이스 종료 후 공식 결과가 반영되기까지 시간이 걸릴 수 있습니다. 격차는 선두와의 포인트 차이,
        DNF 는 완주 실패 횟수입니다. 데이터 출처 ESPN.
      </footer>
    </main>
  );
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
function kst(iso: string) {
  const k = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} (${WEEKDAY[k.getUTCDay()]}) ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

/** 시즌 그랑프리 목록 — 끝난 대회는 우승·폴, 남은 대회는 한국시간 레이스 시각. 다음 레이스를 강조한다. */
function F1Calendar({
  season,
  koByName,
}: {
  season: Awaited<ReturnType<typeof fetchF1Season>>;
  /** 챔피언십 순위의 영문명 → 한글명 — 일정 API 의 선수 id 가 이름 사전 키와 달라 이름으로 한 번 더 찾는다 */
  koByName: Map<string, string | null>;
}) {
  const ko = (p: { name: string; nameKo: string | null }) => p.nameKo ?? koByName.get(p.name) ?? p.name;
  if (season.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-sm text-neutral-500">
        그랑프리 일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
      </div>
    );
  }
  const nextId = season.find((g) => g.status === "scheduled" || g.status === "live")?.id;
  const done = season.filter((g) => g.status === "final").length;
  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {season.length}개 대회 · 종료 {done} · 한국시간 레이스 시각 기준
      </p>
      <ol className="overflow-hidden rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-100 dark:border-neutral-800 dark:bg-neutral-950 dark:divide-neutral-800">
        {season.map((g, i) => {
          const isNext = g.id === nextId;
          return (
            <li
              key={g.id}
              aria-current={isNext ? "true" : undefined}
              className={`grid grid-cols-[28px_1fr_auto] items-center gap-3 px-3 sm:px-4 py-3 ${isNext ? "bg-rose-500/[0.06]" : ""} ${g.status === "canceled" ? "opacity-60" : ""}`}
            >
              <span className="text-center text-xs font-bold tabular-nums text-neutral-400">{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100" title={g.name}>
                  {g.countryKo ? `${g.countryKo} 그랑프리` : g.name}
                  {g.city && <span className="ml-1.5 text-xs font-normal text-neutral-400">{g.city}</span>}
                </span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                  {g.status === "final" && g.winner
                    ? <>우승 <strong className="text-neutral-800 dark:text-neutral-200">{ko(g.winner)}</strong>{g.pole && <> · 폴 {ko(g.pole)}</>}</>
                    : g.status === "canceled"
                      ? "취소"
                      : g.status === "live"
                        ? "진행 중"
                        : isNext
                          ? "다음 레이스"
                          : "예정"}
                </span>
              </span>
              <span className="text-right text-xs tabular-nums text-neutral-500 dark:text-neutral-400">{kst(g.raceTime)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
