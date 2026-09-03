// 자동 생성되는 sitemap.xml — 구글용 lean 버전 (GSC 에 등록된 주소라 재등록 없이 반영).
// 전체판(빙용)은 /sitemap-full.xml. 엔트리 구성·분리 근거는 lib/seo/sitemap-entries.ts.
// 빌드 시점 정적 스냅샷이면 cron 발행 글(Article)·블로그가 다음 배포까지 누락 → 1시간 재생성.
import type { MetadataRoute } from "next";
import { buildSitemapEntries } from "@/lib/seo/sitemap-entries";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return (await buildSitemapEntries()).lean;
}
