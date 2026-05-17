// NPB 12팀 한글 풀네임 → 약자(shortName) 매핑.
// 매치 카드 좁은 칸에 KBO(LG/두산 등)와 비슷한 2~4자 형태로 노출.
// 한국 스포츠 미디어 통용 표기 (네이버 스포츠 / KBS 기준).

export const NPB_TEAM_SHORT_NAMES: Record<string, string> = {
  "도쿄 야쿠르트 스왈로스": "야쿠르트",
  "도호쿠 라쿠텐 골든이글스": "라쿠텐",
  "사이타마 세이부 라이온스": "세이부",
  "오릭스 버팔로스": "오릭스",
  "요미우리 자이언츠": "요미우리",
  "요코하마 디엔에이 베이스타스": "요코하마",
  "주니치 드래곤스": "주니치",
  "지바 롯데 마린스": "지바롯데",
  "한신 타이거스": "한신",
  "홋카이도 닛폰햄 파이터즈": "닛폰햄",
  "후쿠오카 소프트뱅크 호크스": "소프트뱅크",
  "히로시마 도요 카프": "히로시마",
};

/**
 * NPB 팀 한글 풀네임 → 약자. 매핑 없으면 첫 단어 (4자 cap) fallback.
 */
export function npbTeamShortName(fullName: string): string {
  if (!fullName) return "";
  const trimmed = fullName.trim();
  if (NPB_TEAM_SHORT_NAMES[trimmed]) return NPB_TEAM_SHORT_NAMES[trimmed];
  // fallback — 한글 첫 단어 (4자 cap)
  const first = trimmed.split(/\s+/)[0];
  return first.length > 4 ? first.slice(0, 4) : first;
}
