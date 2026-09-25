// af 경기 ↔ DB 행 매칭 규칙 — 일정 감시(schedule-watch)의 "빠졌다" 판정 단일 출처(순수 함수)
//
// 2026-09-24 전수 감사에서 검증한 규칙을 옮긴 것이다. af 2,628경기를 대조했을 때 이름 부분문자열
// 매칭은 "Los Angeles" ⊂ "LA Galaxy" 류 오탐을, 정확 일치는 "Atletico Goianiense" ↔ "Atletico Clube
// Goianiense" 류 누락 오판을 냈다. 아래 3단 규칙으로 오탐을 걸러 실누락만 남았다.

const STOP = new Set([
  "fc", "cf", "ac", "afc", "sc", "cd", "sv", "fk", "nk", "club", "de", "the", "city", "united",
  "sport", "sporting", "clube", "esporte", "al", "ca", "cs", "csm", "acs", "fcm", "se", "ec", "sd",
  "ud", "if", "ik", "bk", "ff", "w",
]);

function tokens(s: string): string[] {
  return s
    .replace(/\([^)]*\)/g, " ") // "(PAN)"·"(Nor)" 같은 국가 꼬리표 — ts 가 동명 팀 구분용으로 붙인다
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/** 팀명이 같은 팀으로 보이는가 — 의미 단어의 절반 이상이 겹치면 같다고 본다. */
export function sameTeamName(a: string, b: string): boolean {
  const A = tokens(a);
  const B = new Set(tokens(b));
  if (!A.length || !B.size) return false;
  return A.filter((w) => B.has(w)).length / Math.min(A.length, B.size) >= 0.5;
}

/**
 * 엄격 일치 — 의미 단어 집합이 완전히 같을 때만. "FC Dallas" = "FC Dallas", "Barry Town" = "Barry Town United".
 * 느슨한 sameTeamName 은 "Los Angeles FC" ≈ "Los Angeles Galaxy" 를 같다고 보므로 한 팀만으로 판정할 땐 이것을 쓴다.
 */
export function sameTeamNameStrict(a: string, b: string): boolean {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  return A.size > 0 && A.size === B.size && [...A].every((w) => B.has(w));
}

export interface AfFixtureLite {
  id: number;
  date: string; // ISO
  home: { id: number; name: string };
  away: { id: number; name: string };
}

export interface DbRowLite {
  id: number;
  externalId: string;
  startTime: Date;
  homeTeamId: number;
  awayTeamId: number;
  homeName: string;
  awayName: string;
  homeExt: string;
  awayExt: string;
}

const H = 3600_000;

/**
 * af 경기와 같은 경기로 볼 DB 행을 찾는다(같은 리그 행만 넘길 것). 없으면 null = 빠진 경기.
 * ① externalId 가 af fixture id
 * ② 양팀이 af 팀 id(매핑 또는 Team.externalId)나 이름으로 일치 — ±72h(재편성·소스 간 일정 불일치 흡수,
 *    9/24 U21 예선 산마리노-스페인 ts 9/29 vs af 10/01), 방향 무관. 같은 두 팀이 72h 안에 두 번 붙는 일은 없다
 * ③ ±3h 안에서 한 팀이 af 팀 id 로 확정 일치 — 한 팀이 3시간 안에 두 경기를 치를 수 없다
 * ④ 킥오프 ±15분 + 한 팀 이름 엄격 일치 — af 팀 id 매핑이 없는 ts 행(MLS "LAFC" ↔ af "Los Angeles FC"
 *    처럼 상대 이름이 전혀 달라도)을 잡는다. 9/25 dry-run 에서 이 규칙이 빠져 13건 중 다수가 헛누락이었다.
 */
export function findDbMatch(
  f: AfFixtureLite,
  rows: readonly DbRowLite[],
  afTeamToIds: ReadonlyMap<string, ReadonlySet<number>>,
): DbRowLite | null {
  const byExt = rows.find((r) => r.externalId === String(f.id));
  if (byExt) return byExt;
  const t = Date.parse(f.date);
  const strong = (teamId: number, ext: string, afId: number) =>
    (afTeamToIds.get(String(afId))?.has(teamId) ?? false) || ext === String(afId);
  const hit = (teamId: number, ext: string, name: string, side: { id: number; name: string }) =>
    strong(teamId, ext, side.id) || sameTeamName(side.name, name);
  const within = (r: DbRowLite, ms: number) => Math.abs(r.startTime.getTime() - t) <= ms;

  const both = rows.find(
    (r) =>
      within(r, 72 * H) &&
      ((hit(r.homeTeamId, r.homeExt, r.homeName, f.home) && hit(r.awayTeamId, r.awayExt, r.awayName, f.away)) ||
        (hit(r.homeTeamId, r.homeExt, r.homeName, f.away) && hit(r.awayTeamId, r.awayExt, r.awayName, f.home))),
  );
  if (both) return both;
  return (
    rows.find(
      (r) =>
        within(r, 3 * H) &&
        (strong(r.homeTeamId, r.homeExt, f.home.id) ||
          strong(r.awayTeamId, r.awayExt, f.away.id) ||
          strong(r.homeTeamId, r.homeExt, f.away.id) ||
          strong(r.awayTeamId, r.awayExt, f.home.id)),
    ) ??
    rows.find(
      (r) =>
        within(r, 15 * 60_000) &&
        [r.homeName, r.awayName].some((n) => sameTeamNameStrict(n, f.home.name) || sameTeamNameStrict(n, f.away.name)),
    ) ??
    null
  );
}
