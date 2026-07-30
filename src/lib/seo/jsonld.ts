// 공용 JSON-LD 빌더 — BreadcrumbList·Dataset·ItemList. 데이터 페이지가 AI/검색 인용·위계 파악에 유리하도록.
import { SITE_URL } from "@/lib/site-url";

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
    creator: { "@type": "Organization", name: "스코어베이스", url: SITE_URL },
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
