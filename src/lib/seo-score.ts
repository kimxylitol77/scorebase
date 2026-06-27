// 블로그 글 온페이지 SEO 점수 산정 — seo-blog-post 체크리스트 기반 규칙 점수(0~100).
// 외부 API 없이 content/메타만으로 즉시 채점하고, 항목별 통과/실패와 개선 포인트를 반환한다.
// HTML·Markdown 본문 모두 대응.

export interface SeoCheck {
  key: string;
  label: string;
  pass: boolean;
  weight: number;
  /** 현재 상태/개선 포인트 한 줄 */
  detail: string;
}

export interface SeoScore {
  score: number; // 0~100 (가중 합)
  grade: "A" | "B" | "C" | "D";
  checks: SeoCheck[];
  /** 주 키워드(첫 태그) */
  keyword: string | null;
  /** 가시 텍스트 글자 수(공백 제외) */
  charCount: number;
}

interface BlogLike {
  title: string;
  excerpt: string | null;
  content: string;
  tags: string | null;
  thumbnailUrl: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** <script>·<style> 제거 후 태그 제거 → 가시 텍스트 */
function visibleText(content: string): string {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // MD 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // MD 링크 → 텍스트
    .replace(/[#>*`_~]/g, " ");
}

function countH2(content: string): number {
  const html = (content.match(/<h2[\s>]/gi) || []).length;
  const md = (content.match(/(^|\n)##\s+\S/g) || []).length;
  return html + md;
}

/** 모든 링크 href 추출 (HTML <a> + MD []()) */
function extractHrefs(content: string): string[] {
  const hrefs: string[] = [];
  for (const m of content.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)) hrefs.push(m[1]);
  for (const m of content.matchAll(/\[[^\]]+\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g)) hrefs.push(m[1]);
  return hrefs;
}

function isInternal(href: string): boolean {
  if (href.startsWith("/")) return true;
  return /^https?:\/\/(www\.)?scorebase\.kr/i.test(href);
}

/** 이미지 추출 — {hasAlt} 목록 */
function extractImages(content: string): { count: number; withAlt: number } {
  let count = 0;
  let withAlt = 0;
  for (const m of content.matchAll(/<img\s+[^>]*>/gi)) {
    count++;
    const alt = m[0].match(/alt=["']([^"']*)["']/i);
    if (alt && alt[1].trim().length > 1) withAlt++;
  }
  for (const m of content.matchAll(/!\[([^\]]*)\]\([^)]*\)/g)) {
    count++;
    if (m[1].trim().length > 1) withAlt++;
  }
  return { count, withAlt };
}

/** 첫 문단(또는 앞부분) 텍스트 */
function firstParagraph(content: string): string {
  const p = content.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const raw = p ? p[1] : visibleText(content);
  return raw.replace(/<[^>]+>/g, "").trim();
}

export function scoreBlogPost(post: BlogLike): SeoScore {
  const keyword = post.tags ? (post.tags.split(",")[0]?.trim() || null) : null;
  const kw = keyword ? norm(keyword) : null;
  const vis = visibleText(post.content).replace(/\s+/g, " ").trim();
  const charCount = vis.replace(/\s/g, "").length;
  const h2 = countH2(post.content);
  const hrefs = extractHrefs(post.content);
  const internal = hrefs.filter(isInternal).length;
  const external = hrefs.filter((h) => !isInternal(h)).length;
  const img = extractImages(post.content);
  const tagCount = post.tags ? post.tags.split(",").map((s) => s.trim()).filter(Boolean).length : 0;
  const excerptLen = post.excerpt?.trim().length ?? 0;
  const firstPara = firstParagraph(post.content).slice(0, 100);
  const faqSchema = /"@type"\s*:\s*"FAQPage"/i.test(post.content);

  const checks: SeoCheck[] = [
    {
      key: "title",
      label: "제목 — 60자 이내 + 키워드 포함",
      weight: 12,
      pass: post.title.length <= 60 && !!kw && norm(post.title).includes(kw),
      detail:
        `${post.title.length}자` +
        (kw ? (norm(post.title).includes(kw) ? " · 키워드 포함" : " · 키워드 누락") : " · 태그 없음") +
        (post.title.length > 60 ? " · 너무 김" : ""),
    },
    {
      key: "desc",
      label: "메타 설명(excerpt) — 80~160자 + 키워드",
      weight: 12,
      pass: excerptLen >= 80 && excerptLen <= 165 && !!kw && norm(post.excerpt ?? "").includes(kw),
      detail: excerptLen === 0
        ? "설명 없음"
        : `${excerptLen}자` + (kw && norm(post.excerpt ?? "").includes(kw) ? " · 키워드 포함" : " · 키워드 누락"),
    },
    {
      key: "length",
      label: "본문 분량 — 2,500자 이상(공백 제외)",
      weight: 14,
      pass: charCount >= 2500,
      detail: `${charCount.toLocaleString()}자` + (charCount < 2500 ? " · 부족" : ""),
    },
    {
      key: "h2",
      label: "소제목(H2) — 6개 이상",
      weight: 10,
      pass: h2 >= 6,
      detail: `${h2}개`,
    },
    {
      key: "firstKw",
      label: "첫 문단 앞 100자에 키워드",
      weight: 8,
      pass: !!kw && norm(firstPara).includes(kw),
      detail: kw ? (norm(firstPara).includes(kw) ? "포함" : "누락") : "태그 없음",
    },
    {
      key: "internal",
      label: "내부 링크 — 2개 이상",
      weight: 10,
      pass: internal >= 2,
      detail: `${internal}개`,
    },
    {
      key: "external",
      label: "외부 링크 — 1개 이상(권위 출처)",
      weight: 8,
      pass: external >= 1,
      detail: `${external}개`,
    },
    {
      key: "images",
      label: "이미지 2개 이상 + alt",
      weight: 10,
      pass: img.count >= 2 && img.withAlt >= 2,
      detail: `${img.count}개 · alt ${img.withAlt}개`,
    },
    {
      key: "faq",
      label: "FAQ 구조화 데이터(FAQPage)",
      weight: 8,
      pass: faqSchema,
      detail: faqSchema ? "있음" : "없음",
    },
    {
      key: "tags",
      label: "태그(키워드) 5개 이상",
      weight: 5,
      pass: tagCount >= 5,
      detail: `${tagCount}개`,
    },
    {
      key: "thumb",
      label: "대표 이미지(썸네일/OG)",
      weight: 3,
      pass: !!post.thumbnailUrl,
      detail: post.thumbnailUrl ? "있음" : "없음",
    },
  ];

  const score = checks.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
  const grade: SeoScore["grade"] = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";
  return { score, grade, checks, keyword, charCount };
}
