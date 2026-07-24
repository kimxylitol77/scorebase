// 골프 대회명 한글 표기 — 메이저 우선, 나머지는 스폰서 수식어를 걷어낸 축약.
// 한국 선수 트래커(/golf/korea)의 최근 성적 칩이 영문으로 잘려 나오던 문제 대응.

// 메이저 9개(남 4·여 5) + 국내 인지도 높은 대회는 정식 한글명.
const EXACT: Record<string, string> = {
  // 남자 메이저
  "Masters Tournament": "마스터스",
  "PGA Championship": "PGA 챔피언십",
  "U.S. Open": "US 오픈",
  "The Open": "디 오픈",
  // 여자 메이저
  "The Chevron Championship": "셰브론 챔피언십",
  "U.S. Women's Open pres. by Ally": "US 여자 오픈",
  "KPMG Women's PGA Championship": "KPMG 여자 PGA",
  "The Amundi Evian Championship": "에비앙 챔피언십",
  "AIG Women's Open": "AIG 여자 오픈",
  // 준메이저·인지도 대회
  "THE PLAYERS Championship": "플레이어스",
  "Genesis Scottish Open": "제네시스 스코티시 오픈",
  "THE CJ CUP Byron Nelson": "CJ컵 바이런 넬슨",
  "the Memorial Tournament pres. by Workday": "메모리얼 토너먼트",
  "Travelers Championship": "트래블러스",
  "RBC Canadian Open": "RBC 캐나디안 오픈",
  "WM Phoenix Open": "WM 피닉스 오픈",
  "Sony Open in Hawaii": "소니 오픈",
  "Farmers Insurance Open": "파머스 인슈어런스",
  "The American Express": "아메리칸 익스프레스",
  "Valspar Championship": "발스파 챔피언십",
  "Valero Texas Open": "발레로 텍사스 오픈",
  "John Deere Classic": "존 디어 클래식",
  "Mizuho Americas Open": "미즈노 아메리카스 오픈",
  "Meijer LPGA Classic for Simply Give": "마이어 LPGA 클래식",
  "JM Eagle LA Championship pres. by Plastpro": "JM 이글 LA 챔피언십",
  "ShopRite LPGA Classic powered by Wakefern": "숍라이트 LPGA 클래식",
  "Kroger Queen City Championship pres by P&G": "크로거 퀸시티",
  "Ford Championship pres. by Wild Horse Pass": "포드 챔피언십",
  "Fortinet Founders Cup": "포티넷 파운더스컵",
};

/** 대회명 한글 표기 — 매핑 없으면 스폰서 수식어("pres. by …" 등)만 제거해 축약. */
export function golfEventKo(name: string): string {
  const hit = EXACT[name];
  if (hit) return hit;
  return name
    .replace(/\s+(pres\.?|presented)\s+by\s+.*$/i, "")
    .replace(/\s+powered\s+by\s+.*$/i, "")
    .replace(/^the\s+/i, "")
    .trim();
}
