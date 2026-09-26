// 글 본문(Markdown)에서 우리 인포그래픽 카드(/api/og/* 주간 카드) URL 을 뽑는다 — 상대·절대(SITE_URL) 둘 다 상대 경로로 반환.
// 글 페이지 JSON-LD image 배열과 이미지 사이트맵이 같은 목록을 쓰게 하는 단일 출처.
const RE = /!\[[^\]]*\]\((?:https?:\/\/[^/)\s]+)?(\/api\/og\/(?:weekly-card|baseball-weekly-card|baseball-standings)\?[^)\s]+)\)/g;

export function extractOgCardUrls(markdown: string): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(RE)) {
    const u = m[1].replace(/&amp;/g, "&");
    if (!out.includes(u)) out.push(u);
  }
  return out;
}
