// 교체 임팩트 — 리그별 조커(교체 투입) 랭킹과 감독 교체 성향·뒤지던 경기 승점 회수 데이터 페이지.
// 데이터: SubImpactCache (일 1회 /api/cron/sub-impact 가 ts incidents 로 재계산).

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Repeat, Sparkles, Timer } from "lucide-react";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import type { SubImpactLeagueData } from "@/lib/tactical/sub-impact";

export const revalidate = 1800;

const LEAGUES: { code: string; name: string }[] = [
  { code: "EPL", name: "프리미어리그" },
  { code: "CHAMPIONSHIP", name: "챔피언십" },
  { code: "LALIGA", name: "라리가" },
  { code: "BUNDESLIGA", name: "분데스리가" },
  { code: "SERIE_A", name: "세리에 A" },
  { code: "LIGUE_1", name: "리그 1" },
  { code: "SUPER_LIG", name: "쉬페르 리그" },
  { code: "K_LEAGUE_1", name: "K리그1" },
  { code: "K_LEAGUE_2", name: "K리그2" },
  { code: "J1_LEAGUE", name: "J1리그" },
];
const NAME_BY_CODE = Object.fromEntries(LEAGUES.map((l) => [l.code, l.name]));

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const code = NAME_BY_CODE[sp.league ?? ""] ? sp.league! : "EPL";
  const name = NAME_BY_CODE[code];
  return {
    title: `${name} 교체 임팩트 — 조커 랭킹·감독 교체 성향`,
    description: `${name} 교체 투입 선수의 골·도움(조커 랭킹)과 팀별 교체 타이밍, 뒤지던 경기에서 교체 후 가져온 승점까지 — 실제 경기 이벤트 데이터 집계.`,
    alternates: { canonical: "https://www.scorebase.kr/soccer/sub-impact" },
  };
}

export default async function SubImpactPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const sp = await searchParams;
  const code = NAME_BY_CODE[sp.league ?? ""] ? sp.league! : "EPL";

  const row = await prisma.subImpactCache.findUnique({ where: { league: code } });
  const data = (row?.data as unknown as SubImpactLeagueData | null) ?? null;

  return (
    <div className="relative mx-auto max-w-5xl px-4 py-8">
      <AmbientGlow />
      <Link
        href="/soccer"
        className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-300"
      >
        <ArrowLeft className="h-4 w-4" /> 축구 허브
      </Link>

      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Repeat className="h-6 w-6 text-emerald-500" /> 교체 임팩트
      </h1>
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        교체 카드가 경기를 얼마나 바꾸는가. 실제 경기 이벤트(교체·골 시각) 데이터로 조커
        랭킹과 감독의 교체 성향을 집계했다. 교체 이후의 득점은 교체와의 상관 데이터일 뿐,
        전부 교체 덕이라는 뜻은 아니다.
      </p>

      {/* 리그 탭 */}
      <div className="mt-5 flex flex-wrap gap-2">
        {LEAGUES.map((l) => (
          <Link
            key={l.code}
            href={`/soccer/sub-impact?league=${l.code}`}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              l.code === code
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-500 font-semibold"
                : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
            }`}
          >
            {l.name}
          </Link>
        ))}
      </div>

      {!data || data.games === 0 ? (
        <div className="mt-10 rounded-xl border border-neutral-200 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800">
          {NAME_BY_CODE[code]}는 아직 집계할 경기가 없습니다. 시즌이 시작되면 라운드마다
          자동으로 쌓입니다.
        </div>
      ) : (
        <>
          <p className="mt-4 text-xs text-neutral-500">
            {data.seasonLabel} 시즌 · 집계 {data.games}경기
            {data.totalFinished > data.games
              ? ` (종료 ${data.totalFinished}경기 중 이벤트 데이터 보유분)`
              : ""}
          </p>

          {/* 조커 랭킹 */}
          <h2 className="mt-8 flex items-center gap-2 text-lg font-bold">
            <Sparkles className="h-5 w-5 text-amber-500" /> 조커 랭킹
            <span className="text-xs font-normal text-neutral-500">교체 투입 후 골·도움</span>
          </h2>
          {data.jokers.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">아직 교체 투입 후 공격 포인트가 없습니다.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">선수</th>
                    <th className="px-3 py-2">팀</th>
                    <th className="px-3 py-2 text-right">교체 투입</th>
                    <th className="px-3 py-2 text-right">투입 후 골</th>
                    <th className="px-3 py-2 text-right">투입 후 도움</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jokers.map((p, i) => (
                    <tr key={p.id} className="border-t border-neutral-100 dark:border-neutral-800/60">
                      <td className="px-3 py-2 text-neutral-400">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">
                        <Link href={`/players/${p.id}`} className="hover:underline">
                          {p.nameKo ?? p.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-neutral-500">{p.teamKo}</td>
                      <td className="px-3 py-2 text-right">{p.subOn}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-500">{p.goals}</td>
                      <td className="px-3 py-2 text-right">{p.assists}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 팀·감독 교체 지표 */}
          <h2 className="mt-10 flex items-center gap-2 text-lg font-bold">
            <Timer className="h-5 w-5 text-sky-500" /> 팀·감독 교체 성향
            <span className="text-xs font-normal text-neutral-500">뒤지던 경기 승점 회수 순</span>
          </h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-3 py-2">팀</th>
                  <th className="px-3 py-2">감독</th>
                  <th className="px-3 py-2">주 포메이션</th>
                  <th className="px-3 py-2 text-right">경기</th>
                  <th className="px-3 py-2 text-right">평균 교체</th>
                  <th className="px-3 py-2 text-right">첫 교체 평균</th>
                  <th className="px-3 py-2 text-right">교체 후 득점</th>
                  <th className="px-3 py-2 text-right">교체 투입 골</th>
                  <th className="px-3 py-2 text-right" title="첫 교체 시점에 뒤지던 경기에서 무승부 이상으로 마친 경기와 가져온 승점">
                    뒤집기 (승점)
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.teams.map((t) => {
                  const mainF = t.formations[0];
                  return (
                    <tr key={t.teamId} className="border-t border-neutral-100 dark:border-neutral-800/60">
                      <td className="px-3 py-2 font-medium">
                        <Link href={`/teams/${t.teamId}`} className="hover:underline">
                          {t.nameKo}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-neutral-500">{t.coachKo ?? "-"}</td>
                      <td className="px-3 py-2 text-neutral-500">
                        {mainF ? `${mainF.formation} (${mainF.count})` : "-"}
                      </td>
                      <td className="px-3 py-2 text-right">{t.games}</td>
                      <td className="px-3 py-2 text-right">{t.avgSubs}</td>
                      <td className="px-3 py-2 text-right">
                        {t.avgFirstSubMin != null ? `${t.avgFirstSubMin}분` : "-"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {t.goalsAfterSub}
                        <span className="text-neutral-400"> / 실 {t.concededAfterSub}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-500">{t.jokerGoals}</td>
                      <td className="px-3 py-2 text-right">
                        {t.trailingAtSub > 0 ? (
                          <>
                            {t.trailingRecovered}/{t.trailingAtSub}
                            <span className="font-semibold text-amber-500"> +{t.trailingPoints}</span>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-neutral-500">
            뒤집기 = 자기 팀 첫 교체 시점에 뒤지고 있던 경기 중 무승부 이상으로 마친 경기
            수와 그 경기들에서 가져온 승점. 교체 후 득점·실점은 첫 교체 이후의 스코어 변화.
          </p>
        </>
      )}
    </div>
  );
}
