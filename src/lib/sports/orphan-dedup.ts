// /scores 의 orphan 카드(api-football 날짜조회)가 DB 매치와 같은 경기인지 판정하는 단일 출처.
//
// 왜 필요한가: 축구 매치는 소스가 둘이다 — DB 는 TheSports 수집, orphan 카드는 af 날짜조회.
// 두 소스는 같은 경기를 다른 팀 표기·다른 킥오프 시각으로 싣기 때문에(af "Club Brugge II"
// 10:00 ↔ ts "Club NXT" 11:00) externalId 도 팀명도 안 맞아 같은 경기가 카드 두 장으로 뜬다.
// 판정 규칙을 페이지 밖에 두는 이유는 scripts/audit-scores-orphan-dup.ts 가 **같은 함수**로
// 감사할 수 있게 하기 위함 — 규칙이 페이지 안에만 있으면 감사 스크립트가 사본을 들고
// 갈라져(drift) 재발을 놓친다.
import { toKoreanTeamName } from "@/lib/team-names";
import type { DatedMatch } from "@/lib/sports/live-scores";

/** 한글 매핑까지 태운 정규화 키 — 표기 흔들림 흡수용. */
export function normalizeTeamName(s: string): string {
  const stripped = s
    .replace(/\s+(fc|sc|cf|united|club|esports|f\.c\.|s\.c\.)\s*$/gi, "")
    .trim();
  let ko = toKoreanTeamName(stripped);
  if (ko === stripped) {
    const spaced = stripped.replace(/\./g, ". ").replace(/\s+/g, " ").trim();
    if (spaced !== stripped) {
      const ko2 = toKoreanTeamName(spaced);
      if (ko2 !== spaced) ko = ko2;
    }
  }
  return ko.toLowerCase().replace(/[\s.·\-_]/g, "");
}

/**
 * 순수 로마자 키 — 한글 매핑을 거치지 않고 발음기호·특수문자만 정규화.
 * normalizeTeamName 은 toKoreanTeamName 을 먼저 태워서, 한쪽 철자만 한글 매핑에 걸리면
 * 키가 갈린다(예: "Bodø/Glimt"→한글 vs "Bodo Glimt"→로마자). 이 키는 그 우회로.
 */
export function romanizeTeamName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // 결합 diacritic (é á ñ ü …)
    .normalize("NFC")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/ø/g, "o")
    .replace(/ł/g, "l")
    .replace(/đ|ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/ß/g, "ss")
    .replace(/ı/g, "i")
    // 슬라브 로마자 표기는 같은 팀을 i 로도 y 로도 적는다 — af "Krylia Sovetov vs Dinamo
    // Makhachkala" ↔ ts "Krylya Sovetov vs Dynamo Makhachkala"(2026-08-16 RPL 실측, 양팀
    // 모두 어긋나 카드 두 장). 한쪽으로 몰아 흡수. 전체 5002팀 스캔에서 이 치환으로 새로
    // 겹치는 같은 리그 팀은 0건이었다(오매칭 위험 실측).
    .replace(/y/g, "i")
    .replace(/[\s.·\-_/]/g, "");
}

/** 토큰 순서만 다른 표기 대응 — af "Sportfreunde Siegen" ↔ ts "Siegen Sportfreunde". */
export function tokenSortKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
    .sort()
    .join(" ");
}

/** 판정에 필요한 DB 매치 최소 정보. */
export interface DedupDbMatch {
  league: string;
  startTime: Date;
  homeTeamId: number;
  awayTeamId: number;
  homeName: string;
  awayName: string;
  /** 이미 연결된 af fixture id — 있으면 이름 규칙 없이 확정 판정. */
  apiFixtureId?: number | null;
  /** 링크 잡이 Match 를 갱신할 때만 필요(페이지는 안 넘겨도 된다). */
  id?: number;
}

/** af fixture ↔ DB 매치가 양팀 모두 일치해 확정된 짝. */
export interface ConfirmedPair {
  dated: DatedMatch;
  db: DedupDbMatch;
  /** true 면 af 의 홈이 DB 의 원정 — 팀 매핑을 뒤집어 등록해야 한다. */
  swapped: boolean;
}

/** 중복으로 판정한 근거 — 감사 출력용. */
export type DedupReason = "fixtureId" | "name" | "roman" | "teamId" | "oneSide" | "crossDay";

const NEAR_KICKOFF_MS = 120 * 60 * 1000;
const SAME_KICKOFF_MS = 15 * 60 * 1000;
// 2군·리저브 표기 — 소스마다 II / B / NXT / Jong / Am / U21 로 제각각이라 별칭 개연성 신호로 쓴다.
const RESERVE_MARK = /(\bii\b|\bb\b|\bnxt\b|\bjong\b|\bam\b|u-?\d{2}\b|youth|reserves?|academy|ii$)/i;

