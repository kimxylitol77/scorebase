// 해외파 한국 선수 허브 — 유럽·MLS에서 뛰는 한국 선수 시즌 성적 + 다음/최근 경기.
// 명단·시즌 성적: scripts/build-korea-abroad.ts → data/korea-abroad.json (af 국적 스캔)
// 다음·최근 경기: 우리 Match 테이블 (af 팀 id → TeamSourceId → Team) — 챔피언십·SPL·덴마크까지 커버된다.

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY, COUNTRY_FLAG } from "@/lib/sports/sport-leagues";
import { SITE_URL } from "@/lib/site-url";
import { breadcrumbLd, datasetLd } from "@/lib/seo/jsonld";
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
  spells: Spell[] | null;
}
const DATA = raw as { updatedAt: string; season: string; players: Player[] };

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
    select: { externalId: true, teamId: true },
  });
  const ourTeamIds = [...new Set(srcRows.map((r) => r.teamId))];
  const afToOur = new Map(srcRows.map((r) => [r.externalId, r.teamId]));

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
            homeTeam: { select: { name: true, nameKo: true } },
            awayTeam: { select: { name: true, nameKo: true } },
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
            homeTeam: { select: { name: true, nameKo: true } },
            awayTeam: { select: { name: true, nameKo: true } },
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

  const teamKo = (t: { name: string; nameKo: string | null } | null) =>
    t ? toKoreanTeamName(t.name) || t.nameKo || t.name : "";

  const nextOf = (p: Player) => {
    const ourId = afToOur.get(String(p.team.afId));
    return ourId ? nextByTeam.get(ourId) : undefined;
  };

  // 국가별 인원
  const byCountry = new Map<string, number>();
  for (const p of players) byCountry.set(p.country, (byCountry.get(p.country) ?? 0) + 1);
  const countries = [...byCountry.entries()].sort((a, b) => b[1] - a[1]);

  const totalGoals = players.reduce((s, p) => s + p.totals.goals, 0);
  const totalAssists = players.reduce((s, p) => s + p.totals.assists, 0);

  // 주요 선수 = 출전 시간 상위 4명
  const featured = players.slice(0, 4);

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
          __html: JSON.stringify(
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
          __html: JSON.stringify(
            datasetLd({
              name: "해외파 한국 선수 시즌 성적",
              description: `유럽·MLS 소속 한국 선수 ${players.length}명의 ${DATA.season} 시즌 출전·골·도움·평점 집계.`,
              path: "/soccer/korea",
              variableMeasured: ["출전", "골", "도움", "출전 시간", "평점"],
              dateModified: DATA.updatedAt,
              temporalCoverage: DATA.season,
            }),
          ),
        }}
      />

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden /> 축구 · {DATA.season} 시즌
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-keep">해외파 한국 선수</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          유럽·MLS에서 뛰는 한국 선수 {players.length}명의 시즌 출전·골·도움·평점을 한 곳에 모았습니다. 소속팀 다음
          경기 일정까지 함께 봅니다.
        </p>
        <p className="text-xs text-neutral-400">
          {new Date(DATA.updatedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} 갱신 · 리그 경기 기준(컵대회
          제외)
        </p>
      </header>

      {/* 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "선수", value: `${players.length}명` },
          { label: "리그가 있는 나라", value: `${countries.length}개국` },
          { label: "시즌 골", value: `${totalGoals}골` },
          { label: "시즌 도움", value: `${totalAssists}도움` },
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

      {/* 국가별 분포 */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="text-sm font-bold text-neutral-900 dark:text-white">나라별 인원</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {countries.map(([c, n]) => (
            <li
              key={c}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1 text-xs dark:border-neutral-800"
            >
              <span className="text-neutral-700 dark:text-neutral-300">
                {COUNTRY_FLAG[c] ? `${COUNTRY_FLAG[c]} ` : ""}
                {c}
              </span>
              <span className="font-black tabular-nums text-sky-600 dark:text-sky-400">{n}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 주요 선수 */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-neutral-900 dark:text-white">주요 선수</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {featured.map((p) => {
            const m = nextOf(p);
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
                      {p.nameKo}
                      {p.pos && (
                        <span className="ml-1.5 align-middle text-[10px] font-bold text-neutral-400">
                          {POS_KO[p.pos] ?? p.pos}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {toKoreanTeamName(p.team.name) || p.team.name} · {p.leagueLabel}
                    </p>
                  </div>
                  {p.totals.rating != null && (
                    <span className="ml-auto rounded-lg bg-neutral-100 px-2 py-1 text-sm font-black tabular-nums text-neutral-800 dark:bg-white/10 dark:text-white">
                      {p.totals.rating.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  {[
                    { l: "출전", v: p.totals.apps },
                    { l: "골", v: p.totals.goals },
                    { l: "도움", v: p.totals.assists },
                    { l: "분", v: p.totals.minutes },
                  ].map((s) => (
                    <div key={s.l}>
                      <p className="text-base font-black tabular-nums text-neutral-900 dark:text-white">{s.v}</p>
                      <p className="text-[10px] text-neutral-500">{s.l}</p>
                    </div>
                  ))}
                </div>
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

      {/* 시즌 성적 */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-neutral-900 dark:text-white">시즌 성적</h2>
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:border-neutral-800">
                <th className="px-3 py-2 text-left">선수</th>
                <th className="px-2 py-2 text-left">소속</th>
                <th className="px-2 py-2 text-center">출전</th>
                <th className="px-2 py-2 text-center">골</th>
                <th className="px-2 py-2 text-center">도움</th>
                <th className="px-2 py-2 text-center">분</th>
                <th className="px-2 py-2 text-center">평점</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {players.map((p) => (
                <tr key={p.afId}>
                  <td className="px-3 py-2.5">
                    <span className="font-semibold text-neutral-900 dark:text-white">{p.nameKo}</span>
                    {p.pos && <span className="ml-1.5 text-[10px] font-bold text-neutral-400">{POS_KO[p.pos] ?? p.pos}</span>}
                    {p.spells && (
                      <span className="ml-1.5 rounded bg-neutral-100 px-1 py-0.5 text-[10px] text-neutral-500 dark:bg-white/10">
                        {p.spells.length}개 리그 합산
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-neutral-600 dark:text-neutral-400">
                    <span className="block truncate">{toKoreanTeamName(p.team.name) || p.team.name}</span>
                    <span className="block truncate text-[11px] text-neutral-400">{p.leagueLabel}</span>
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{p.totals.apps}</td>
                  <td className="px-2 py-2.5 text-center font-bold tabular-nums text-neutral-900 dark:text-white">
                    {p.totals.goals}
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{p.totals.assists}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-neutral-500">{p.totals.minutes}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">
                    {p.totals.rating != null ? p.totals.rating.toFixed(2) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                  {p.nameKo}
                </span>
                <span className="min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-300">
                  {teamKo(m.homeTeam)}{" "}
                  <span className="font-black tabular-nums text-neutral-900 dark:text-white">
                    {m.homeScore ?? "-"}-{m.awayScore ?? "-"}
                  </span>{" "}
                  {teamKo(m.awayTeam)}
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
