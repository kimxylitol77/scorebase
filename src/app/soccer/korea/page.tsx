// 해외파 한국 선수 허브 — 유럽·MLS에서 뛰는 한국 선수 시즌 성적 + 다음/최근 경기.
// 명단·지난 시즌 성적: scripts/build-korea-abroad.ts → data/korea-abroad.json (af 국적 스캔)
// 현재 시즌 성적: scripts/refresh-korea-abroad-current.ts (ts 리그당 1콜) → players[].current
//   두 시즌은 섞지 않는다 — 표 위 시즌 탭으로 갈라 보여준다. 이적한 선수의 지난 기록이
//   새 소속 옆에 붙어 현재 성적처럼 읽히던 문제(이강인 PSG 27경기)를 이 구조로 막는다.
// 다음·최근 경기: 우리 Match 테이블 (af 팀 id → TeamSourceId → Team) — 챔피언십·SPL·덴마크까지 커버된다.

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import TeamBadge from "@/components/TeamBadge";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY, COUNTRY_FLAG } from "@/lib/sports/sport-leagues";
import { SITE_URL } from "@/lib/site-url";
import { linkableTsPlayerIds, tsPlayerHref } from "@/lib/links/player-link";
import { breadcrumbLd, datasetLd, jsonLdScript } from "@/lib/seo/jsonld";
import CountryFilter from "./CountryFilter";
import raw from "../../../../data/korea-abroad.json";

export const revalidate = 3600;

interface Spell {
  league: string;
  leagueLabel: string;
  country: string;
  team: { afId: number; name: string; logo: string | null };
}
interface Player {
  afId: number;
  tsId: string | null;
  nameKo: string;
  nameEn: string;
  age: number | null;
  photo: string | null;
  injured: boolean;
  pos: string | null;
  league: string;
  leagueLabel: string;
  country: string;
  team: { afId: number; name: string; logo: string | null };
  /** 이적으로 team 이 바뀐 경우, 시즌 성적을 쌓은 옛 소속 */
  seasonTeam?: { afId: number; name: string; logo: string | null } | null;
  transferredAt?: string | null;
  totals: {
    apps: number;
    starts: number;
    minutes: number;
    goals: number;
    assists: number;
    rating: number | null;
    yellow: number;
    red: number;
  };
  /** 지난 시즌 기록이 어느 시즌·어느 팀 것인지 (MLS 처럼 캘린더 시즌이면 라벨이 다르다) */
  seasonStat?: { season?: string; team?: string } | null;
  /** 현재 시즌 기록. status = played 출전 · none 미출전 · preseason 리그 미개막 · uncovered 대상 리그 밖 */
  current?: Current | null;
  spells: Spell[] | null;
}
interface Current {
  status: "played" | "none" | "preseason" | "uncovered";
  season: string;
  team: string | null;
  apps: number;
  starts: number;
  goals: number;
  assists: number;
  minutes: number;
  rating: number | null;
  yellow: number;
  red: number;
}
const DATA = raw as {
  updatedAt: string;
  season: string;
  currentSeason?: string;
  currentUpdatedAt?: string;
  players: Player[];
};
const CURRENT_SEASON = DATA.currentSeason ?? "2026-27";

const POS_KO: Record<string, string> = {
  Goalkeeper: "GK",
  Defender: "DF",
  Midfielder: "MF",
  Attacker: "FW",
};

export const metadata: Metadata = {
  title: "해외파 한국 선수 — 유럽 리그 시즌 성적 총정리",
  description:
    "유럽·MLS에서 뛰는 한국 선수 전원의 시즌 성적을 한 곳에. 출전·골·도움·평점과 소속팀 다음 경기까지 한국어로 — 스코어베이스 축구.",
  keywords: [
    "해외파 한국 선수",
    "유럽파 축구 선수",
    "손흥민 기록",
    "이강인 성적",
    "김민재 기록",
    "황희찬 기록",
    "한국 선수 유럽 리그",
    "코리안 리거",
    "스코어베이스",
  ],
  alternates: { canonical: `${SITE_URL}/soccer/korea` },
  openGraph: {
    title: "해외파 한국 선수 — 유럽 리그 시즌 성적 총정리",
    description:
      "유럽·MLS에서 뛰는 한국 선수 전원의 출전·골·도움·평점과 다음 경기 일정.",
    url: `${SITE_URL}/soccer/korea`,
    type: "website",
  },
};

