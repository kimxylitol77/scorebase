// 일본어 카나(히라가나/가타카나) → 한글 음역.
//
// 표기 방침 — **통용 표기**(어두에서도 격음: 타나카·카토·츠요시).
//   외래어 표기법은 어두 평음(다나카·가토)이지만, 스포츠 중계·기사와 우리 선수 사전(haiku 음역)이
//   모두 격음을 쓰므로 사이트 표기를 그쪽에 맞춘다 (2026-07-21 사용자 결정).
// 촉음(っ/ッ) 은 직전 음에 'ㅅ' 받침으로 단순화 (홋카이도 식).
// 장음(ー) 은 생략.

// 기본 1글자 매핑 (히라가나 기준 — 가타카나는 0x60 빼서 정규화).
const MONO: Record<string, string> = {
  あ: "아", い: "이", う: "우", え: "에", お: "오",
  か: "카", き: "키", く: "쿠", け: "케", こ: "코",
  が: "가", ぎ: "기", ぐ: "구", げ: "게", ご: "고",
  さ: "사", し: "시", す: "스", せ: "세", そ: "소",
  ざ: "자", じ: "지", ず: "즈", ぜ: "제", ぞ: "조",
  た: "타", ち: "치", つ: "츠", て: "테", と: "토",
  だ: "다", ぢ: "지", づ: "즈", で: "데", ど: "도",
  な: "나", に: "니", ぬ: "누", ね: "네", の: "노",
  は: "하", ひ: "히", ふ: "후", へ: "헤", ほ: "호",
  ば: "바", び: "비", ぶ: "부", べ: "베", ぼ: "보",
  ぱ: "파", ぴ: "피", ぷ: "푸", ぺ: "페", ぽ: "포",
  ま: "마", み: "미", む: "무", め: "메", も: "모",
  や: "야", ゆ: "유", よ: "요",
  ら: "라", り: "리", る: "루", れ: "레", ろ: "로",
  わ: "와", ゐ: "이", ゑ: "에", を: "오",
  ん: "ㄴ",
  ゔ: "부",
};

// yōon (작은 글자 결합) — 한 글자처럼 처리.
const YOON: Record<string, string> = {
  きゃ: "캬", きゅ: "큐", きょ: "쿄",
  ぎゃ: "갸", ぎゅ: "규", ぎょ: "교",
  しゃ: "샤", しゅ: "슈", しょ: "쇼", しぇ: "셰",
  じゃ: "자", じゅ: "주", じょ: "조", じぇ: "제",
  ちゃ: "차", ちゅ: "추", ちょ: "초", ちぇ: "체",
  にゃ: "냐", にゅ: "뉴", にょ: "뇨",
  ひゃ: "햐", ひゅ: "휴", ひょ: "효",
  びゃ: "뱌", びゅ: "뷰", びょ: "뵤",
  ぴゃ: "퍄", ぴゅ: "퓨", ぴょ: "표",
  みゃ: "먀", みゅ: "뮤", みょ: "묘",
  りゃ: "랴", りゅ: "류", りょ: "료",
  ふぁ: "파", ふぃ: "피", ふぇ: "페", ふぉ: "포",
  ヴァ: "바", ヴィ: "비", ヴェ: "베", ヴォ: "보",
  // 외래어 합성 카나 — wi/we/wo/swe/twi 등 (Whitley → ウィットリー → 휘틀리 등)
  うぁ: "와", うぃ: "위", うぇ: "웨", うぉ: "워",
  くぁ: "콰", くぃ: "퀴", くぇ: "퀘", くぉ: "쿼",
  ぐぁ: "과", ぐぃ: "귀", ぐぇ: "궤", ぐぉ: "궈",
  すぃ: "시", ずぃ: "지",
  てぃ: "티", でぃ: "디", とぅ: "투", どぅ: "두",
  いぇ: "예",
};
function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  );
}

