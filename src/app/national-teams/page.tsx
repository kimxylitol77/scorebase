// 2026 월드컵 출전 48개국 목록 — 조별(A~L) 그리드. 고아 상태였던
// national-teams/[id] 페이지들의 입구(허브). 데이터는 시드 Elo + FIFA 랭킹 정적,
// 팀 row 매칭만 DB — 1시간 ISR 로 충분.
import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import { WORLD_CUP_GROUPS, WORLD_CUP_TEAM_ELO } from "@/lib/predict/world-cup-elos";
import { fifaCountryKo, fifaFlag, getFifaRank } from "@/lib/sports/fifa-rankings";
import { breadcrumbLd, itemListLd, jsonLdScript } from "@/lib/seo/jsonld";
import { koEnLanguages } from "@/lib/i18n/en";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "2026 월드컵 출전국 48개국 — 조별 전력·스쿼드·감독",
  description:
    "2026 북중미 월드컵 본선 48개국을 조별(A~L)로 한눈에. 국가별 Elo 전력 지수와 FIFA 랭킹, 소집 스쿼드·감독·경기 일정 페이지까지 연결되는 국가대표팀 허브.",
  keywords: [
    "2026 월드컵 출전국",
    "월드컵 조 편성",
    "월드컵 조별리그",
    "국가대표 스쿼드",
    "월드컵 전력 분석",
    "스코어베이스",
  ],
  alternates: {
    canonical: "/national-teams",
    languages: koEnLanguages("/national-teams", "/en/national-teams"),
  },
};

export default async function NationalTeamsIndex() {
  const teams = await prisma.team.findMany({
    where: { league: "WORLD_CUP" },
    select: { id: true, name: true },
  });
  const byName = new Map(teams.map((t) => [t.name, t]));

  return (
    <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            breadcrumbLd([
              { name: "홈", path: "/" },
              { name: "2026 월드컵", path: "/world-cup" },
              { name: "출전국 국가대표팀", path: "/national-teams" },
            ]),
            itemListLd({
              name: "2026 FIFA 월드컵 출전국 국가대표팀",
              items: teams.map((t) => ({
                name: fifaCountryKo(t.name) ?? t.name,
                path: `/national-teams/${t.id}`,
              })),
            }),
          ]),
        }}
      />
      <AmbientGlow />
      <header>
        <Link
          href="/world-cup"
          className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:text-rose-400"
        >
          <Trophy className="h-3 w-3" aria-hidden /> 2026 북중미 월드컵
        </Link>
        <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          출전국 48개국 — 조별 전력 한눈에
        </h1>
        <p className="mt-3 text-sm text-neutral-600 leading-relaxed break-keep dark:text-neutral-400">
          국가를 누르면 소집 스쿼드·감독·최근 폼·경기 일정 페이지로 이동합니다. Elo 는
          자체 전력 지수(높을수록 강팀), 괄호는 FIFA 랭킹.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(WORLD_CUP_GROUPS).map(([group, names]) => {
          const sorted = [...names].sort(
            (a, b) => (WORLD_CUP_TEAM_ELO[b] ?? 0) - (WORLD_CUP_TEAM_ELO[a] ?? 0),
          );
          return (
            <section
              key={group}
              className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] p-4 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]"
            >
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-bold">{group}조</h2>
                <Link
                  href={`/world-cup/best-xi/${group.toLowerCase()}`}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                  prefetch={false}
                >
                  조 베스트 XI →
                </Link>
              </div>
              <ul className="space-y-2">
                {sorted.map((name) => {
                  const team = byName.get(name);
                  const ko = fifaCountryKo(name) ?? name;
                  const rank = getFifaRank(name);
                  const elo = WORLD_CUP_TEAM_ELO[name];
                  const inner = (
                    <span className="flex items-center gap-2 text-sm">
                      <span className="text-base w-6 text-center">{fifaFlag(name)}</span>
                      <span className="font-medium truncate">
                        {ko}
                        {rank != null && (
                          <span className="ml-1 text-[11px] text-neutral-400">({rank}위)</span>
                        )}
                      </span>
                      {elo != null && (
                        <span className="ml-auto tabular-nums text-xs text-neutral-500">
                          {elo}
                        </span>
                      )}
                    </span>
                  );
                  return (
                    <li key={name}>
                      {team ? (
                        <Link
                          href={`/national-teams/${team.id}`}
                          className="block rounded-lg px-2 py-1.5 -mx-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
                          prefetch={false}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div className="px-2 py-1.5 -mx-2 opacity-70">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="text-xs text-neutral-500 leading-relaxed break-keep">
        ⓘ 조 편성은 2026 북중미 월드컵 본선 추첨 기준. 우승·진출 확률 시뮬레이션은{" "}
        <Link href="/world-cup" className="underline">
          월드컵 허브
        </Link>
        와{" "}
        <Link href="/predictions/WORLD_CUP" className="underline">
          월드컵 예측
        </Link>{" "}
        페이지에서 확인할 수 있습니다.
      </p>
    </div>
  );
}
