// sportspredictions.live robots — middleware 가 /robots.txt 를 여기로 rewrite. 검색·AI 인용 봇 전부 허용.
import { SP_URL } from "@/lib/sp/site";

export const dynamic = "force-static";

export function GET() {
  const body = ["User-agent: *", "Allow: /", "", `Sitemap: ${SP_URL}/sitemap.xml`, ""].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
