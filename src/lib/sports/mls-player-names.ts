// MLS 선수 영문 → 한글 매핑 (시즌 리더보드용).
// API-Football 응답이 "L. Messi" 식 약어 또는 풀네임 혼합.

export const MLS_PLAYER_NAMES_KO: Record<string, string> = {
  // ===== 슈퍼스타 — 풀네임으로 한글화 =====
  "L. Messi": "리오넬 메시",
  "W. Zaha": "윌프리드 자하",

  // ===== 약어 형식 =====
  "A. Dreyer": "A. 드라이어",
  "A. Westwood": "A. 웨스트우드",
  "B. Vera": "B. 베라",
  "C. Durkin": "C. 더킨",
  "C. Espinoza": "C. 에스피노사",
  "E. Alladoh": "E. 알라도",
  "H. Cuypers": "H. 카위퍼스",
  "H. Ojediran": "H. 오제디란",
  "J. Atencio": "J. 아텐시오",
  "J. Fory": "J. 포리",
  "J. Hall": "J. 홀",
  "J. Sery Larsen": "J. 세리 라르센",
  "J. Travis": "J. 트래비스",
  "L. Langoni": "L. 란고니",
  "M. Crépeau": "M. 크레포",
  "M. Duah": "M. 두아",
  "M. Ingvartsen": "M. 인그바르첸",
  "M. Moralez": "M. 모랄레스",
  "M. Ojeda": "M. 오헤다",
  "N. Fernández Mercau": "N. 페르난데스 메르카우",
  "P. Judd": "P. 저드",
  "P. Musa": "P. 무사",
  "P. Owusu": "P. 오우수",
  "S. Surridge": "S. 서리지",
  "T. D'Avilla": "T. 다비야",
  "T. D&apos;Avilla": "T. 다비야",
  "T. Segovia": "T. 세고비아",
  "Y. Bright": "Y. 브라이트",

  // ===== 풀네임 (외국 용병 / 라틴 선수) =====
  "Bryan Josías Ramírez León": "브라이언 호시아스 라미레스 레온",
  "Felipe Andrade": "펠리피 안드라지",
  "Guilherme Biro": "길레르미 비루",
  "Pep Biel": "페프 비엘",
  "Rafael Navarro": "하파에우 나바루",
};
