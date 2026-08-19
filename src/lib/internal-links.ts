// 글 본문의 키워드를 사이트 내 페이지 링크로 자동 변환.
//
// 효과:
//  - SEO: 내부 링크는 PageRank 분산 + 사이트 권위 ↑
//  - 사용자: 더 깊이 탐색 (예: 글에서 "월드컵" → 월드컵 페이지)
//  - AI 크롤러: 사이트 구조 학습
//
// 규칙:
//  1) 글당 최대 2개 링크 (스팸 방지)
//  2) 같은 키워드는 첫 등장만 매핑
//  3) 헤딩(#), 이미 [..](..) 링크 안, 인라인 코드(`..`), 코드 블록(```...```) 제외
//  4) 우선순위 — 긴 키워드부터 (예: "FIFA 월드컵" 이 "월드컵" 보다 먼저)

export interface LinkRule {
  keyword: string;
  href: string;
}

// 우선순위 — 더 구체적인(긴) 키워드부터 위에 둔다
const RULES: LinkRule[] = [
  // 월드컵 — 대진표 인텐트는 브래킷 뷰로, 일반 언급은 허브(/world-cup)로 집중 (SEO 링크 집중 2026-07)
  // 주의: "16강 대진표" 같은 무접두 키워드 금지 — UCL·플레이오프 글에서 월드컵으로 오링크된다.
  { keyword: "월드컵 32강 대진표", href: "/world-cup?view=bracket" },
  { keyword: "월드컵 16강 대진표", href: "/world-cup?view=bracket" },
  { keyword: "월드컵 8강 대진표", href: "/world-cup?view=bracket" },
  { keyword: "월드컵 대진표", href: "/world-cup?view=bracket" },
  { keyword: "월드컵 우승 확률", href: "/world-cup?view=predictions" },
  { keyword: "FIFA 월드컵 2026", href: "/world-cup" },
  { keyword: "FIFA 월드컵", href: "/world-cup" },
  { keyword: "북중미 월드컵", href: "/world-cup" },
  { keyword: "2026 월드컵", href: "/world-cup" },
  { keyword: "월드컵", href: "/world-cup" },

  // 축구
  { keyword: "프리미어리그", href: "/leagues/EPL" },
  { keyword: "EPL", href: "/leagues/EPL" },
  { keyword: "라리가", href: "/leagues/LALIGA" },
  { keyword: "La Liga", href: "/leagues/LALIGA" },
  { keyword: "분데스리가", href: "/leagues/BUNDESLIGA" },
  { keyword: "세리에 A", href: "/leagues/SERIE_A" },
  { keyword: "세리에A", href: "/leagues/SERIE_A" },
  { keyword: "리그앙", href: "/leagues/LIGUE_1" },
  { keyword: "리그 1", href: "/leagues/LIGUE_1" },
  { keyword: "MLS", href: "/leagues/MLS" },
  { keyword: "챔피언스리그", href: "/leagues/UCL" },
  { keyword: "UEFA 챔피언스리그", href: "/leagues/UCL" },

  // 농구·야구·하키
  { keyword: "KBO 리그", href: "/leagues/KBO" },
  { keyword: "한국프로야구", href: "/leagues/KBO" },
  { keyword: "KBO", href: "/leagues/KBO" },
  { keyword: "MLB", href: "/leagues/MLB" },
  { keyword: "메이저리그", href: "/leagues/MLB" },
  { keyword: "NBA", href: "/leagues/NBA" },
  { keyword: "NHL", href: "/leagues/NHL" },

  // 예측·통계
  { keyword: "AI 적중률", href: "/predictions/accuracy" },
  { keyword: "적중률 데이터", href: "/predictions/accuracy" },
  { keyword: "예측 대시보드", href: "/predictions" },
  { keyword: "시즌 시뮬레이션", href: "/predictions" },
];

interface AutoLinkOptions {
  maxLinks?: number;
  selfHref?: string;
}

const PH_PREFIX = "__SBLNK_";
const PH_SUFFIX = "_END__";

