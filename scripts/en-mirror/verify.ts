// /en 페이지 렌더 검증 — HTTP 상태 + 화면에 실제로 보이는 한글 검사.
//
// grep 으로 HTML 을 통째 세면 안 된다. Next.js 가 RSC payload 를 <script> 에 직렬화해 넣어서
// 본문이 완전한 영어여도 한글이 수천 자 잡힌다. script/style 을 걷어낸 뒤 태그를 벗겨야
// "사용자 눈에 보이는 한글" 만 남는다.
//
// ⚠️ 한계 — 이 검사는 SSR HTML 만 본다. 클라이언트에서 그려지는 것(차트 축 라벨 등)은
// 서버 HTML 에 없어 여기서 안 잡힌다. 실제로 /en/transfers 레이더 축이 한글인 채
// "통과" 로 나왔다(브라우저 innerText 로 발견). 차트·인터랙티브 위젯이 있는 페이지는
// 브라우저로 한 번 더 볼 것.
export {}; // 모듈로 취급시켜 전역 이름 충돌을 막는다 (다른 스크립트도 main() 을 쓴다)

const BASE = process.env.EN_VERIFY_BASE ?? "http://localhost:3000";

// 영어판에 남아 있어도 되는 한글 — 언어 전환 UI.
const ALLOWED = new Set(["한국어", "한국어 (Korean site)"]);

function visibleHangul(html: string): string[] {
  const stripped = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, "\n");
  const out = new Set<string>();
  for (const raw of stripped.split("\n")) {
    const t = raw.trim();
    if (t && /[가-힣]/.test(t) && !ALLOWED.has(t)) out.add(t);
  }
  return [...out];
}

async function main() {
  const routes = process.argv.slice(2);
  if (routes.length === 0) { console.error("사용법: tsx verify.ts /en/... [...]"); process.exit(1); }

  let bad = 0;
  for (const route of routes) {
    let status = 0, leaks: string[] = [];
    try {
      const res = await fetch(`${BASE}${route}`, { signal: AbortSignal.timeout(60000) });
      status = res.status;
      if (status === 200) leaks = visibleHangul(await res.text());
    } catch (e) {
      console.log(`  실패  ${route.padEnd(44)} ${(e as Error).message}`);
      bad++;
      continue;
    }
    const ok = status === 200 && leaks.length === 0;
    if (!ok) bad++;
    console.log(`  ${ok ? "OK  " : "문제"} ${route.padEnd(44)} HTTP ${status}${leaks.length ? ` · 한글 ${leaks.length}건` : ""}`);
    for (const l of leaks.slice(0, 6)) console.log(`         ${JSON.stringify(l.slice(0, 90))}`);
  }
  console.log(bad === 0 ? `\n전부 통과 (${routes.length}개)` : `\n문제 ${bad}개 / ${routes.length}개`);
  process.exit(bad === 0 ? 0 : 1);
}
main();
