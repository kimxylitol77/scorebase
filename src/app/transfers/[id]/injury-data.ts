// 선수 부상 이력 데이터 — 두 소스 합집합.
//   ① TheSports(PlayerEvent INJURY/RETURN) — 사유·시작일·결장수가 완결된 레코드. 정확하지만
//      매치 라인업 잔존분만이라 과거가 얕다. "근황" 타임라인과 같은 소스.
//   ② API-Football /injuries — 경기별 결장 플래그를 45일 규칙으로 묶은 추정. 5시즌까지 깊지만
//      개막 전 시즌은 coverage.injuries=false 로 0건이 되는 구멍이 있다.
// ①을 우선하고 기간이 겹치지 않는 ②만 덧붙인다. 둘이 따로 놀아 근황엔 있는 부상이 이력엔
//   없던 것이 원인 (2026-08 우가르테 십자인대 실측).
// 출전정지(경고 누적 등 비부상) 제외.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { fetchPlayerInjuries, getApiFootballSeason, type InjuryFlag } from "@/lib/sports/api-football-pro";
import { tsPlayerToAf } from "@/lib/players/ts-af-map";

const getCachedInjuries = unstable_cache(
  async (afId: number, seasons: number[]) => fetchPlayerInjuries(afId, seasons),
  ["player-injuries-v2"], // v1 = 한도 오류로 시즌 누락된 부분 결과가 굳어 있어 폐기

  { revalidate: 43200 }, // 12h — 현 부상 상태 반영
);

export interface InjurySpell {
  reason: string; // 한글 사유
  from: string; // YYYY-MM-DD
  to: string;
  games: number; // 결장/의심 경기 수
  ongoing: boolean; // 최근 30일 내 마지막 플래그면 진행중 표시
  source: "ts" | "af"; // 출처 — ts 는 완결 레코드, af 는 플래그 추정
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

const DAY_MS = 86400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** TheSports 부상 이벤트 → 스펠. INJURY 의 짝 RETURN 이 있으면 종료일이 된다. */
async function tsSpells(tsId: string): Promise<InjurySpell[]> {
  const rows = await prisma.playerEvent
    .findMany({
      where: { playerId: tsId, type: { in: ["INJURY", "RETURN"] }, id: { startsWith: "injury:" } },
      select: { id: true, type: true, occurredAt: true, detail: true },
    })
    .catch(() => []);
  // RETURN 은 id 가 "return:{pid}:{start}" 라 startsWith 로는 안 잡힌다 — 따로 조회해 start 키로 짝짓는다.
  const returns = await prisma.playerEvent
    .findMany({ where: { playerId: tsId, type: "RETURN" }, select: { id: true, occurredAt: true } })
    .catch(() => []);
  const endByStart = new Map(returns.map((r) => [r.id.replace(/^return:/, ""), r.occurredAt]));

  const now = Date.now();
  return rows
    .filter((r) => r.type === "INJURY")
    .map((r) => {
      const d = (r.detail ?? {}) as { reason?: string; missedMatches?: number | null; lastSeenAt?: string };
      const key = r.id.replace(/^injury:/, "");
      const end = endByStart.get(key) ?? null;
      // ts 는 end_time 을 거의 안 준다 → 마지막으로 라인업에 실려 있던 경기(lastSeenAt)가
      //  45일 이내면 아직 결장 중으로 본다. 복귀 이벤트가 있으면 그쪽이 우선.
      //  45일은 /injuries 목록(thesports/injuries.ts)의 판정과 같은 값 — 두 화면이 같은
      //  부상을 두고 "진행중" 여부가 갈리면 안 된다 (실측: 오나나 십자인대 파열 35일 경과).
      const lastSeen = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : r.occurredAt.getTime();
      return {
        reason: d.reason || "부상",
        from: iso(r.occurredAt),
        to: end ? iso(end) : iso(r.occurredAt),
        games: d.missedMatches ?? 0,
        ongoing: !end && now - lastSeen <= 45 * DAY_MS,
        source: "ts" as const,
      };
    })
    .sort((a, b) => (a.from < b.from ? 1 : -1));
}

// ts player id → 부상 스펠 (최신순). ts 우선 + af 보완.
export async function getPlayerInjuriesByTs(tsId: string): Promise<InjurySpell[]> {
  const ts = await tsSpells(tsId);
  const af = await afSpells(tsId);
  // 같은 부상이 양쪽에 잡히면 ts 를 남긴다 — 기간이 겹치면 중복으로 본다(사유 표기가 달라
  //  사유 일치로는 못 거른다: ts "십자인대 부상" vs af "무릎 부상").
  const overlaps = (a: InjurySpell, b: InjurySpell) => a.from <= b.to && b.from <= a.to;
  const merged = [...ts, ...af.filter((x) => !ts.some((t) => overlaps(t, x)))];
  return merged.sort((a, b) => (a.from < b.from ? 1 : -1));
}

async function afSpells(tsId: string): Promise<InjurySpell[]> {
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
      source: "af" as const,
    }))
    .reverse(); // 최신순
}
