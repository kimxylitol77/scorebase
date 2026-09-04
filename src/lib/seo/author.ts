// 사이트 저자(운영자) 실체 — E-E-A-T 의 "누가 썼는가" 신호. 이름은 여기 상수로만 채운다. 비어 있으면 Organization 저자로 폴백한다.
import { SITE_URL } from "@/lib/site-url";
import { ORG_ID } from "@/lib/seo/jsonld";

// ── 운영자가 채우는 부분 ─────────────────────────────────────────────
// 실명 또는 필명. 코드가 지어내지 않는다. 비우면 저자 바이라인·Person JSON-LD·/authors 페이지가 전부 꺼진다.
const AUTHOR_NAME: string = "";
const AUTHOR_SLUG = "editor";
const AUTHOR_TITLE = "데이터 분석가 · 운영자";
// 외부 프로필(LinkedIn·GitHub·X 등). 실재하는 주소만 — 죽은 URL 은 sameAs 신호를 깎는다.
const AUTHOR_LINKS: string[] = [];
const AUTHOR_BIO =
  "스코어베이스의 Elo·Monte Carlo 예측 모델을 직접 설계·운영합니다. 경기 전에 저장한 예측을 결과로 채점해 적중률을 실패까지 전량 공개합니다.";
// ─────────────────────────────────────────────────────────────────────

export interface SiteAuthor {
  name: string;
  slug: string;
  jobTitle: string;
  bio: string;
  url: string;
  sameAs: string[];
}

export const SITE_AUTHOR: SiteAuthor | null = AUTHOR_NAME.trim()
  ? {
      name: AUTHOR_NAME.trim(),
      slug: AUTHOR_SLUG,
      jobTitle: AUTHOR_TITLE,
      bio: AUTHOR_BIO,
      url: `${SITE_URL}/authors/${AUTHOR_SLUG}`,
      sameAs: AUTHOR_LINKS,
    }
  : null;

/** 참조용 Person — 블로그 author 자리에. 저자 미설정이면 null (호출부에서 orgRef 로 폴백). */
export function authorRef() {
  if (!SITE_AUTHOR) return null;
  return { "@type": "Person", "@id": `${SITE_AUTHOR.url}#person`, name: SITE_AUTHOR.name, url: SITE_AUTHOR.url };
}

/** Person 본체 — /authors 페이지에 싣는다. */
export function authorPersonLd() {
  if (!SITE_AUTHOR) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${SITE_AUTHOR.url}#person`,
    name: SITE_AUTHOR.name,
    url: SITE_AUTHOR.url,
    jobTitle: SITE_AUTHOR.jobTitle,
    description: SITE_AUTHOR.bio,
    worksFor: { "@type": "Organization", "@id": ORG_ID },
    knowsAbout: ["스포츠 통계", "Elo 레이팅", "Monte Carlo 시뮬레이션", "xG", "예측 모델 검증"],
    ...(SITE_AUTHOR.sameAs.length ? { sameAs: SITE_AUTHOR.sameAs } : {}),
  };
}