/**
 * DB 매치 집합에 대해 orphan 후보의 중복 여부를 판정하는 함수를 만든다.
 * @param afTeamIdMap af 팀 ID → 우리 Team.id 집합 (TeamSourceId source="api-football")
 * @param crossDayTeamPairs 인접일(±2일) DB 매치의 `league|homeTeamId|awayTeamId` 집합.
 *   af 가 킥오프를 **하루 틀리게** 싣는 경기 대응 — 2026-08-23 COLOMBIA_PA 실측: af 는
 *   Junior vs Once Caldas 를 8/23 01:15Z, 우리(ts)는 8/24 01:15Z 로 싣는다(현지 8/23 20:15 이
 *   맞고 af 가 하루 빠름). 판정은 하루 단위라 짝이 범위 밖이고, 그 결과 같은 경기가 이틀에 걸쳐
 *   카드 두 장으로 뜬다. 팀 쌍은 **방향까지 같을 때만** 본다 — 홈/원정을 뒤집는 컵 2차전을
 *   같은 경기로 지우지 않기 위함.
 */
export function buildOrphanDedup(
  matches: DedupDbMatch[],
  dated: DatedMatch[],
  afTeamIdMap: Map<string, Set<number>>,
  crossDayTeamPairs?: Set<string>,
) {
  // 팀명 정규화는 매치 수 × 후보 수만큼 반복 호출된다(프리시즌 하루 300건 이상) — 결과 캐시.
  const memo = <T,>(fn: (s: string) => T) => {
    const cache = new Map<string, T>();
    return (s: string) => {
      let v = cache.get(s);
      if (v === undefined) {
        v = fn(s);
        cache.set(s, v);
      }
      return v;
    };
  };
  const normOf = memo(normalizeTeamName);
  const romanOf = memo(romanizeTeamName);
  const tokenOf = memo(tokenSortKey);

  // 부분 포함은 3자 미만이면 오매칭이라 제외하되, 완전 일치는 길이와 무관하게 인정
  // (한글 매핑을 태우면 2글자 팀명이 나온다).
  const nameOverlap = (x: string, y: string) =>
    x.length > 0 &&
    y.length > 0 &&
    (x === y || (x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x))));

  const sideOverlap = (dbName: string, dmName: string) =>
    nameOverlap(normOf(dbName), normOf(dmName)) ||
    nameOverlap(romanOf(dbName), romanOf(dmName)) ||
    (tokenOf(dbName).length > 0 && tokenOf(dbName) === tokenOf(dmName));

  // 홈/원정 뒤바뀜도 같은 경기 — af 와 TheSports 가 중립구장·프리시즌 매치의 홈팀을
  // 반대로 싣는 경우가 있다(2026-07-24 af "Zorya Luhansk vs Göztepe" ↔ DB "Göztepe vs Zorya").
  const bothSides = (m: DedupDbMatch, dm: DatedMatch, key: (s: string) => string) => {
    const h = key(dm.homeName);
    const a = key(dm.awayName);
    const mh = key(m.homeName);
    const ma = key(m.awayName);
    return (
      (nameOverlap(mh, h) && nameOverlap(ma, a)) || (nameOverlap(mh, a) && nameOverlap(ma, h))
    );
  };

  const dbTeamPairs = new Set(
    matches.flatMap((m) => [
      `${m.league}|${m.homeTeamId}|${m.awayTeamId}`,
      `${m.league}|${m.awayTeamId}|${m.homeTeamId}`, // 홈/원정 뒤바뀜 허용
    ]),
  );

  /** 겹친 쪽 수와, 안 겹친 나머지 두 팀 이름. */
  const pairSides = (m: DedupDbMatch, dm: DatedMatch) => {
    const hh = sideOverlap(m.homeName, dm.homeName);
    const aa = sideOverlap(m.awayName, dm.awayName);
    const ha = sideOverlap(m.homeName, dm.awayName);
    const ah = sideOverlap(m.awayName, dm.homeName);
    if ((hh && aa) || (ha && ah)) return { matched: 2, rest: null as [string, string] | null };
    if (hh) return { matched: 1, rest: [m.awayName, dm.awayName] as [string, string] };
    if (aa) return { matched: 1, rest: [m.homeName, dm.homeName] as [string, string] };
    if (ha) return { matched: 1, rest: [m.awayName, dm.homeName] as [string, string] };
    if (ah) return { matched: 1, rest: [m.homeName, dm.awayName] as [string, string] };
    return { matched: 0, rest: null as [string, string] | null };
  };

  /** 양팀이 모두 일치할 때의 방향 — 한쪽이라도 어긋나면 null. */
  const exactSides = (m: DedupDbMatch, dm: DatedMatch): "straight" | "swapped" | null => {
    const hh = sideOverlap(m.homeName, dm.homeName);
    const aa = sideOverlap(m.awayName, dm.awayName);
    if (hh && aa) return "straight";
    const ha = sideOverlap(m.homeName, dm.awayName);
    const ah = sideOverlap(m.awayName, dm.homeName);
    if (ha && ah) return "swapped";
    return null;
  };

  const nearInTime = (aMs: number, bMs: number) => Math.abs(aMs - bMs) <= NEAR_KICKOFF_MS;

  // 이미 연결된 af fixture id — 링크 잡(link-club-friendly-af)이 채워두면 이름 규칙을
  // 아예 거치지 않고 확정 판정된다. orphan id 는 "af-{fixtureId}" 형식.
  const dbFixtureIds = new Set(
    matches.map((m) => m.apiFixtureId).filter((v): v is number => v != null),
  );
  const coveredByFixtureId = (dm: DatedMatch) => {
    const m = /^af-(\d+)$/.exec(dm.id);
    return !!m && dbFixtureIds.has(Number(m[1]));
  };

  // 팀 ID 대조 — 이름 표기가 아무리 갈려도 af 팀 ID 가 우리 Team 행에 매핑돼 있으면 확실히 같은 경기.
  // (같은 af id 가 리그별로 다른 Team 행에 물릴 수 있어 teamId 를 Set 으로 모아 교차 검사.)
  const coveredByTeamId = (dm: DatedMatch) => {
    const hs = dm.homeTeamExtId ? afTeamIdMap.get(dm.homeTeamExtId) : undefined;
    const as = dm.awayTeamExtId ? afTeamIdMap.get(dm.awayTeamExtId) : undefined;
    if (!hs?.size || !as?.size) return false;
    for (const h of hs) {
      for (const a of as) if (dbTeamPairs.has(`${dm.league}|${h}|${a}`)) return true;
    }
    return false;
  };

  // af 가 킥오프 날짜를 틀리게 싣는 경기 — 같은 팀 쌍(방향 동일)의 DB 매치가 인접일에 있으면
  // 그 경기다. 팀 ID 로만 판정하므로 이름 표기와 무관하고, 방향을 강제해 컵 2차전은 살린다.
  const coveredByCrossDay = (dm: DatedMatch) => {
    if (!crossDayTeamPairs?.size) return false;
    const hs = dm.homeTeamExtId ? afTeamIdMap.get(dm.homeTeamExtId) : undefined;
    const as = dm.awayTeamExtId ? afTeamIdMap.get(dm.awayTeamExtId) : undefined;
    if (!hs?.size || !as?.size) return false;
    for (const h of hs) {
      for (const a of as) if (crossDayTeamPairs.has(`${dm.league}|${h}|${a}`)) return true;
    }
    return false;
  };

  // 한쪽 팀만 이름이 겹치는 중복 — 소스가 팀을 아예 다른 별칭으로 부르면(af "Club Brugge II" ↔
  // ts "Club NXT") 양팀 AND 매칭이 통째로 실패한다.
  // 오탐 가드 3중 — 프리시즌엔 한 팀이 하루에 상대를 바꿔 두 경기를 뛰므로, 한쪽 일치만으로
  // 지우면 멀쩡한 경기가 사라진다(실측: af "Hartlepool vs Grimsby" ↔ DB "Cleethorpes Town vs
  // Grimsby Town" 은 서로 다른 경기).
  //   ① DB↔af 가 1:1 로 붙을 때만 (1:다면 어느 쪽이 짝인지 알 수 없어 그냥 노출)
  //   ② 킥오프가 15분 내로 사실상 같을 때, 또는
  //   ③ 남은 두 팀이 모두 2군/리저브 표기라 별칭일 개연성이 클 때
  // 1:1 가드는 판정에 쓰는 시간창과 같은 폭으로 세야 한다. 킥오프가 같은 경기를 120분 창으로
  // 세면, 두 시간 안에 같은 팀이 낀 다른 경기 하나만 있어도 1:다가 되어 확실한 중복까지 놓친다
  // (실측: af "SV Meppen vs Schalke 04 II" 가 60분 뒤 "FC Schalke 04 vs Fagiano Okayama"
  // 때문에 살아남던 케이스).
  const oneSideWithin = (
    dm: DatedMatch,
    windowMs: number,
    accept: (rest: [string, string] | null) => boolean,
  ) => {
    const dmMs = new Date(dm.startTime).getTime();
    const within = (aMs: number, bMs: number) => Math.abs(aMs - bMs) <= windowMs;
    const dbHits = matches.filter(
      (m) =>
        m.league === dm.league &&
        within(m.startTime.getTime(), dmMs) &&
        pairSides(m, dm).matched > 0,
    );
    if (dbHits.length !== 1) return false; // ①
    const m = dbHits[0];
    const afHits = dated.filter(
      (d) =>
        d.league === dm.league &&
        within(new Date(d.startTime).getTime(), m.startTime.getTime()) &&
        pairSides(m, d).matched > 0,
    );
    if (afHits.length !== 1) return false; // ①
    const { matched, rest } = pairSides(m, dm);
    return matched === 2 || accept(rest);
  };
  const coveredByOneSideAndTime = (dm: DatedMatch) =>
    // ② 킥오프가 사실상 같으면 상대 표기가 달라도 같은 경기
    oneSideWithin(dm, SAME_KICKOFF_MS, () => true) ||
    // ③ 킥오프가 최대 2시간 어긋나면, 남은 두 팀이 모두 2군/리저브 표기일 때만
    oneSideWithin(
      dm,
      NEAR_KICKOFF_MS,
      (rest) => !!rest && RESERVE_MARK.test(rest[0]) && RESERVE_MARK.test(rest[1]),
    );

  /** 중복이면 근거를, 아니면 null. */
  const reasonOf = (dm: DatedMatch): DedupReason | null => {
    if (coveredByFixtureId(dm)) return "fixtureId";
    if (matches.some((m) => m.league === dm.league && bothSides(m, dm, normOf))) return "name";
    if (matches.some((m) => m.league === dm.league && bothSides(m, dm, romanOf))) return "roman";
    if (coveredByTeamId(dm)) return "teamId";
    if (coveredByOneSideAndTime(dm)) return "oneSide";
    if (coveredByCrossDay(dm)) return "crossDay";
    return null;
  };

  /**
   * af fixture ↔ DB 매치의 확정 짝 — 양팀 이름이 모두 맞고 킥오프 ±120분이며 1:1 일 때만.
   * 링크 잡이 이 결과로 Match.apiFixtureId 와 af 팀 매핑을 저장한다. 영구 저장이라
   * 표시용 dedup 보다 엄격하게 — 한쪽 팀만 맞는 추정 매칭은 절대 넣지 않는다.
   */
  const confirmedPairs = (): ConfirmedPair[] => {
    const out: ConfirmedPair[] = [];
    for (const dm of dated) {
      const dmMs = new Date(dm.startTime).getTime();
      const hits = matches.filter(
        (m) =>
          m.league === dm.league &&
          nearInTime(m.startTime.getTime(), dmMs) &&
          exactSides(m, dm) !== null,
      );
      if (hits.length !== 1) continue;
      const db = hits[0];
      // 역방향도 1:1 이어야 한다 — af 쪽에 같은 DB 매치를 노리는 fixture 가 둘이면 판정 불가.
      const back = dated.filter(
        (d) =>
          d.league === db.league &&
          nearInTime(new Date(d.startTime).getTime(), db.startTime.getTime()) &&
          exactSides(db, d) !== null,
      );
      if (back.length !== 1) continue;
      out.push({ dated: dm, db, swapped: exactSides(db, dm) === "swapped" });
    }
    return out;
  };

  /** 같은 경기가 DB 에 이미 있으면 true — orphan 카드로 그리지 않는다. */
  const isCovered = (dm: DatedMatch) => reasonOf(dm) !== null;

  /** 감사용 — 짝으로 지목된 DB 매치(없으면 null). */
  const pairedDbMatch = (dm: DatedMatch) => {
    const dmMs = new Date(dm.startTime).getTime();
    // 팀 ID 축을 먼저 본다 — 이름이 양쪽 다 다른 리그(af 가 구 팀명을 쓰는 CHINA_3)는 ID 로만
    // 판정되므로, 이름으로 짝을 찾으면 감사 출력이 "짝 특정 실패"로 떠 눈으로 확인할 수 없다.
    const hs = dm.homeTeamExtId ? afTeamIdMap.get(dm.homeTeamExtId) : undefined;
    const as = dm.awayTeamExtId ? afTeamIdMap.get(dm.awayTeamExtId) : undefined;
    const byTeamId =
      hs?.size && as?.size
        ? matches.find(
            (m) =>
              m.league === dm.league &&
              ((hs.has(m.homeTeamId) && as.has(m.awayTeamId)) ||
                (hs.has(m.awayTeamId) && as.has(m.homeTeamId))),
          )
        : undefined;
    return (
      byTeamId ??
      matches.find(
        (m) =>
          m.league === dm.league &&
          (bothSides(m, dm, normOf) || bothSides(m, dm, romanOf)),
      ) ??
      matches.find(
        (m) =>
          m.league === dm.league &&
          nearInTime(m.startTime.getTime(), dmMs) &&
          pairSides(m, dm).matched > 0,
      ) ??
      null
    );
  };

  return { isCovered, reasonOf, pairedDbMatch, confirmedPairs };
}
