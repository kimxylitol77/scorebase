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

/** JSON-LD <script> 한 줄 — 서버 컴포넌트에서 `{jsonLdScript(obj)}` 로 삽입. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data);
}
