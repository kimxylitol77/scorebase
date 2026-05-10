// 2026 FIFA 월드컵 본선 진출 48개국 Elo 시드.
//
// 출처: World Football Elo Ratings (eloratings.net) — 2026-05 시점 스냅샷.
// 클럽 매치만으로 학습한 우리 자체 Elo 는 국가대표 매치를 한 번도 안 봤기 때문에,
// 조별예선 시작 전에는 외부 시드값을 그대로 사용하고, 본선이 진행되면서
// 매치 결과에 따라 calcEloTable() 이 자체적으로 갱신해 나가도록 한다.

/** api-football 팀 이름 → eloratings.net 기반 시드 Elo */
export const WORLD_CUP_TEAM_ELO: Record<string, number> = {
  // 1티어 — 우승 후보
  Spain: 2165,
  Argentina: 2113,
  France: 2082,
  Brazil: 1984,
  Portugal: 1984,
  Netherlands: 1961,
  Colombia: 1975,
  England: 2020,
  Ecuador: 1933,
  Croatia: 1930,
  Germany: 1923,
  Norway: 1912,
  Japan: 1904,
  Türkiye: 1903,
  Uruguay: 1892,
  Switzerland: 1889,
  Senegal: 1878,
  Denmark: 1870, // 데이터셋에 있지만 본선에는 미진출 (참고용)
  Belgium: 1866,
  Mexico: 1858,
  Paraguay: 1833,
  Austria: 1827,
  Morocco: 1821,
  Canada: 1784,
  Australia: 1783,
  Iran: 1760,
  Scotland: 1752,
  Algeria: 1743,
  Panama: 1737,
  Uzbekistan: 1727,
  "Czech Republic": 1726,
  USA: 1721,
  "Korea Republic": 1721,
  "South Korea": 1721,
  Sweden: 1719,
  Jordan: 1690,
  Egypt: 1689,
  "Ivory Coast": 1676,
  "Congo DR": 1655,
  Tunisia: 1636,
  Iraq: 1607,
  Bosnia: 1594,
  "Bosnia & Herzegovina": 1594,
  "New Zealand": 1585,
  "Saudi Arabia": 1568,
  "Cape Verde Islands": 1549,
  "Cape Verde": 1549,
  "South Africa": 1524,
  Ghana: 1505,
  Curaçao: 1436,
  Curacao: 1436,
  Qatar: 1425,
  Haiti: 1532,
};

/** 12조 분배 (api-football standings 2026 시점) */
export const WORLD_CUP_GROUPS: Record<string, string[]> = {
  A: ["Mexico", "South Africa", "South Korea", "Czech Republic"],
  B: ["Canada", "Bosnia & Herzegovina", "Qatar", "Switzerland"],
  C: ["Brazil", "Morocco", "Haiti", "Scotland"],
  D: ["USA", "Paraguay", "Australia", "Türkiye"],
  E: ["Germany", "Curaçao", "Ivory Coast", "Ecuador"],
  F: ["Netherlands", "Japan", "Sweden", "Tunisia"],
  G: ["Belgium", "Egypt", "Iran", "New Zealand"],
  H: ["Spain", "Cape Verde Islands", "Saudi Arabia", "Uruguay"],
  I: ["France", "Senegal", "Iraq", "Norway"],
  J: ["Argentina", "Algeria", "Austria", "Jordan"],
  K: ["Portugal", "Colombia", "Uzbekistan", "Congo DR"],
  L: ["England", "Croatia", "Ghana", "Panama"],
};

/** 팀 이름의 약간의 표기 차이 흡수 — DB의 name 과 시드 키를 매칭. */
export function getWorldCupSeedElo(teamName: string): number | undefined {
  if (WORLD_CUP_TEAM_ELO[teamName] != null) return WORLD_CUP_TEAM_ELO[teamName];
  // 대소문자 무시 + 공백 제거 비교
  const norm = (s: string) => s.toLowerCase().replace(/[\s.&-]/g, "");
  const target = norm(teamName);
  for (const [k, v] of Object.entries(WORLD_CUP_TEAM_ELO)) {
    if (norm(k) === target) return v;
  }
  return undefined;
}

/** 모든 본선 진출 팀의 시드 Elo. EloTable 인터페이스(ratings + processed) 호환. */
export function buildWorldCupSeedTable(
  teamIdToName: Map<number, string>,
): { ratings: Map<number, number>; processed: number } {
  const ratings = new Map<number, number>();
  for (const [id, name] of teamIdToName.entries()) {
    ratings.set(id, getWorldCupSeedElo(name) ?? 1500);
  }
  return { ratings, processed: 0 };
}

/** 팀 이름 → 조(group letter) 역매핑 */
export function getTeamGroup(teamName: string): string | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[\s.&-]/g, "");
  const target = norm(teamName);
  for (const [g, teams] of Object.entries(WORLD_CUP_GROUPS)) {
    if (teams.some((t) => norm(t) === target)) return g;
  }
  return undefined;
}
