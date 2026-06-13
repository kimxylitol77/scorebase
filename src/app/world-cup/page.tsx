// 2026 월드컵 허브 — 일정·결과·우승 확률·조별 그리드 + 사이트 내 WC 콘텐츠 전체 입구.
// 기존 자산 연결: national-teams/[id](48개국), world-cup/best-xi/[group],
// predictions/WORLD_CUP(풀 시뮬), leagues/WORLD_CUP(글), /scores(라이브).
// 시뮬 5000회 + DB 조회 → 10분 ISR (라이브 스코어 실시간은 /scores 가 담당).
import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import { simulateWorldCup } from "@/lib/predict/world-cup-simulation";
import { WORLD_CUP_GROUPS, WORLD_CUP_TEAM_ELO } from "@/lib/predict/world-cup-elos";
import { fifaCountryKo, fifaFlag } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "2026 월드컵 — 일정·결과·우승 확률·조별리그 데이터 센터",
  description:
    "2026 북중미 월드컵(미국·캐나다·멕시코, 6/11~7/19) 경기 일정과 결과, Monte Carlo 시뮬레이션 우승 확률, 조별리그 A~L 전력, 대한민국 A조 분석까지 — 48개국 데이터 허브.",
  keywords: [
    "2026 월드컵",
    "월드컵 일정",
    "월드컵 우승 후보",
    "월드컵 조별리그",
    "한국 월드컵 조",
    "월드컵 예측",
    "월드컵 우승 확률",
    "스코어베이스",
  ],
  alternates: { canonical: "/world-cup" },
};

