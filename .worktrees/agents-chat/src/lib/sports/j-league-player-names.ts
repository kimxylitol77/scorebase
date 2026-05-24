// J1리그·J2리그 선수 영문(API-Football roman) → 한글 표기 매핑.
// API-Football 의 player.name 은 일본 선수 = "T. Kubo" 식 약어가 다수,
// 외국 용병 = 원국어 음역. 매핑 누락 시 원문 그대로.
//
// 신규 선수 등장 시: API-Football 응답값을 key 로 추가.

export const J_LEAGUE_PLAYER_NAMES_KO: Record<string, string> = {
  // ===== J1리그 일본 선수 (약어 형식 — Initial. Surname) =====
  "A. Esaka": "A. 에사카",
  "A. Suzuki": "A. 스즈키",
  "D. Hümmet": "D. 휴멧",
  "H. Sugai": "H. 스가이",
  "J. Sumiyoshi": "J. 스미요시",
  "K. Hashimoto": "K. 하시모토",
  "K. Misao": "K. 미사오",
  "K. Nakayama": "K. 나카야마",
  "K. Sato": "K. 사토",
  "K. Tanimura": "K. 다니무라",
  "M. Shibayama": "M. 시바야마",
  "M. Shigemi": "M. 시게미",
  "S. Nago": "S. 나고",
  "S. Omori": "S. 오모리",
  "T. Kubo": "T. 쿠보",
  "T. Miki": "T. 미키",
  "T. Ushizawa": "T. 우시자와",
  "T. Yamakawa": "T. 야마카와",
  "W. Harada": "W. 하라다",
  "Y. Arai": "Y. 아라이",
  "Y. Ideguchi": "Y. 이데구치",
  "Y. Kimura": "Y. 기무라",
  "Y. Suzuki": "Y. 스즈키",
  "Y. Wakizaka": "Y. 와키자카",
  "Y. Yamagishi": "Y. 야마기시",

  // ===== J1리그 한국 선수 =====
  "Oh Se-Hun": "오세훈",

  // ===== J1리그 외국 용병 =====
  "Danilo Cardoso": "다닐로 카르도주",
  "Erik": "에리크",
  "Erison": "에리손",
  "Henrique Trevisan": "엔히키 트레비잔",
  "J. Croux": "J. 크룩스",
  "J. Quiñónes": "J. 키뇨네스",
  "Léo Ceará": "레오 세아라",
  "Marcelo Ryan": "마르셀로 라이언",
  "Matheus Jesus": "마테우스 제수스",
  "Matheus Sávio": "마테우스 사비우",
  "Thiago Santana": "치아구 산타나",

  // ===== J2리그 일본 선수 (풀네임) =====
  "Haruka Suzuki": "하루카 스즈키",
  "Taro Kagawa": "다로 가가와",
};

/**
 * J리그 선수 영문명을 한글 표기로 변환. 매핑 누락 시 원문 그대로 반환.
 */
export function jLeaguePlayerToKorean(name: string): string {
  if (!name) return name;
  return J_LEAGUE_PLAYER_NAMES_KO[name.trim()] ?? name;
}
