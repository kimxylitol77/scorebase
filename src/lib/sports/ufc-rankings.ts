// UFC 랭킹 수집 — octagon-api(UFC.com 공식 랭킹 스크레이퍼) /rankings 단일 콜로
// 체급별 챔피언 + 컨텐더를 받고, 한글명·헤드샷·전적은 MmaFighter(이름 매칭)로 재활용한다.
//   - ESPN core rankings 는 2021 년경 데이터로 얼어붙어 사용 불가 → octagon-api 로 교체.
//   - octagon 파이터는 {id,name} 뿐이라 상세(전적·사진·한글)는 DB 매칭에 의존, 미스는 영문 fallback.
import { prisma } from "@/lib/db";
import { UFC_FIGHTER_NAMES_KO } from "@/lib/sports/ufc-fighter-names";

const RANKINGS_URL = "https://api.octagon-api.com/rankings";

// 논리 카테고리 13개. octagonId = /rankings 응답의 division id, slug = 우리 내부 식별자(DB·URL).
export const RANKING_CATEGORIES: {
  slug: string;
  octagonId: string;
  displayName: string;
  gender: "M" | "F";
  isP4p: boolean;
  sortOrder: number;
}[] = [
  { slug: "pound-for-pound", octagonId: "mens-pound-for-pound-top-rank", displayName: "파운드-포-파운드 (남)", gender: "M", isP4p: true, sortOrder: 0 },
  { slug: "womens-pound-for-pound", octagonId: "womens-pound-for-pound-top-rank", displayName: "파운드-포-파운드 (여)", gender: "F", isP4p: true, sortOrder: 1 },
  { slug: "flyweight", octagonId: "flyweight", displayName: "플라이급", gender: "M", isP4p: false, sortOrder: 2 },
  { slug: "bantamweight", octagonId: "bantamweight", displayName: "밴텀급", gender: "M", isP4p: false, sortOrder: 3 },
  { slug: "featherweight", octagonId: "featherweight", displayName: "페더급", gender: "M", isP4p: false, sortOrder: 4 },
  { slug: "lightweight", octagonId: "lightweight", displayName: "라이트급", gender: "M", isP4p: false, sortOrder: 5 },
  { slug: "welterweight", octagonId: "welterweight", displayName: "웰터급", gender: "M", isP4p: false, sortOrder: 6 },
  { slug: "middleweight", octagonId: "middleweight", displayName: "미들급", gender: "M", isP4p: false, sortOrder: 7 },
  { slug: "light-heavyweight", octagonId: "light-heavyweight", displayName: "라이트헤비급", gender: "M", isP4p: false, sortOrder: 8 },
  { slug: "heavyweight", octagonId: "heavyweight", displayName: "헤비급", gender: "M", isP4p: false, sortOrder: 9 },
  { slug: "womens-strawweight", octagonId: "womens-strawweight", displayName: "여자 스트로급", gender: "F", isP4p: false, sortOrder: 10 },
  { slug: "womens-flyweight", octagonId: "womens-flyweight", displayName: "여자 플라이급", gender: "F", isP4p: false, sortOrder: 11 },
  { slug: "womens-bantamweight", octagonId: "womens-bantamweight", displayName: "여자 밴텀급", gender: "F", isP4p: false, sortOrder: 12 },
];

export interface RankedFighter {
  rank: number; // 챔피언 카드는 0
  name: string; // 영문 풀네임
  nameKo: string | null;
  record: string | null; // "27-1-0"
  headshot: string | null;
}

export interface RankingSnapshot {
  slug: string;
  displayName: string;
  gender: "M" | "F";
  isP4p: boolean;
  sortOrder: number;
  champion: RankedFighter | null;
  ranks: RankedFighter[];
}

interface OctagonDivision {
  id: string;
  champion?: { championName?: string };
  fighters?: { name?: string }[];
}

// 이름 정규화 — 영문 소문자, 분음부호·구두점·공백 제거 (DB MmaFighter.name ↔ octagon name 매칭용).
function normName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

// UFC 파이터 한글 dict 를 정규화 키로 색인 — octagon 의 악센트 표기차(Rakić↔Rakic 등) 흡수.
const DICT_BY_NORM: Map<string, string> = new Map(
  Object.entries(UFC_FIGHTER_NAMES_KO).map(([en, ko]) => [normName(en), ko]),
);

// 전 카테고리 랭킹을 긁어 DB 매칭까지 끝낸 스냅샷 배열을 반환. octagon 실패 시 빈 배열.
export async function fetchUfcRankings(): Promise<RankingSnapshot[]> {
  let divisions: OctagonDivision[];
  try {
    const r = await fetch(RANKINGS_URL, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return [];
    divisions = (await r.json()) as OctagonDivision[];
  } catch {
    return [];
  }
  const byId = new Map(divisions.map((d) => [d.id, d]));

  // 등장 파이터 이름 전부 모아 DB 조회 (한글명·전적·헤드샷 재활용).
  const names = new Set<string>();
  for (const d of divisions) {
    if (d.champion?.championName) names.add(d.champion.championName);
    for (const f of d.fighters ?? []) if (f.name) names.add(f.name);
  }
  const rows = await prisma.mmaFighter.findMany({
    where: { name: { in: [...names] } },
    select: { name: true, nameKo: true, record: true, headshot: true },
  });
  const dbByName = new Map(rows.map((r) => [normName(r.name), r]));

  const toFighter = (name: string, rank: number): RankedFighter => {
    const db = dbByName.get(normName(name));
    return {
      rank,
      name,
      // 한글명: DB(본인 nameKo) 1순위 → UFC 파이터 dict(haiku 음역, 악센트 무시 매칭) fallback.
      nameKo: db?.nameKo ?? DICT_BY_NORM.get(normName(name)) ?? null,
      record: db?.record ?? null,
      headshot: db?.headshot ?? null,
    };
  };

  const out: RankingSnapshot[] = [];
  for (const cat of RANKING_CATEGORIES) {
    const div = byId.get(cat.octagonId);
    if (!div) continue;
    const champName = div.champion?.championName;
    const contenders = (div.fighters ?? []).map((f) => f.name).filter((n): n is string => !!n);

    if (cat.isP4p) {
      // P4P 는 챔피언 개념 없음. octagon 의 champion 은 fighters[0](P4P #1)과 동일하므로
      // prepend 하면 중복 → fighters 리스트를 그대로 1..N 으로 쓴다.
      out.push({ ...cat, champion: null, ranks: contenders.map((n, i) => toFighter(n, i + 1)) });
    } else {
      out.push({
        ...cat,
        champion: champName ? toFighter(champName, 0) : null,
        ranks: contenders.map((n, i) => toFighter(n, i + 1)),
      });
    }
  }
  return out;
}
