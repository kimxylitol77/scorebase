// 글 본문(Markdown)에서 우리 인포그래픽 카드(/api/og/weekly-card ...) URL 을 뽑는다.
// 글 페이지 JSON-LD image 배열과 이미지 사이트맵이 같은 목록을 쓰게 하는 단일 출처.
const RE = /!\[[^\]]*\]\((\/api\/og\/weekly-card\?[^)\s]+)\)/g;

export function extractOgCardUrls(markdown: string): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(RE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}