function kstTime(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600_000);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} (${days[k.getUTCDay()]}) ${String(
    k.getUTCHours(),
  ).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

export default async function WorldCupHub() {
  const teams = await prisma.team.findMany({
    where: { league: "WORLD_CUP" },
    select: { id: true, name: true },
  });
  const byName = new Map(teams.map((t) => [t.name, t]));
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

  const now = new Date();
  const [recentOrLive, upcoming] = await Promise.all([
    prisma.match.findMany({
      where: {
        league: "WORLD_CUP",
        startTime: { gte: new Date(now.getTime() - 36 * 3600_000), lte: now },
      },
      orderBy: { startTime: "desc" },
      take: 8,
      select: {
        id: true,
        externalId: true,
        startTime: true,
        status: true,
        homeScore: true,
        awayScore: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    }),
    prisma.match.findMany({
      where: {
        league: "WORLD_CUP",
        status: "SCHEDULED",
        startTime: { gte: now, lte: new Date(now.getTime() + 7 * 86400_000) },
      },
      orderBy: { startTime: "asc" },
      take: 12,
      select: {
        id: true,
        externalId: true,
        startTime: true,
        status: true,
        homeScore: true,
        awayScore: true,
        predHome: true,
        predAway: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    }),
  ]);

  const sim = teams.length >= 32 ? simulateWorldCup(teamNameById, 5000) : [];
  const top10 = [...sim].sort((a, b) => b.champion - a.champion).slice(0, 10);
  const koreaSim = sim.find((r) => r.teamName === "South Korea") ?? null;
  const koreaTeam = byName.get("South Korea") ?? null;

  const nameKo = (en: string) => fifaCountryKo(en) ?? toKoreanTeamName(en) ?? en;
  type MatchRow = (typeof upcoming)[number] | (typeof recentOrLive)[number];
  const matchLine = (m: MatchRow) => {
    const h = nameKo(m.homeTeam.name);
    const a = nameKo(m.awayTeam.name);
    const finishedOrLive = m.status === "LIVE" || m.status === "FINISHED";
    const center = finishedOrLive
      ? `${m.homeScore ?? 0} - ${m.awayScore ?? 0}`
      : "vs";
    const inner = (
      <span className="flex items-center gap-2 text-sm py-2">
        <span className="w-32 sm:w-40 text-right font-medium truncate">
          {fifaFlag(m.homeTeam.name)} {h}
        </span>
        <span
          className={`w-14 text-center tabular-nums font-bold ${
            m.status === "LIVE"
              ? "text-rose-600 dark:text-rose-400"
              : finishedOrLive
                ? ""
                : "text-neutral-400"
          }`}
        >
          {center}
        </span>
        <span className="w-32 sm:w-40 font-medium truncate">
          {a} {fifaFlag(m.awayTeam.name)}
        </span>
        <span className="ml-auto text-xs text-neutral-500 tabular-nums whitespace-nowrap">
          {m.status === "LIVE" ? "🔴 LIVE" : m.status === "FINISHED" ? "종료" : kstTime(m.startTime)}
        </span>
      </span>
    );
    return m.externalId ? (
      <Link
        href={`/live/WORLD_CUP/${m.externalId}`}
        className="block px-2 -mx-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-900"
        prefetch={false}
      >
        {inner}
      </Link>
    ) : (
      <div className="px-2 -mx-2">{inner}</div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          2026 FIFA 월드컵 데이터 센터
        </h1>
        <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
          북중미(미국·캐나다·멕시코) 개최 · 6/11 ~ 7/19 · 사상 첫 <strong>48개국</strong> 본선.
          경기 일정·결과, Monte Carlo 우승 확률, 조별 전력, 국가별 스쿼드·감독까지 데이터로
          정리합니다. 대한민국은 개최국 멕시코와 <strong>A조</strong>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <Link href="/predictions/WORLD_CUP" className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-900" prefetch={false}>
            진출 확률 풀 시뮬레이션
          </Link>
          <Link href="/national-teams" className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-900" prefetch={false}>
            출전국 48개국
          </Link>
          <Link href="/scores" className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-900" prefetch={false}>
            라이브 스코어
          </Link>
          <Link href="/leagues/WORLD_CUP" className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-900" prefetch={false}>
            월드컵 분석 글
          </Link>
          <Link href="/predictions/WORLD_CUP#player-ranking" className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-900" prefetch={false}>
            선수 랭킹
          </Link>
          <Link href="/predictions/fifa-ranking" className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-900" prefetch={false}>
            FIFA 랭킹
          </Link>
        </div>
      </header>

      {(recentOrLive.length > 0 || upcoming.length > 0) && (
        <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold">경기 일정 · 결과</h2>
            <span className="text-xs text-neutral-500">한국시간 · 최근 36시간 + 향후 7일</span>
          </div>
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {recentOrLive.map((m) => (
              <div key={m.id}>{matchLine(m)}</div>
            ))}
            {upcoming.map((m) => (
              <div key={m.id}>{matchLine(m)}</div>
            ))}
          </div>
        </section>
      )}

      {koreaSim && (
        <section className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-900/10 p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold">대한민국 — A조</h2>
            {koreaTeam && (
              <Link
                href={`/national-teams/${koreaTeam.id}`}
                className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
                prefetch={false}
              >
                스쿼드·일정 →
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {[
              ["32강 진출", koreaSim.groupPass],
              ["16강", koreaSim.r16],
              ["8강", koreaSim.qf],
              ["우승", koreaSim.champion],
            ].map(([label, v]) => (
              <div key={label as string} className="rounded-lg bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3">
                <div className="text-xs text-neutral-500">{label}</div>
                <div className="mt-1 text-xl font-black tabular-nums">
                  {((v as number) * 100).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            같은 조: {WORLD_CUP_GROUPS.A.filter((n) => n !== "South Korea")
              .map((n) => `${fifaFlag(n)} ${nameKo(n)}`)
              .join(" · ")}{" "}
            — Monte Carlo 5,000회 시뮬레이션 기준.
          </p>
        </section>
      )}

      {top10.length > 0 && (
        <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-semibold">우승 확률 TOP 3</h2>
            <span className="text-xs text-neutral-500">Elo 기반 Monte Carlo 5,000회</span>
          </div>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {top10.slice(0, 3).map((r, i) => {
              const max = top10[0].champion || 1;
              const team = byName.get(r.teamName);
              const row = (
                <span className="flex items-center gap-3 text-sm py-2.5">
                  <span className="w-5 text-right tabular-nums text-neutral-400 font-bold">
                    {i + 1}
                  </span>
                  <span className="text-base">{fifaFlag(r.teamName)}</span>
                  <span className="font-medium w-28 sm:w-36 truncate">{nameKo(r.teamName)}</span>
                  <span className="flex-1 h-2 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    <span
                      className="block h-full bg-amber-500"
                      style={{ width: `${(r.champion / max) * 100}%` }}
                    />
                  </span>
                  <span className="tabular-nums text-neutral-600 dark:text-neutral-300 font-semibold w-14 text-right">
                    {(r.champion * 100).toFixed(1)}%
                  </span>
                </span>
              );
              return (
                <li key={r.teamName}>
                  {team ? (
                    <Link
                      href={`/national-teams/${team.id}`}
                      className="block px-2 -mx-2 hover:bg-neutral-50 dark:hover:bg-neutral-900 rounded-lg"
                      prefetch={false}
                    >
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
          <Link
            href="/predictions/WORLD_CUP"
            className="mt-4 flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-500/20 transition"
          >
            AI 예측 전체 보기 — 우승~32강 단계별 확률 · 시뮬레이션 →
          </Link>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-bold tracking-tight">조별리그 A~L</h2>
          <Link href="/national-teams" className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline" prefetch={false}>
            48개국 상세 →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(WORLD_CUP_GROUPS).map(([group, names]) => {
            const sorted = [...names].sort(
              (a, b) => (WORLD_CUP_TEAM_ELO[b] ?? 0) - (WORLD_CUP_TEAM_ELO[a] ?? 0),
            );
            return (
              <div key={group} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="font-bold text-sm">{group}조</h3>
                  <Link
                    href={`/world-cup/best-xi/${group.toLowerCase()}`}
                    className="text-[11px] text-neutral-500 hover:underline"
                    prefetch={false}
                  >
                    베스트 XI
                  </Link>
                </div>
                <ul className="space-y-1.5">
                  {sorted.map((name) => {
                    const team = byName.get(name);
                    const label = (
                      <span className="flex items-center gap-2 text-sm">
                        <span>{fifaFlag(name)}</span>
                        <span className="truncate">{nameKo(name)}</span>
                        <span className="ml-auto tabular-nums text-[11px] text-neutral-400">
                          {WORLD_CUP_TEAM_ELO[name] ?? ""}
                        </span>
                      </span>
                    );
                    return (
                      <li key={name}>
                        {team ? (
                          <Link
                            href={`/national-teams/${team.id}`}
                            className="block hover:underline"
                            prefetch={false}
                          >
                            {label}
                          </Link>
                        ) : (
                          label
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-xs text-neutral-500 leading-relaxed">
        ⓘ 우승·진출 확률은 자체 Elo 시드 기반 Monte Carlo 시뮬레이션(10분 갱신)으로, 배당·전망과
        다를 수 있습니다. 조별 순위 디테일과 전체 진출 확률 표는{" "}
        <Link href="/predictions/WORLD_CUP" className="underline">
          월드컵 예측
        </Link>
        , 실시간 스코어는{" "}
        <Link href="/scores" className="underline">
          라이브 스코어
        </Link>{" "}
        페이지에서.
      </p>
    </div>
  );
}
