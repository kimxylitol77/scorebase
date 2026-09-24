// 아시안게임 축구 허브 규칙 — ts 조 번호→공식 조 글자, 진행 단계(조별 1~3R → 8강 → 4강 → 결승), 국가명 정리.
// 공식(위키·중앙일보 2026-09-25 확인): 남자 U-23 A~D조(D조 3팀) 조 1·2위 8강, 여자 E~G조 조 1·2위 + 3위 중 상위 2팀 8강.
// ts 조 번호는 남자 1~4·여자 5~7 로 이어 붙어 있어 A부터 세면 공식 글자와 같다(0 은 여자 3위 비교표). prisma 없음(테스트용).

/** 진행 트랙 칸 — 조별 3라운드 + 8강·4강·결승(3·4위전 포함) */
export const ASIAN_GAMES_STAGES = ["조별 1R", "조별 2R", "조별 3R", "8강", "4강", "결승"] as const;

/** ts 조 번호(1~7) → 공식 조 글자. 조가 아닌 표(0 = 3위 비교)는 null. */
export function asianGamesGroupLetter(groupNum: number): string | null {
  return Number.isInteger(groupNum) && groupNum >= 1 && groupNum <= 26 ? String.fromCharCode(64 + groupNum) : null;
}

/** ts 단계 이름·라운드 → 트랙 칸(1부터). 모르는 단계면 null. */
export function asianGamesStageIndex(stageName: string, roundNum: number): number | null {
  const s = stageName.trim().toLowerCase();
  if (s === "group stage") return roundNum >= 1 && roundNum <= 3 ? roundNum : null;
  if (/^quarter-?finals?$/.test(s)) return 4;
  if (/^semi-?finals?$/.test(s)) return 5;
  if (/^(the )?final$|3rd place|third place|bronze/.test(s)) return 6;
  return null;
}

/** "South Korea U23"·"South Korea Women"·"China Hong Kong Women" → A대표 기준 국가명(국기·순위 조회용). */
export function asianGamesNation(teamName: string): string {
  return teamName
    .replace(/\s+(U-?23|Women)$/i, "")
    .replace(/^China Hong Kong$/, "Hong Kong")
    .trim();
}
