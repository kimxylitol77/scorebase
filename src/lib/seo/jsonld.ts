// 공용 JSON-LD 빌더 — Organization(단일 @id)·BreadcrumbList·Dataset·ItemList. 데이터 페이지가 AI/검색 인용·위계 파악에 유리하도록.
import { SITE_URL } from "@/lib/site-url";

/** 조직 엔티티 단일 @id — 모든 publisher·author·creator 가 이 하나를 가리켜야 AI·검색이 같은 주체로 묶는다.
 *  (2026-09-04 GEO 감사: 홈 "스코어베이스" vs 소개·기사 "Scorebase" 로 갈려 있고 @id 가 없어 엔티티 분열) */
export const ORG_ID = `${SITE_URL}/#organization`;
export const ORG_NAME = "스코어베이스";

/** 공개 소셜·외부 프로필 — 죽은 URL 금지. 텔레그램은 env 로만(미설정이면 생략), Threads 는 실재 확인된 계정. */
export const SOCIAL_LINKS: string[] = [
  ...(process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL ? [process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL] : []),
  "https://www.threads.com/@scorebase1",
];

/** 참조용 조직 — publisher·author·creator 자리에. 본체(organizationLd)가 없는 페이지여도 @id 로 같은 엔티티임을 선언. */
export function orgRef() {
  return { "@type": "Organization", "@id": ORG_ID, name: ORG_NAME, url: SITE_URL };
}

/** 조직 본체 — 홈·소개 등 대표 페이지에 싣는다. @graph 안에 넣을 때는 withContext: false. */
export function organizationLd(opts?: { description?: string; inLanguage?: string; withContext?: boolean }) {
  const base = {
    "@type": "Organization",
    "@id": ORG_ID,
    name: ORG_NAME,
    alternateName: ["Scorebase", "스코어 베이스", "Score Base"],
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.png` },
    description:
      opts?.description ??
      "데이터 기반 스포츠 분석 미디어 — 라이브 스코어·AI 프리뷰/리뷰·시즌 시뮬레이션·예측 적중률 공개",
    inLanguage: opts?.inLanguage ?? "ko-KR",
    foundingDate: "2026",
    ...(SOCIAL_LINKS.length ? { sameAs: SOCIAL_LINKS } : {}),
  };
  return opts?.withContext === false ? base : { "@context": "https://schema.org", ...base };
}

/** 빵부스러기 — [{name, path}] 순서대로. path 는 절대(http) 또는 상대(/x). 마지막이 현재 페이지. */
export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.path.startsWith("http") ? it.path : `${SITE_URL}${it.path}`,
    })),
  };
}

/** 정형 데이터 페이지용 Dataset — 순위·적중률·이적 등 고유 데이터 인용 신호. */
export function datasetLd(opts: {
  name: string;
  description: string;
  path: string;
  variableMeasured?: string[];
  dateModified?: string;
  temporalCoverage?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: opts.name,
    description: opts.description,
    url: `${SITE_URL}${opts.path}`,
    creator: orgRef(),
    isAccessibleForFree: true,
    ...(opts.variableMeasured ? { variableMeasured: opts.variableMeasured } : {}),
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
    ...(opts.temporalCoverage ? { temporalCoverage: opts.temporalCoverage } : {}),
  };
}

/** 목록 페이지용 ItemList — 국가대표팀·리그 등 항목 집합. */
export function itemListLd(opts: { name: string; items: { name: string; path: string }[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: opts.name,
    numberOfItems: opts.items.length,
    itemListElement: opts.items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: it.path.startsWith("http") ? it.path : `${SITE_URL}${it.path}`,
    })),
  };
}

/** 선수 프로필용 Person — 엔티티 인식(구글 Knowledge Graph·AI 검색)용. sameAs=위키 링크가 있으면 연결이 강력. */
export function athleteLd(opts: {
  name: string;
  path: string;
  image?: string | null;
  nationality?: string | null;
  birthDate?: string | null;
  height?: string | null;
  weight?: string | null;
  jobTitle?: string | null;
  team?: { name: string; url?: string | null } | null;
  sameAs?: string[];
  description?: string | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: opts.name,
    url: `${SITE_URL}${opts.path}`,
    ...(opts.image ? { image: opts.image } : {}),
    ...(opts.nationality ? { nationality: opts.nationality } : {}),
    ...(opts.birthDate ? { birthDate: opts.birthDate } : {}),
    ...(opts.height ? { height: opts.height } : {}),
    ...(opts.weight ? { weight: opts.weight } : {}),
    ...(opts.jobTitle ? { jobTitle: opts.jobTitle } : {}),
    ...(opts.team
      ? {
          memberOf: {
            "@type": "SportsTeam",
            name: opts.team.name,
            ...(opts.team.url ? { url: opts.team.url.startsWith("http") ? opts.team.url : `${SITE_URL}${opts.team.url}` } : {}),
          },
        }
      : {}),
    ...(opts.sameAs && opts.sameAs.length ? { sameAs: opts.sameAs } : {}),
    ...(opts.description ? { description: opts.description } : {}),
  };
}

/**
 * JSON-LD <script> 한 줄 — 서버 컴포넌트에서
 * `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(obj) }} />` 로 삽입.
 *
 * DB·외부 API 에서 온 문자열(팀명·선수명·글 제목)이 그대로 들어오므로 `</script>` 로 태그를 탈출당할 수 있다.
 * `<`·`>`·`&` 를 \uXXXX 로 바꾸면 JSON 값은 그대로면서 HTML 파서가 태그 끝으로 읽지 못한다.
 * U+2028/U+2029 는 JSON 에선 합법이지만 JS 문자열 리터럴에선 줄바꿈이라 함께 막는다.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