/**
 * Markdown 텍스트의 키워드를 [키워드](url) 로 자동 변환.
 *
 * 보호 영역 (변환 안 함):
 *   - ```code block```
 *   - `inline code`
 *   - [기존 링크](url)
 *   - 헤딩 (# 시작 줄)
 *   - URL 자체 (https://...)
 */
export function autoLinkInternal(
  markdown: string,
  opts: AutoLinkOptions = {},
): string {
  return applyLinkRules(markdown, RULES, opts);
}

/**
 * 규칙 배열을 받아 같은 보호 규칙으로 링크를 삽입한다.
 * 정적 키워드(RULES)와 글마다 달라지는 팀·선수 엔티티가 같은 치환 로직을 공유하게 하려고
 * autoLinkInternal 에서 추출했다 — 보호 영역·중첩 링크 방지 로직을 두 벌 두지 않기 위함.
 */
export function applyLinkRules(
  markdown: string,
  rules: LinkRule[],
  opts: AutoLinkOptions & { allowKoreanParticle?: boolean } = {},
): string {
  const maxLinks = opts.maxLinks ?? 2;
  const selfHref = opts.selfHref;
  if (maxLinks <= 0) return markdown;

  const placeholders: string[] = [];
  const protect = (re: RegExp, src: string) =>
    src.replace(re, (m) => {
      const i = placeholders.length;
      placeholders.push(m);
      return PH_PREFIX + i + PH_SUFFIX;
    });

  let text = markdown;
  text = protect(/```[\s\S]*?```/g, text); // 코드 블록
  text = protect(/`[^`\n]+`/g, text); // 인라인 코드
  text = protect(/\[[^\]]*\]\([^)]+\)/g, text); // 기존 링크
  text = protect(/^#{1,6}\s.+$/gm, text); // 헤딩 줄
  text = protect(/https?:\/\/\S+/g, text); // 절대 URL

  let inserted = 0;
  const usedKeywords = new Set<string>();
  const usedHrefs = new Set<string>();

  for (const rule of rules) {
    if (inserted >= maxLinks) break;
    if (selfHref && rule.href === selfHref) continue;
    if (usedKeywords.has(rule.keyword)) continue;
    if (usedHrefs.has(rule.href)) continue; // 같은 페이지 링크 중복 방지

    const escaped = rule.keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // 단어 경계 — 한글/영문/숫자 옆에 키워드가 직접 붙어있지 않을 때만
    // 한국어는 이름 뒤에 조사가 붙는다 ("리즈 유나이티드가"). 뒤 경계를 비문자로만 두면
    // 정작 주어로 쓰인 이름이 전부 빠지고 조사 없이 쓰인 부수적 단어만 링크된다(실측 확인).
    // 조사 글자에 한해 뒤 경계를 열어 준다 — 임의 한글을 열면 "리즈사이드" 류가 걸린다.
    const tail = opts.allowKoreanParticle
      ? `(?=[^\\p{L}\\p{N}_]|$|[은는이가을를의에와과도로만])`
      : `(?=[^\\p{L}\\p{N}_]|$)`;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}${tail}`, "u");

    if (!re.test(text)) continue;
    // 삽입 결과를 즉시 placeholder 로 보호 — 뒤 규칙이 새 링크 텍스트 내부를 다시 매칭해
    // 중첩 링크([[월드컵](..) 대진표](..))로 마크다운을 깨는 것 방지.
    text = text.replace(re, (_full, prefix) => {
      const i = placeholders.length;
      placeholders.push(`[${rule.keyword}](${rule.href})`);
      return `${prefix}${PH_PREFIX}${i}${PH_SUFFIX}`;
    });
    inserted++;
    usedKeywords.add(rule.keyword);
    usedHrefs.add(rule.href);
  }

  // placeholder 복원
  const restoreRe = new RegExp(PH_PREFIX + "(\\d+)" + PH_SUFFIX, "g");
  text = text.replace(restoreRe, (_m, idx) => placeholders[Number(idx)]);
  return text;
}
