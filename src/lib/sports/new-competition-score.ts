// 신규 대회 후보 점수 — 우리에게 아직 없는 대회 중 무엇부터 넣을지 정한다(순수 함수, 2026-10-03).
// 우선순위(사용자 기본값): 한국 관련(대표팀·K리그 팀·해외파 소속팀) > 성인 국가대표 대회 > 경기 수.
// 유소년·여자·2군·풋살은 한국이 관련될 때만 후보에 올린다.

export interface CompetitionCandidate {
  source: "af" | "ts";
  id: string;
  name: string;
  country: string;
  matches: number;
  /** 한국 관련 근거 — "대표팀 South Korea U20", "해외파 백승호(Birmingham)" 등 */
  korea: string[];
  /** 대표팀끼리 붙는 대회로 보이는가 */
  national: boolean;
}

const MINOR = /\bU-?\d{2}W?\b|under[- ]?\d{2}|\bwomen\b|women's|\bfemen|f[ée]minin|frauen|damallsvenskan|\bwsl\b|\byouth\b|reserve|primavera|\bjunior|amateur|regional|futsal|beach|\b(ii|b)$|\bnext pro\b/i;

export function isMinorCompetition(name: string): boolean {
  return MINOR.test(name);
}

export function scoreCandidate(c: CompetitionCandidate): number {
  const minor = isMinorCompetition(c.name);
  if (minor && c.korea.length === 0) return -1; // 후보에서 뺀다
  let s = Math.min(c.matches, 50);
  if (c.national) s += 200;
  if (c.korea.length) s += 1000 + c.korea.length * 50;
  if (minor) s -= 300; // 한국 관련이라도 성인 대회보다는 뒤
  return s;
}

/** 점수순 정렬 + 제외(-1) 제거. 한국 관련은 전부, 나머지는 top 개만. */
export function rankCandidates(list: CompetitionCandidate[], top = 5): Array<CompetitionCandidate & { score: number }> {
  const scored = list.map((c) => ({ ...c, score: scoreCandidate(c) })).filter((c) => c.score >= 0).sort((a, b) => b.score - a.score);
  const korea = scored.filter((c) => c.korea.length > 0);
  const rest = scored.filter((c) => c.korea.length === 0).slice(0, top);
  return [...korea, ...rest];
}
