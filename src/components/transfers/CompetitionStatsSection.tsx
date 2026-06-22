// 현 시즌 대회별 스탯 — /transfers/{tsId} 선수 페이지 통합의 핵심 조각 (2026-06-10).
// 기존 /players/{afId}?league= (af 기반) 페이지의 "대회별 stats" 와 동등 정보를
// transfers 페이지에 제공 → 축구 선수 페이지를 transfers 로 단일화.
// ts→af 매핑: data/ts-af-player-map.json (시즌 스탯 지문 매칭, build-ts-af-player-map).
// extraRows(월드컵 등 af 외 대회) 가 있으면 af 프로필 없어도 표를 렌더.

import { unstable_cache } from "next/cache";
import { tsPlayerToAf } from "@/lib/players/ts-af-map";
import {
  fetchSoccerPlayerProfile,
  getApiFootballSeason,
} from "@/lib/sports/api-football-pro";
import { Trophy, Goal, Target } from "lucide-react";

// af 호출 1h 캐시 — 선수 페이지 뷰마다 quota 소모 방지. 같은 (afId, season) 은 헤더 신체와 공유.
export const getCachedSoccerProfile = unstable_cache(
  async (afId: number, season: number) => fetchSoccerPlayerProfile(afId, season),
  ["transfers-competition-stats-v2-logo"],
  { revalidate: 3600 },
);

// 헤더 신체(생년월일·키·몸무게) 용 — 페이지가 호출, 위 캐시를 공유해 중복 호출 0.
export async function getSoccerPlayerBio(tsId: string, league: string | null) {
  const afId = tsPlayerToAf(tsId);
  if (!afId) return null;
  const season = getApiFootballSeason(new Date(), league ?? "EPL");
  return getCachedSoccerProfile(afId, season).catch(() => null);
}

export interface CompRow {
  leagueName: string;
  logo?: string | null;
  appearances: number;
  goals: number;
  assists: number;
  rating: number | null;
}

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
  extraRows = [],
}: {
  tsId: string;
  league: string | null;
  extraRows?: CompRow[];
}) {
  const afId = tsPlayerToAf(tsId);
  const season = getApiFootballSeason(new Date(), league ?? "EPL");
  // 캘린더제 리그(MLS·K·J·브라질 등)는 단일 연도 시즌 — "2026-27" 표기 방지
  const CALENDAR_LEAGUES = new Set(["MLS", "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "BRASILEIRAO", "ALLSVENSKAN", "ELITESERIEN", "CSL"]);
  const seasonLabel = CALENDAR_LEAGUES.has(league ?? "")
    ? `${season}`
    : `${season}-${(season + 1) % 100}`;
  const profile = afId ? await getCachedSoccerProfile(afId, season).catch(() => null) : null;
  const afRows: CompRow[] = (profile?.stats ?? [])
    .filter((s) => !!s && (s.appearances ?? 0) > 0)
    .sort((a, b) => (b.appearances ?? 0) - (a.appearances ?? 0))
    .map((s) => ({
      leagueName: s.leagueName,
      logo: s.leagueLogo ?? null,
      appearances: s.appearances ?? 0,
      goals: s.goals ?? 0,
      assists: s.assists ?? 0,
      rating: s.rating ? parseFloat(s.rating) : null,
    }));
  // 월드컵 등 extraRows 를 앞에, af 클럽 대회를 뒤에.
  const rows = [...extraRows, ...afRows];
  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl bg-white ring-1 ring-black/5 overflow-hidden dark:bg-white/[0.04] dark:ring-white/10">
      <div className="px-4 pt-3 pb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-bold flex items-center gap-1.5"><Trophy className="h-4 w-4 text-rose-500" aria-hidden /> 현 시즌 대회별 스탯</h2>
        <span className="text-[11px] text-neutral-500">{seasonLabel} 시즌 · 대회 {rows.length}개</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.03] text-xs text-neutral-500">
          <tr>
            <th className="text-left px-4 py-2 font-medium">대회</th>
            <th className="text-right px-2 py-2 font-medium">출전</th>
            <th className="px-2 py-2 font-medium"><Goal className="ml-auto h-4 w-4" aria-label="골" /></th>
            <th className="px-2 py-2 font-medium"><Target className="ml-auto h-4 w-4" aria-label="도움" /></th>
            <th className="text-right px-4 py-2 font-medium">평점</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {rows.map((s, i) => (
            <tr key={i}>
              <td className="px-4 py-2.5 font-medium">
                <span className="flex items-center gap-2">
                  {s.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logo} alt="" className="w-5 h-5 object-contain shrink-0" />
                  )}
                  <span>{COMP_KO[s.leagueName] ?? s.leagueName}</span>
                </span>
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">{s.appearances}</td>
              <td className="px-2 py-2.5 text-right tabular-nums font-bold">{s.goals}</td>
              <td className="px-2 py-2.5 text-right tabular-nums text-neutral-500">{s.assists}</td>
              <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${s.rating != null && s.rating >= 7.5 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                {s.rating != null ? s.rating.toFixed(2) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