function fmtKST(d: Date): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

function dday(d: Date): string {
  const diff = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (diff <= 0) return "오늘";
  if (diff === 1) return "내일";
  return `${diff}일 후`;
}

export default async function KoreaAbroadPage() {
  const players = DATA.players;

  // af 팀 id → 우리 Team. 한 선수가 시즌 중 여러 팀을 거쳤으면 spells 의 팀도 모두 본다.
  const afTeamIds = [
    ...new Set(
      players.flatMap((p) => [p.team.afId, ...(p.spells ?? []).map((s) => s.team.afId)]).filter(Boolean).map(String),
    ),
  ];
  const srcRows = await prisma.teamSourceId.findMany({
    where: { source: "api-football", externalId: { in: afTeamIds } },
    select: { externalId: true, teamId: true, team: { select: { logoUrl: true } } },
  });
  const ourTeamIds = [...new Set(srcRows.map((r) => r.teamId))];
  const afToOur = new Map(srcRows.map((r) => [r.externalId, r.teamId]));
  const logoByAf = new Map(srcRows.map((r) => [r.externalId, r.team.logoUrl]));
  const teamLogo = (afId: number) => logoByAf.get(String(afId)) ?? null;

  // 선수 페이지 링크 — ts id 가 있어도 DB 에 그 선수가 없으면 404 라 링크하지 않는다.
  //   (af↔ts 자동 매핑에 실물 없는 id 가 섞여 있다 — 홍현석·양민혁 실측)
  const linkable = await linkableTsPlayerIds(
    players.map((p) => p.tsId).filter((v): v is string => Boolean(v)),
  );
  const playerHref = (p: Player) => (p.tsId && linkable.has(p.tsId) ? tsPlayerHref(p.tsId) : null);

  // 팀별 다음 경기 1개 + 최근 종료 경기 1개
  const now = new Date();
  const [upcoming, recent] = ourTeamIds.length
    ? await Promise.all([
        prisma.match.findMany({
          where: {
            status: "SCHEDULED",
            startTime: { gte: now },
            OR: [{ homeTeamId: { in: ourTeamIds } }, { awayTeamId: { in: ourTeamIds } }],
          },
          orderBy: { startTime: "asc" },
          take: 400,
          select: {
            id: true,
            league: true,
            startTime: true,
            homeTeamId: true,
            awayTeamId: true,
            homeTeam: { select: { name: true, nameKo: true, logoUrl: true } },
            awayTeam: { select: { name: true, nameKo: true, logoUrl: true } },
          },
        }),
        prisma.match.findMany({
          where: {
            status: "FINISHED",
            startTime: { lte: now },
            OR: [{ homeTeamId: { in: ourTeamIds } }, { awayTeamId: { in: ourTeamIds } }],
          },
          orderBy: { startTime: "desc" },
          take: 400,
          select: {
            id: true,
            league: true,
            startTime: true,
            homeTeamId: true,
            awayTeamId: true,
            homeScore: true,
            awayScore: true,
            homeTeam: { select: { name: true, nameKo: true, logoUrl: true } },
            awayTeam: { select: { name: true, nameKo: true, logoUrl: true } },
          },
        }),
      ])
    : [[], []];

  type M = (typeof upcoming)[number];
  type R = (typeof recent)[number];
  const nextByTeam = new Map<number, M>();
  for (const m of upcoming) {
    for (const tid of [m.homeTeamId, m.awayTeamId]) if (!nextByTeam.has(tid)) nextByTeam.set(tid, m);
  }
  const lastByTeam = new Map<number, R>();
  for (const m of recent) {
    for (const tid of [m.homeTeamId, m.awayTeamId]) if (!lastByTeam.has(tid)) lastByTeam.set(tid, m);
  }

  const teamKo = (t: { name: string; nameKo: string | null } | null | undefined) =>
    t ? toKoreanTeamName(t.name) || t.nameKo || t.name : "";

  const nextOf = (p: Player) => {
    const ourId = afToOur.get(String(p.team.afId));
    return ourId ? nextByTeam.get(ourId) : undefined;
  };

  // 국가별 인원
  const byCountry = new Map<string, number>();
  for (const p of players) byCountry.set(p.country, (byCountry.get(p.country) ?? 0) + 1);
  const countries = [...byCountry.entries()].sort((a, b) => b[1] - a[1]);

  // 현재 시즌 정렬 — 뛴 선수 먼저(골 > 도움 > 출전 시간), 그다음 미출전, 개막 전은 맨 뒤.
  // 개막 직후엔 표본이 얇아 지난 시즌 순서를 그대로 쓰면 0골 선수가 위에 남는다.
  const CUR_ORDER: Record<string, number> = { played: 0, none: 1, preseason: 2, uncovered: 3 };
  const currentSorted = [...players].sort((a, b) => {
    const ca = a.current;
    const cb = b.current;
    const oa = CUR_ORDER[ca?.status ?? "uncovered"] ?? 3;
    const ob = CUR_ORDER[cb?.status ?? "uncovered"] ?? 3;
    if (oa !== ob) return oa - ob;
    return (cb?.goals ?? 0) - (ca?.goals ?? 0) || (cb?.assists ?? 0) - (ca?.assists ?? 0) || (cb?.minutes ?? 0) - (ca?.minutes ?? 0);
  });

  /** 선수 이름 칸 — 두 시즌 표가 같이 쓴다 */
  const nameCell = (p: Player, showSpells: boolean) => (
    <td className="px-3 py-2.5">
      <span className="flex items-center gap-2">
        {p.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.photo}
            alt=""
            width={28}
            height={28}
            loading="lazy"
            className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-neutral-200 dark:ring-neutral-800"
          />
        ) : (
          <span className="h-7 w-7 shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-900" />
        )}
        <span className="min-w-0">
          {playerHref(p) ? (
            <Link
              href={playerHref(p)!}
              className="font-semibold text-neutral-900 hover:underline underline-offset-4 dark:text-white"
            >
              {p.nameKo}
            </Link>
          ) : (
            <span className="font-semibold text-neutral-900 dark:text-white">{p.nameKo}</span>
          )}
          {p.pos && <span className="ml-1.5 text-[10px] font-bold text-neutral-400">{POS_KO[p.pos] ?? p.pos}</span>}
          {showSpells && p.spells && (
            <span className="ml-1.5 rounded bg-neutral-100 px-1 py-0.5 text-[10px] text-neutral-500 dark:bg-white/10">
              {p.spells.length}개 리그 합산
            </span>
          )}
        </span>
      </span>
    </td>
  );

  const CUR_NOTE: Record<string, string> = { none: "미출전", preseason: "개막 전", uncovered: "기록 없음" };

  // 현재 시즌 표 — 숫자의 주인이 현 소속이라 "이적" 배지가 필요 없다
  const currentRows = currentSorted.map((p) => {
    const c = p.current;
    const played = c?.status === "played";
    const dim = !played ? " text-neutral-400" : "";
    return {
      country: p.country,
      node: (
        <tr key={p.afId}>
          {nameCell(p, false)}
          <td className="px-2 py-2.5 text-neutral-600 dark:text-neutral-400">
            <span className="flex items-center gap-1.5">
              <TeamBadge logoUrl={teamLogo(p.team.afId)} size={18} />
              <span className="truncate">{toKoreanTeamName(p.team.name) || p.team.name}</span>
            </span>
            <span className="block truncate text-[11px] text-neutral-400">
              {p.leagueLabel}
              {c && c.status !== "played" && ` · ${CUR_NOTE[c.status]}`}
            </span>
          </td>
          <td className={`px-2 py-2.5 text-center tabular-nums${dim}`}>{played ? c!.apps : "-"}</td>
          <td
            className={`px-2 py-2.5 text-center font-bold tabular-nums ${played ? "text-neutral-900 dark:text-white" : "text-neutral-400"}`}
          >
            {played ? c!.goals : "-"}
          </td>
          <td className={`px-2 py-2.5 text-center tabular-nums${dim}`}>{played ? c!.assists : "-"}</td>
          <td className="px-2 py-2.5 text-center tabular-nums text-neutral-500">{played ? c!.minutes : "-"}</td>
          <td className={`px-2 py-2.5 text-center tabular-nums${dim}`}>
            {played && c!.rating != null ? c!.rating.toFixed(2) : "-"}
          </td>
        </tr>
      ),
    };
  });

  // 지난 시즌 표 — 확정 기록. 기록을 쌓은 팀·시즌을 항상 밝힌다.
  // MLS 처럼 캘린더 시즌이면 "지난 시즌"과 현재 시즌 라벨이 같다. 그때 옛 스냅샷을 그대로 쓰면
  // 같은 2026 시즌이 두 탭에 다른 숫자(17경기 vs 18경기)로 떠서 어느 쪽이 맞는지 알 수 없다 — 최신값으로 통일한다.
  const prevTotals = (p: Player) =>
    p.current && p.current.status === "played" && (p.seasonStat?.season ?? DATA.season) === p.current.season
      ? p.current
      : p.totals;

  const seasonRows = players.map((p) => ({
    country: p.country,
    node: (
      <tr key={p.afId}>
        {nameCell(p, true)}
        <td className="px-2 py-2.5 text-neutral-600 dark:text-neutral-400">
          <span className="flex items-center gap-1.5">
            <TeamBadge logoUrl={teamLogo(p.team.afId)} size={18} />
            <span className="truncate">{toKoreanTeamName(p.team.name) || p.team.name}</span>
            {p.seasonTeam && (
              <span className="shrink-0 rounded bg-sky-500/10 px-1 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                이적
              </span>
            )}
          </span>
          {/* 이 숫자를 쌓은 시즌·팀 — 이적한 선수는 현 소속과 다르다 */}
          <span className="block truncate text-[11px] text-neutral-400">
            {p.seasonTeam
              ? `${p.seasonStat?.season ?? DATA.season} ${toKoreanTeamName(p.seasonTeam.name) || p.seasonTeam.name}`
              : `${p.leagueLabel} · ${p.seasonStat?.season ?? DATA.season}`}
          </span>
        </td>
        <td className="px-2 py-2.5 text-center tabular-nums">{prevTotals(p).apps}</td>
        <td className="px-2 py-2.5 text-center font-bold tabular-nums text-neutral-900 dark:text-white">
          {prevTotals(p).goals}
        </td>
        <td className="px-2 py-2.5 text-center tabular-nums">{prevTotals(p).assists}</td>
        <td className="px-2 py-2.5 text-center tabular-nums text-neutral-500">{prevTotals(p).minutes}</td>
        <td className="px-2 py-2.5 text-center tabular-nums">
          {prevTotals(p).rating != null ? prevTotals(p).rating!.toFixed(2) : "-"}
        </td>
      </tr>
    ),
  }));

  // 요약은 현재 시즌 기준 — 표의 기본 탭과 같은 시즌을 봐야 숫자가 서로 맞는다
  const totalGoals = players.reduce((s, p) => s + (p.current?.goals ?? 0), 0);
  const totalAssists = players.reduce((s, p) => s + (p.current?.assists ?? 0), 0);
  const startedCount = players.filter((p) => p.current && p.current.status !== "preseason").length;

  // 주요 선수 = 현재 시즌 출전 시간 상위 4명 (개막 전이면 지난 시즌 순서 그대로)
  const featured = [...players]
    .sort((a, b) => (b.current?.minutes ?? 0) - (a.current?.minutes ?? 0))
    .slice(0, 4);

  // 최근 경기 — 선수 소속팀 기준 최신순 8경기 (중복 제거)
  const recentRows: Array<{ p: Player; m: R }> = [];
  const seen = new Set<number>();
  for (const p of players) {
    const ourId = afToOur.get(String(p.team.afId));
    const m = ourId ? lastByTeam.get(ourId) : undefined;
    if (m && !seen.has(m.id)) {
      seen.add(m.id);
      recentRows.push({ p, m });
    }
  }
  recentRows.sort((a, b) => b.m.startTime.getTime() - a.m.startTime.getTime());

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbLd([
              { name: "홈", path: "/" },
              { name: "축구", path: "/soccer" },
              { name: "해외파 한국 선수", path: "/soccer/korea" },
            ]),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            datasetLd({
              name: "해외파 한국 선수 시즌 성적",
              description: `유럽·MLS 소속 한국 선수 ${players.length}명의 ${CURRENT_SEASON} 시즌 출전·골·도움·평점 집계(${DATA.season} 시즌 기록 포함).`,
              path: "/soccer/korea",
              variableMeasured: ["출전", "골", "도움", "출전 시간", "평점"],
              dateModified: DATA.currentUpdatedAt ?? DATA.updatedAt,
              temporalCoverage: `${DATA.season}/${CURRENT_SEASON}`,
            }),
          ),
        }}
      />

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden /> 축구 · {CURRENT_SEASON} 시즌
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-keep">해외파 한국 선수</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          유럽·MLS에서 뛰는 한국 선수 {players.length}명의 {CURRENT_SEASON} 시즌 출전·골·도움·평점을 한 곳에
          모았습니다. 표 위 탭으로 {DATA.season} 시즌 기록도 그대로 볼 수 있습니다.
        </p>
        <p className="text-xs text-neutral-400">
          {new Date(DATA.currentUpdatedAt ?? DATA.updatedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} 갱신
          · 리그 경기 기준(컵대회 제외) · 개막 전 리그는 {DATA.season} 탭에서
        </p>
      </header>

      {/* 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "선수", value: `${players.length}명` },
          { label: "개막한 리그 소속", value: `${startedCount}명` },
          { label: `${CURRENT_SEASON} 골`, value: `${totalGoals}골` },
          { label: `${CURRENT_SEASON} 도움`, value: `${totalAssists}도움` },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950"
          >
            <p className="text-[11px] text-neutral-500">{s.label}</p>
            <p className="mt-0.5 text-xl font-black tabular-nums text-neutral-900 dark:text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* 국가별 분포 + 시즌 성적 — 칩을 누르면 표가 그 나라만 남는다(클라이언트 필터, ISR 유지) */}
      <CountryFilter
        countries={countries}
        flags={Object.fromEntries(countries.map(([c]) => [c, COUNTRY_FLAG[c] ?? ""]))}
        seasons={[
          { key: "current", label: `${CURRENT_SEASON} 시즌`, rows: currentRows, note: "진행 중 — 개막한 리그부터 쌓입니다" },
          { key: "prev", label: `${DATA.season} 시즌`, rows: seasonRows, note: "확정 기록 — 기록을 쌓은 팀 기준" },
        ]}
      />

      {/* 주요 선수 */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-neutral-900 dark:text-white">주요 선수</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {featured.map((p) => {
            const m = nextOf(p);
            const href = playerHref(p);
            return (
              <div
                key={p.afId}
                className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
              >
                <div className="flex items-center gap-3">
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.photo}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-neutral-200 dark:ring-neutral-800"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-900" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-neutral-900 dark:text-white">
                      {href ? (
                        <Link href={href} className="hover:underline underline-offset-4">
                          {p.nameKo}
                        </Link>
                      ) : (
                        p.nameKo
                      )}
                      {p.pos && (
                        <span className="ml-1.5 align-middle text-[10px] font-bold text-neutral-400">
                          {POS_KO[p.pos] ?? p.pos}
                        </span>
                      )}
                    </p>
                    <p className="flex items-center gap-1.5 truncate text-xs text-neutral-500">
                      <TeamBadge logoUrl={teamLogo(p.team.afId)} size={16} />
                      <span className="truncate">
                        {toKoreanTeamName(p.team.name) || p.team.name} · {p.leagueLabel}
                      </span>
                    </p>
                  </div>
                  {p.current?.status === "played" && p.current.rating != null && (
                    <span className="ml-auto rounded-lg bg-neutral-100 px-2 py-1 text-sm font-black tabular-nums text-neutral-800 dark:bg-white/10 dark:text-white">
                      {p.current.rating.toFixed(2)}
                    </span>
                  )}
                </div>
                {/* 카드 숫자도 현재 시즌 — 표 기본 탭과 어긋나면 어느 쪽이 맞는지 알 수 없다 */}
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  {[
                    { l: "출전", v: p.current?.apps ?? 0 },
                    { l: "골", v: p.current?.goals ?? 0 },
                    { l: "도움", v: p.current?.assists ?? 0 },
                    { l: "분", v: p.current?.minutes ?? 0 },
                  ].map((s) => (
                    <div key={s.l}>
                      <p className="text-base font-black tabular-nums text-neutral-900 dark:text-white">
                        {p.current?.status === "played" ? s.v : "-"}
                      </p>
                      <p className="text-[10px] text-neutral-500">{s.l}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] text-neutral-400">
                  {CURRENT_SEASON}
                  {p.current && p.current.status !== "played" ? ` · ${CUR_NOTE[p.current.status]}` : ""}
                </p>
                {m && (
                  <p className="mt-3 truncate border-t border-neutral-100 pt-2 text-[11px] text-neutral-500 dark:border-neutral-800">
                    다음 {teamKo(m.homeTeam)} vs {teamKo(m.awayTeam)}
                    <span className="ml-1.5 text-neutral-400">{LEAGUE_DISPLAY[m.league] ?? m.league}</span>
                    <span className="ml-1.5 font-semibold text-sky-600 dark:text-sky-400">{dday(m.startTime)}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 최근 경기 */}
      {recentRows.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-white">소속팀 최근 경기</h2>
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950">
            {recentRows.slice(0, 8).map(({ p, m }) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="w-16 shrink-0 truncate text-xs font-semibold text-sky-600 dark:text-sky-400">
                  {playerHref(p) ? (
                    <Link href={playerHref(p)!} className="hover:underline underline-offset-4">
                      {p.nameKo}
                    </Link>
                  ) : (
                    p.nameKo
                  )}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-neutral-700 dark:text-neutral-300">
                  <span className="truncate">{teamKo(m.homeTeam)}</span>
                  <TeamBadge logoUrl={m.homeTeam.logoUrl} size={16} />
                  <span className="shrink-0 font-black tabular-nums text-neutral-900 dark:text-white">
                    {m.homeScore ?? "-"}-{m.awayScore ?? "-"}
                  </span>
                  <TeamBadge logoUrl={m.awayTeam.logoUrl} size={16} />
                  <span className="truncate">{teamKo(m.awayTeam)}</span>
                </span>
                <span className="shrink-0 text-[11px] text-neutral-400">
                  {LEAGUE_DISPLAY[m.league] ?? m.league} · {fmtKST(m.startTime)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-neutral-500">
        더 깊은 선수 기록은{" "}
        <Link href="/transfers" className="underline underline-offset-2">
          이적시장 선수 페이지
        </Link>
        에서 볼 수 있습니다.
      </p>
    </main>
  );
}
