// 선수 부상 이력 데이터 — API-Football /injuries(경기별 플래그)를 부상 스펠로 묶음.
// 출전정지(경고 누적 등 비부상) 제외. ts→af 매핑 없으면 빈 배열 → 페이지가 탭 미표시.
import { unstable_cache } from "next/cache";
import { fetchPlayerInjuries, getApiFootballSeason, type InjuryFlag } from "@/lib/sports/api-football-pro";
import { tsPlayerToAf } from "@/lib/players/ts-af-map";

const getCachedInjuries = unstable_cache(
  async (afId: number, seasons: number[]) => fetchPlayerInjuries(afId, seasons),
  ["player-injuries-v1"],
  { revalidate: 43200 }, // 12h — 현 부상 상태 반영
);

export interface InjurySpell {
  reason: string; // 한글 사유
  from: string; // YYYY-MM-DD
  to: string;
  games: number; // 결장/의심 경기 수
  ongoing: boolean; // 최근 30일 내 마지막 플래그면 진행중 표시
}

// 비부상(정지·행정) 사유 제외
const NON_INJURY = /(Yellow Card|Red Card|Suspend|National|Coach|Rest$|Personal|Doping|Contract|Broken|Other)/i;

// api-football 부상 사유 → 한글 (부위/유형)
const REASON_KO: Array<[RegExp, string]> = [
  [/Hamstring/i, "햄스트링 부상"], [/Groin/i, "사타구니 부상"], [/Ankle/i, "발목 부상"], [/Knee/i, "무릎 부상"],
  [/Foot/i, "발 부상"], [/Calf/i, "종아리 부상"], [/Thigh/i, "허벅지 부상"], [/Muscle/i, "근육 부상"],
  [/Back/i, "허리 부상"], [/Shoulder/i, "어깨 부상"], [/Hip/i, "고관절 부상"], [/Toe/i, "발가락 부상"],
  [/Achilles/i, "아킬레스건 부상"], [/Head|Concussion/i, "머리 부상"], [/Knock/i, "타박상"], [/Surgery/i, "수술"],
  [/Illness|Virus|Covid|Sick|Health/i, "질병"], [/Fitness|Fatigue|Condition/i, "컨디션 난조"], [/Injury/i, "부상"],
];
function reasonKo(raw: string): string {
  for (const [re, ko] of REASON_KO) if (re.test(raw)) return ko;
  return raw;
}

// ts player id → 부상 스펠 (최신순). 매핑 없으면 빈 배열.
export async function getPlayerInjuriesByTs(tsId: string): Promise<InjurySpell[]> {
  const afId = tsPlayerToAf(tsId);
  if (!afId) return [];
  const cur = getApiFootballSeason(new Date(), "EPL");
  const seasons = [cur, cur - 1, cur - 2, cur - 3, cur - 4];
  const flags = await getCachedInjuries(afId, seasons).catch(() => [] as InjuryFlag[]);
  if (!flags.length) return [];

  // 부상만, 날짜순 정렬
  const injuries = flags.filter((f) => f.reason && !NON_INJURY.test(f.reason)).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!injuries.length) return [];

  // 같은 사유 + 45일 이내 연속 = 한 스펠
  const DAY = 86400_000;
  const spells: { reasonRaw: string; from: string; to: string; games: number }[] = [];
  for (const f of injuries) {
    const last = spells[spells.length - 1];
    const gapOk = last && (new Date(f.date).getTime() - new Date(last.to).getTime()) <= 45 * DAY;
    // 같은 사유군(한글 매핑 기준)으로 묶음 — "Foot Injury"/"Injury" 혼재 방지
    if (last && gapOk && reasonKo(last.reasonRaw) === reasonKo(f.reason)) {
      last.to = f.date;
      last.games += 1;
    } else {
      spells.push({ reasonRaw: f.reason, from: f.date, to: f.date, games: 1 });
    }
  }

  const now = Date.now();
  return spells
    .map((s) => ({
      reason: reasonKo(s.reasonRaw),
      from: s.from,
      to: s.to,
      games: s.games,
      ongoing: now - new Date(s.to).getTime() <= 30 * DAY,
    }))
    .reverse(); // 최신순
}
