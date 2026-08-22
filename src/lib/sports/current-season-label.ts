// 축구 리그의 "현재 시즌 라벨" 판정 — leagueLeader 등 시즌 라벨이 붙은 데이터가
// 지난 시즌 것인지 가려내는 단일 기준.
//
// 정본은 TheSports 시즌 메타(league-id-mapping.json 의 tsSeasonId → season/list 의 year).
// fetch-league-leaders 의 ts 경로가 라벨을 매길 때 쓰는 소스와 같아 어긋날 일이 없다.
// 달력 공식(month>=7 ? y : y-1)으로 판정하면 NBA·ROMANIA_L2 등에서 기대 라벨과 저장
// 라벨이 어긋나 멀쩡한 데이터까지 지운다(2026-08 실측) — 그래서 공식을 폴백으로도 쓰지 않고,
// 메타를 못 읽으면 null 을 돌려 판정을 보류한다.
import { thesportsGet } from "@/lib/sports/thesports/client";
import tsLeagueMap from "@/lib/sports/thesports/league-id-mapping.json";

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { label: string | null; at: number }>();

/** ts year("2026-2027" | "2026") → 우리 라벨("2026-27" | "2026"). */
function normalize(year: string): string {
  const m = year.match(/^(\d{4})-(\d{4})$/);
  return m ? `${m[1]}-${m[2].slice(2)}` : year;
}

/** 판정 불가(매핑 없음·메타 조회 실패)면 null — 호출부는 현행 동작을 유지해야 한다. */
export async function currentSeasonLabel(league: string): Promise<string | null> {
  const hit = cache.get(league);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.label;

  const entry = (tsLeagueMap as Array<{ code: string; tsSeasonId?: string }>).find(
    (e) => e.code === league,
  );
  let label: string | null = null;
  if (entry?.tsSeasonId) {
    try {
      const meta = await thesportsGet<{ code: number; results?: Array<{ year?: string }> }>(
        "/v1/football/season/list",
        { uuid: entry.tsSeasonId },
      );
      const y = meta.results?.[0]?.year;
      if (y) label = normalize(y);
    } catch {
      label = null;
    }
  }
  cache.set(league, { label, at: Date.now() });
  return label;
}

/**
 * 저장된 시즌 라벨이 이미 지난 시즌인지. 판정 불가·같은 시즌·미래 라벨이면 false.
 * 라벨 형식이 다르면(2026 vs 2026-27) 비교 자체가 무의미하므로 보류한다 —
 * 문자열 비교상 "2026" < "2026-27" 이라 그대로 두면 멀쩡한 데이터가 stale 로 오판된다.
 */
export async function isStaleSeason(league: string, storedLabel: string): Promise<boolean> {
  if (!storedLabel) return false;
  const cur = await currentSeasonLabel(league);
  if (!cur || cur === storedLabel) return false;
  const sameShape = /^\d{4}-\d{2}$/.test(cur) === /^\d{4}-\d{2}$/.test(storedLabel);
  if (!sameShape) return false;
  return storedLabel < cur;
}
