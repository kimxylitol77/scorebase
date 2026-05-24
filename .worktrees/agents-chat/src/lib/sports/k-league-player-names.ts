// K리그1·K리그2 선수 영문(API-Football roman) → 한글 표기 매핑.
// API-Football 의 player.name 은 한국 선수 = "Lee Ho-Jae" (성-이름-하이픈) 형식,
// 외국 용병 = 원국어 음역 ("Juan Fernández" 등). 매핑 누락 시 원문 그대로.
//
// 신규 선수 등장 시: API-Football 응답값을 key 로 추가.

export const K_LEAGUE_PLAYER_NAMES_KO: Record<string, string> = {
  // ===== K리그1 한국 선수 =====
  "Cho Wi-Je": "조위제",
  "Go Jae-Hyeon": "고재현",
  "Jeon Min-Gwang": "전민광",
  "Jo Seong-Kwon": "조성권",
  "Kim Jae-Woo": "김재우",
  "Kim Jin-Ho": "김진호",
  "Kim Jung-Hyun": "김정현",
  "Kwon Kyung-Won": "권경원",
  "Lee Chang-Yong": "이창용",
  "Lee Dong-Gyeong": "이동경",
  "Lee Gyu-Sung": "이규성",
  "Lee Ho-Jae": "이호재",
  "Lee Kun-Hee": "이근희",
  "Lee Sang-Heon": "이상헌",
  "Lee Seung-Mo": "이승모",
  "Lee Seung-Woo": "이승우",
  "Lee You-Hyeon": "이유현",
  "Maeng Seong-Ung": "맹성웅",
  "Mo Jae-Hyeon": "모재현",
  "Park Chan-Yong": "박찬용",
  "Song Jun-Seok": "송준석",

  // ===== K리그1 외국 용병 =====
  "A. Halaihal": "A. 할라이할",
  "Airton": "아이르통",
  "Diogo de Oliveira": "지오구 데 올리베이라",
  "H. Friðjónsson": "H. 프리드욘손",
  "Italo Moreira": "이탈루 모레이라",
  "J. Montaño": "J. 몬타뇨",
  "Juan Fernández": "후안 페르난데스",
  "Juninho Rocha": "주니뉴 호샤",
  "P. Klimala": "P. 클리말라",
  "Rodrigo Bassani": "호드리고 바사니",
  "S. Mugoša": "S. 무고샤",
  "Yago Cariello": "야고 카리엘로",
  "Yazan Al Arab": "야잔 알 아랍",

  // ===== K리그2 한국 선수 (API-Football 응답이 이름-성 역순으로 오는 경우 포함) =====
  "Hye-seong Kim": "김혜성",
  "Jae-jun You": "유재준",
  "Min-Sung Kim": "김민성",
  "Min-seung Kim": "김민승",
  "Seung-ik Roh": "노승익",
};

/**
 * K리그 선수 영문명을 한글 표기로 변환. 매핑 누락 시 원문 그대로 반환.
 */
export function kLeaguePlayerToKorean(name: string): string {
  if (!name) return name;
  return K_LEAGUE_PLAYER_NAMES_KO[name.trim()] ?? name;
}
