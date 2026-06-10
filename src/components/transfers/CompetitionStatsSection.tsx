// 현 시즌 대회별 스탯 — /transfers/{tsId} 선수 페이지 통합의 핵심 조각 (2026-06-10).
// 기존 /players/{afId}?league= (af 기반) 페이지의 "대회별 stats" 와 동등 정보를
// transfers 페이지에 제공 → 축구 선수 페이지를 transfers 로 단일화.
// ts→af 매핑: data/ts-af-player-map.json (시즌 스탯 지문 매칭, build-ts-af-player-map).
// 매핑 없거나 af 응답 없으면 null — 섹션 자동 미표시.

import { unstable_cache } from "next/cache";
import { tsPlayerToAf } from "@/lib/players/ts-af-map";
import {
  fetchSoccerPlayerProfile,
  getApiFootballSeason,
  type SoccerPlayerSeasonStat,
} from "@/lib/sports/api-football-pro";

// af 호출 1h 캐시 — 선수 페이지 뷰마다 quota 소모 방지
const getProfile = unstable_cache(
  async (afId: number, season: number) => fetchSoccerPlayerProfile(afId, season),
  ["transfers-competition-stats"],
  { revalidate: 3600 },
);

// 대회명 한글 (자주 나오는 것만 — 미등록은 영문 그대로)
const COMP_KO: Record<string, string> = {
  "La Liga": "라리가",
  "Premier League": "프리미어리그",
  Bundesliga: "분데스리가",
  "Serie A": "세리에 A",
  "Ligue 1": "리그 1",
  "UEFA Champions League": "챔피언스리그",
  "UEFA Europa League": "유로파리그",
  "UEFA Europa Conference League": "컨퍼런스리그",
  "Copa del Rey": "코파 델 레이",
  "FA Cup": "FA컵",
  "League Cup": "EFL컵",
  "DFB Pokal": "DFB 포칼",
  "Coppa Italia": "코파 이탈리아",
  "Coupe de France": "쿠프 드 프랑스",
  "Super Cup": "수퍼컵",
  "Trophée des Champions": "트로페 데 샹피옹",
  "Community Shield": "커뮤니티 실드",
  "Friendlies Clubs": "클럽 친선",
  "Club World Cup": "클럽 월드컵",
  "World Cup": "월드컵",
  Friendlies: "A매치 친선",
};

export default async function CompetitionStatsSection({
  tsId,
  league,
}: {
  tsId: string;
  league: string | null;
}) {
  const afId = tsPlayerToAf(tsId);
  if (!afId) return null;
  const season = getApiFootballSeason(new Date(), league ?? "EPL");
  const profile = await getProfile(afId, season).catch(() => null);
  if (!profile) return null;
  const rows = (profile.stats ?? [])
    .filter((s): s is SoccerPlayerSeasonStat => !!s && (s.appearances ?? 0) > 0)
    .sort((a, b) => (b.appearances ?? 0) - (a.appearances ?? 0));
  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-bold">🏆 현 시즌 대회별 스탯</h2>
        <span className="text-[11px] text-neutral-500">{season}-{(season + 1) % 100} 시즌 · 대회 {rows.length}개</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
          <tr>
            <th className="text-left px-4 py-2 font-medium">대회</th>
            <th className="text-right px-2 py-2 font-medium">출전</th>
            <th className="text-right px-2 py-2 font-medium">⚽</th>
            <th className="text-right px-2 py-2 font-medium">🎯</th>
            <th className="text-right px-4 py-2 font-medium">평점</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {rows.map((s, i) => {
            const rating = s.rating ? parseFloat(s.rating) : null;
            return (
              <tr key={i}>
                <td className="px-4 py-2.5 font-medium">{COMP_KO[s.leagueName] ?? s.leagueName}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{s.appearances}</td>
                <td className="px-2 py-2.5 text-right tabular-nums font-bold">{s.goals ?? 0}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-neutral-500">{s.assists ?? 0}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${rating != null && rating >= 7.5 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                  {rating != null ? rating.toFixed(2) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
