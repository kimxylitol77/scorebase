// 봇 발행 글의 한국어 순도 게이트 — 로컬 qwen 이 중국어·일본어로 새어 나온 글을 저장 단계에서 거부한다.
// 프롬프트 "한글로만" 규칙만으론 샌다(2026-09-10 풋볼픽스터 #3678 전문 중국어·#3400 절반 중국어 실측).
// 크롤러(맥미니)와 서버 저장 양쪽이 같은 판정을 쓰도록 여기 한 곳에 둔다.

const KANA = /[぀-ヿ]/;
const IDEOGRAPH = /[一-鿿]/g;
/** 한국어 기사 관용 한자 — "토트넘行"·"甲" 처럼 낱글자로만 쓰인다. 두 글자 이상 이어지면 중국어로 본다. */
const IDEOGRAPH_RUN = /[一-鿿]{2,}/;
const HANGUL = /[가-힣]/g;
const LATIN = /[A-Za-z]/g;

/** 통과 = null, 거부 = 사유. 제목·본문을 합쳐 한 번에 넣는다. */
export function foreignScriptReason(text: string): string | null {
  if (KANA.test(text)) return "일본어 가나 포함";
  const runs = text.match(IDEOGRAPH_RUN);
  if (runs) return `한자 연속 "${runs[0].slice(0, 6)}"`;
  const ideographs = (text.match(IDEOGRAPH) ?? []).length;
  if (ideographs >= 3) return `한자 ${ideographs}자`;
  const hangul = (text.match(HANGUL) ?? []).length;
  const latin = (text.match(LATIN) ?? []).length;
  const letters = hangul + latin + ideographs;
  // 영문 약어(EPL·MLB·AI)는 허용하되 글 대부분이 비한글이면 거부. 짧은 문자열(제목만)은 비율을 묻지 않는다.
  if (letters >= 40 && hangul / letters < 0.6) return `한글 비율 ${Math.round((hangul / letters) * 100)}%`;
  return null;
}
