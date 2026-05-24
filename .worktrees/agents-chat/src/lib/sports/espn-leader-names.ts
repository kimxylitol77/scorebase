// ESPN match summary 의 teamLeaders 영문(shortName/displayName) → 한글 매핑.
// ESPN 응답의 athlete.shortName 은 "L. Messi" 형태, displayName 은 "Lionel Messi" 풀네임.
// 자주 누락되는 선수를 누적 — 빈도 높은 EPL/LALIGA/CL 스타 + 사용자 보고된 매치 stats 선수.

export const ESPN_LEADER_NAMES_KO: Record<string, string> = {
  // ===== shortName 형식 =====
  "L. Valencia": "L. 발렌시아",
  "G. Bochecha": "G. 보셰샤",
  "D. Cavalieri": "D. 카발리에리",
  "G. Scarpa": "G. 스카르파",

  // ===== displayName 풀네임 =====
  "Bruno Henrique": "브루누 엔히키",
  "Lúcio Valencia": "L. 발렌시아",
  "Gabriel Bochecha": "G. 보셰샤",
  "Diego Cavalieri": "D. 카발리에리",
  "Gustavo Scarpa": "G. 스카르파",
};
