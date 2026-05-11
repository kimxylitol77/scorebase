// LCK 한국 슈퍼스타 매핑 — MVP/LVP 카드 한국명 표기, Quote 자동 생성 우선순위, Season star_player_stat 등에 활용.
// 시즌별로 팀 이동 가능 — 가끔 업데이트 필요.

export interface KoreanStar {
  nickname: string; // BDL 응답 그대로 (예: "Faker")
  koreanName: string; // 한국 닉네임 (예: "페이커")
  realName: string; // 본명 (예: "이상혁")
  team: string; // 영문 팀명 (예: "T1")
  role: "TOP" | "JGL" | "MID" | "ADC" | "SUP";
}

export const KOREAN_STARS: Record<string, KoreanStar> = {
  // T1
  faker:     { nickname: "Faker",     koreanName: "페이커",   realName: "이상혁", team: "T1",         role: "MID" },
  keria:     { nickname: "Keria",     koreanName: "케리아",   realName: "류민석", team: "T1",         role: "SUP" },
  gumayusi:  { nickname: "Gumayusi",  koreanName: "구마유시", realName: "이민형", team: "T1",         role: "ADC" },
  oner:      { nickname: "Oner",      koreanName: "오너",     realName: "문현준", team: "T1",         role: "JGL" },
  doran:     { nickname: "Doran",     koreanName: "도란",     realName: "최현준", team: "T1",         role: "TOP" },
  peyz:      { nickname: "Peyz",      koreanName: "페이즈",   realName: "김수환", team: "T1",         role: "ADC" },
  // Gen.G
  chovy:     { nickname: "Chovy",     koreanName: "쵸비",     realName: "정지훈", team: "Gen.G",      role: "MID" },
  canyon:    { nickname: "Canyon",    koreanName: "캐니언",   realName: "김건부", team: "Gen.G",      role: "JGL" },
  kiin:      { nickname: "Kiin",      koreanName: "기인",     realName: "김기인", team: "Gen.G",      role: "TOP" },
  ruler:     { nickname: "Ruler",     koreanName: "룰러",     realName: "박재혁", team: "Gen.G",      role: "ADC" },
  duro:      { nickname: "Duro",      koreanName: "두로",     realName: "주민규", team: "Gen.G",      role: "SUP" },
  // Hanwha Life Esports
  zeus:      { nickname: "Zeus",      koreanName: "제우스",   realName: "최우제", team: "Hanwha Life Esports", role: "TOP" },
  peanut:    { nickname: "Peanut",    koreanName: "피넛",     realName: "한왕호", team: "Hanwha Life Esports", role: "JGL" },
  zeka:      { nickname: "Zeka",      koreanName: "제카",     realName: "김건우", team: "Hanwha Life Esports", role: "MID" },
  viper:     { nickname: "Viper",     koreanName: "바이퍼",   realName: "박도현", team: "Hanwha Life Esports", role: "ADC" },
  delight:   { nickname: "Delight",   koreanName: "딜라이트", realName: "유환중", team: "Hanwha Life Esports", role: "SUP" },
  // KT Rolster
  perfect:   { nickname: "PerfecT",   koreanName: "퍼펙트",   realName: "이승민", team: "KT Rolster", role: "TOP" },
  cuzz:      { nickname: "Cuzz",      koreanName: "커즈",     realName: "문우찬", team: "KT Rolster", role: "JGL" },
  bdd:       { nickname: "Bdd",       koreanName: "비디디",   realName: "곽보성", team: "KT Rolster", role: "MID" },
  // Dplus KIA
  showmaker: { nickname: "ShowMaker", koreanName: "쇼메이커", realName: "허수",   team: "Dplus KIA",  role: "MID" },
  kingen:    { nickname: "Kingen",    koreanName: "킹겐",     realName: "황성훈", team: "Dplus KIA",  role: "TOP" },
  lucid:     { nickname: "Lucid",     koreanName: "루시드",   realName: "최용혁", team: "Dplus KIA",  role: "JGL" },
  // DRX
  rascal:    { nickname: "Rascal",    koreanName: "라스칼",   realName: "김광희", team: "DRX",        role: "TOP" },
  // Nongshim
  scout:     { nickname: "Scout",     koreanName: "스카웃",   realName: "이예찬", team: "Nongshim RedForce", role: "MID" },
  sponge:    { nickname: "Sponge",    koreanName: "스폰지",   realName: "이재훈", team: "Nongshim RedForce", role: "JGL" },
};

export function getKoreanStarBy(nickname: string): KoreanStar | undefined {
  if (!nickname) return undefined;
  return KOREAN_STARS[nickname.toLowerCase()];
}

export function isKoreanStar(nickname: string): boolean {
  return Boolean(getKoreanStarBy(nickname));
}