/**
 * 일본어 카나 → 한글 음역 (간이).
 *  - か/た 행은 위치와 무관하게 격음 (타나카·카토·츠요시) — 통용 표기
 *  - 촉음 っ → 'ㅅ' 받침 (직전 한글 종성에 결합)
 */
export function kanaToKorean(input: string): string {
  if (!input) return "";
  // 가타카나 → 히라가나, 장음 제거
  const s = kataToHira(input).replace(/ー/g, "");
  // ・ → 단어 구분 (성/이름 separator)
  const tokens = s.split(/[・\s　]+/).filter(Boolean);
  const out = tokens.map(translateToken).join(" ");
  // 부분 변환 실패 — 결과에 일본 카나 잔존 시 원문 반환 (깨진 표시 방지).
  if (/[぀-ゟ゠-ヿ]/.test(out)) return input;
  return out;
}

function translateToken(token: string): string {
  let out = "";
  let i = 0;
  while (i < token.length) {
    const ch = token[i];
    const pair = token.slice(i, i + 2);
    // yōon
    if (YOON[pair]) {
      out += YOON[pair];
      i += 2;
      continue;
    }
    // 촉음 → 직전 한글에 ㅅ 받침 (홋카이도 식)
    if (ch === "っ") {
      out = appendBatchim(out, "ㅅ");
      i += 1;
      continue;
    }
    // ん → 직전 한글에 ㄴ 받침 결합. 직전 음절이 없거나 받침 이미 있으면 "ㄴ" 단독.
    if (ch === "ん") {
      out = appendBatchim(out, "ㄴ");
      i += 1;
      continue;
    }
    out += MONO[ch] ?? ch;
    i += 1;
  }
  // 장음 후처리 (한국 외래어 표기법 — 일본어 장음 う/い 생략):
  //   お단 + う = 장음 (도우 → 도, 쇼우 → 쇼, 쿄우 → 쿄)
  //   う단 + う = 장음 (쿠우 → 쿠)
  //   え단 + い 는 한국 표기 관행상 살리는 경우도 많아 보존 (쇼세이/사이토 등).
  out = out.replace(
    /(고|노|도|로|모|보|소|토|호|조|코|포|쇼|료|쿄|교|뇨|효|묘|뵤|초|쵸|쥬|주|랴|먀|뱌|규|큐|류|뉴|류|퓨|뷰|휴)우/g,
    "$1",
  );
  out = out.replace(/(쿠|구|수|즈|투|두|누|루|무|푸|부|유|츠)우/g, "$1");
  return out;
}

/**
 * 마지막 한글 음절에 종성(받침)을 추가. 한글 음절 = (초성 × 588) + (중성 × 28) + 종성.
 * 종성이 이미 있으면 fallback 으로 종성 글자를 그대로 append.
 */
function appendBatchim(s: string, jong: "ㅅ" | "ㄴ"): string {
  // 0=none, 1=ㄱ, 2=ㄲ, 3=ㄳ, 4=ㄴ, 5=ㄵ, 6=ㄶ, 7=ㄷ, 8=ㄹ, 9=ㄺ, 10=ㄻ,
  // 11=ㄼ, 12=ㄽ, 13=ㄾ, 14=ㄿ, 15=ㅀ, 16=ㅁ, 17=ㅂ, 18=ㅄ, 19=ㅅ, 20=ㅆ, ...
  const JONG_IDX: Record<string, number> = { ㄴ: 4, ㅅ: 19 };
  if (!s) return jong; // 직전 글자 없으면 종성 자체를 단독 출력
  const lastChar = s[s.length - 1];
  const code = lastChar.charCodeAt(0);
  const SBase = 0xac00; // 가
  const SEnd = 0xd7a3;
  if (code < SBase || code > SEnd) return s + jong;
  const idx = code - SBase;
  const jongIdx = idx % 28;
  if (jongIdx !== 0) return s + jong; // 이미 종성 있음 — fallback
  const newCode = code + JONG_IDX[jong];
  return s.slice(0, -1) + String.fromCharCode(newCode);
}
