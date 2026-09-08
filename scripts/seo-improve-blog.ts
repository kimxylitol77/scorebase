// 블로그 SEO 점수 개선 — /admin/seo 하위 글을 골라 실패 항목을 고치고 심판봇(HTML 모드)까지 돌린 뒤 저장한다.
//   npm run seo:improve -- --bottom 5            # 점수 낮은 5편 dry-run (scratchpad 에 전후 HTML 저장, DB 변경 없음)
//   npm run seo:improve -- --ids 22,45 --apply   # 지정 글 적용
//
// 원칙. 본문을 통째로 다시 쓰게 하지 않는다. LLM 은 (1) 첫 문단 고쳐쓰기 (2) 새 섹션 2~4개 (3) FAQ 4개 (4) 요약문만 JSON 으로 내고,
// 코드가 원문 줄 사이에 끼워 넣는다. 외부 링크·이미지·썸네일·태그 순서는 코드가 정한다(검증된 URL 만).
// 숫자는 원문에 있는 것만 허용 — 새 숫자가 든 섹션·FAQ 는 버린다. 그 뒤 심판봇이 <p> 문단만 문체를 고친다.
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { scoreBlogPost } from "@/lib/seo-score";
import { humanizeArticle, numberSet, scoreHumanness } from "@/lib/articles/humanize";
import { SITE_URL } from "@/lib/site-url";
import { mkdirSync, writeFileSync } from "node:fs";

// 전후 HTML 백업 — 되돌릴 때 before.html 을 그대로 content 에 넣으면 된다. reports/ 는 untracked.
const OUT = process.env.SEO_IMPROVE_OUT ?? "reports/seo-improve";
const MODEL = process.env.SEO_IMPROVE_MODEL ?? "claude-sonnet-5";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "true") : null;
}
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

// 주제별 외부 권위 출처 — 전부 2026-09-04 curl 로 200 확인. 새 항목은 확인 후 추가.
const EXTERNAL: Array<{ match: RegExp; href: string; label: string }> = [
  { match: /월드컵|world-cup/i, href: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026", label: "FIFA 월드컵 2026 공식 페이지" },
  { match: /이적|transfer|몸값|market/i, href: "https://www.transfermarkt.com/", label: "Transfermarkt" },
  { match: /오버|언더|over-under/i, href: "https://en.wikipedia.org/wiki/Over%E2%80%93under", label: "Over–under (Wikipedia)" },
  { match: /적중률|accuracy|scorecard|예측/i, href: "https://en.wikipedia.org/wiki/Brier_score", label: "Brier score (Wikipedia)" },
  { match: /프리미어리그|epl/i, href: "https://www.premierleague.com/", label: "프리미어리그 공식" },
  { match: /./, href: "https://en.wikipedia.org/wiki/Elo_rating_system", label: "Elo rating system (Wikipedia)" },
];

const SYSTEM = `너는 한국어 스포츠 데이터 매체의 편집자다. 주어진 글의 사실만 써서 보강한다. 없는 사실·숫자·이름을 지어내지 않는다.
문장은 사람이 말하듯 길이를 섞어 쓴다. "이는 ~을 보여준다/의미한다" 식 해설 마무리, "극단적·명확한" 같은 강조어, 긴 줄표(—)는 쓰지 않는다.`;

function buildPrompt(p: { title: string; content: string; excerpt: string | null }, keyword: string | null, need: { firstKw: boolean; h2: number; chars: number; faq: boolean; desc: boolean; keywordInTitle: boolean }): string {
  const text = p.content.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\sstyle="[^"]*"/g, "");
  const kwRule = need.keywordInTitle
    ? `이 글의 주 키워드는 "${keyword}" 다. titleKeyword 는 빈 문자열.`
    : `현재 첫 태그 "${keyword ?? ""}" 는 제목에 없다. 먼저 titleKeyword 로 제목 안에 글자 그대로 들어 있는 2~4어절 검색어(예: "월드컵 우승국")를 고르고, 그것을 이 글의 주 키워드로 삼아 firstParagraph 앞 100자와 excerpt 에 넣어라.`;
  return `아래 블로그 글(HTML)을 읽고 JSON 하나만 출력하라. 설명·코드펜스 금지.

## 이 글의 주 키워드
${kwRule}

## 만들 것
{
  "firstParagraph": "<p>…</p>",         // 첫 문단을 고쳐 쓴 것. ${need.firstKw && keyword ? `앞 100자 안에 "${keyword}" 가 자연스럽게 들어가야 한다. ` : ""}원래 첫 문단의 사실·숫자는 전부 유지.
  "sections": [ { "h2": "…", "html": "<p>…</p><p>…</p>" } ],   // 새 섹션 ${need.h2 > 0 || need.chars > 0 ? `${Math.max(2, need.h2)}개 이상, 합쳐서 공백 제외 ${Math.max(600, need.chars)}자 이상` : "0~2개"}. 각 섹션은 <p> 2~4개.
  "faq": [ { "q": "…", "a": "…" } ],   // ${need.faq ? "독자가 검색창에 칠 법한 질문 4개와 답. 답은 2~3문장, 글 안의 사실로만." : "빈 배열"}
  "excerpt": "…",                       // ${need.desc ? `검색 결과용 요약 80~150자. "${keyword ?? ""}" 포함. 문장 끝은 마침표.` : "원래 요약 그대로"}
  "titleKeyword": "…"                   // 위 규칙대로. 제목에 없는 말은 금지.
}
## 문체
- 종결어미는 원문과 같은 체로. 원문이 "~습니다" 면 전부 "~습니다". 문장 길이는 섞는다.

## 새 섹션에 쓸 수 있는 것
- 글에 이미 있는 숫자·이름·사실을 다른 각도로 풀어 쓰기(해석·비교·맥락).
- 용어 설명(예: 공개 이적료 기준이 무엇인지, 몬테카를로 시뮬레이션이 무엇인지)처럼 숫자 없는 일반 설명.
- 독자가 다음에 할 일(어디서 실시간으로 볼지)은 글에 이미 있는 링크만 언급.
## 쓸 수 없는 것
- 글에 없는 숫자·날짜·이적료·순위·확률. 글에 없는 선수·팀·감독 이름. 부상·발언·이적설 같은 새 사실.
- 이모지, 긴 줄표(—), "이는 ~을 보여준다/의미한다" 마무리, 3개짜리 목록 강박.
- 다른 글과 똑같이 재사용될 법한 일반론 반복. 이 글의 숫자에 붙은 해석이어야 한다.

## 글
제목: ${p.title}
요약: ${p.excerpt ?? ""}
${text}`;
}

interface Plan {
  titleKeyword?: string;
  firstParagraph?: string;
  sections?: Array<{ h2: string; html: string }>;
  faq?: Array<{ q: string; a: string }>;
  excerpt?: string;
}

function parseJson(raw: string): Plan {
  const c = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const s = c.indexOf("{");
  const e = c.lastIndexOf("}");
  return JSON.parse(c.slice(s, e + 1)) as Plan;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 추가 조각의 숫자가 전부 원문에 있는가. 아니면 새 숫자를 알려준다. */
function newNumbers(fragment: string, allowed: Set<string>): string[] {
  return [...numberSet(fragment, "html")].filter((n) => !allowed.has(n));
}
/** 원문에 없는 영문 고유명사(대문자 시작 단어) — 새 선수·팀 이름이 섞이는 것을 막는다. */
function newLatinNames(fragment: string, original: string): string[] {
  const seen = new Set((original.match(/\b[A-Z][A-Za-z'.-]{2,}\b/g) ?? []).map((w) => w.toLowerCase()));
  return [...new Set((fragment.replace(/<[^>]+>/g, " ").match(/\b[A-Z][A-Za-z'.-]{2,}\b/g) ?? []).filter((w) => !seen.has(w.toLowerCase())))];
}
/** 원문에 없는 한글 낱말(2~5음절, 조사 제거) — 자동 차단은 안 하고 dry-run 에서 사람이 볼 수 있게 보고만 한다. */
function newKoreanWords(fragment: string, original: string): string[] {
  const strip = (w: string) => w.replace(/(에서는|에게|으로|에서|부터|까지|이다|입니다|였다|였던|이|가|은|는|을|를|의|와|과|도|로|에|서)$/, "");
  const words = (t: string) => new Set((t.replace(/<[^>]+>/g, " ").match(/[가-힣]{2,6}/g) ?? []).map(strip).filter((w) => w.length >= 2));
  const base = words(original);
  return [...words(fragment)].filter((w) => !base.has(w) && ![...base].some((b) => b.includes(w) || w.includes(b))).slice(0, 12);
}

function ogImage(title: string, subtitle: string, tag: string): string {
  const q = new URLSearchParams({ title, subtitle, tag });
  return `${SITE_URL}/api/og/page?${q.toString()}`;
}

async function improveOne(id: number, apply: boolean) {
  const p = await prisma.blog.findUnique({ where: { id }, select: { id: true, slug: true, title: true, excerpt: true, content: true, tags: true, thumbnailUrl: true } });
  if (!p) throw new Error(`blog #${id} 없음`);
  const before = scoreBlogPost(p);
  const failing = new Set(before.checks.filter((c) => !c.pass).map((c) => c.key));
  console.log(`\n#${p.id} /blog/${p.slug}  ${before.score}점 ${before.grade}  실패: ${[...failing].join(", ") || "없음"}`);

  // 1) 태그 순서 — 제목에 이미 들어 있는 태그를 앞으로 (제목을 바꾸지 않고 키워드 검사를 맞춘다)
  let tags = (p.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (tags.length && !norm(p.title).includes(norm(tags[0]))) {
    const inTitle = tags.find((t) => norm(p.title).includes(norm(t)));
    if (inTitle) tags = [inTitle, ...tags.filter((t) => t !== inTitle)];
  }
  // 2) LLM — 첫 문단·새 섹션·FAQ·요약(·제목 속 검색어)
  let keyword = tags[0] ?? null;
  let tagsStr = tags.join(", ");
  const after0 = scoreBlogPost({ ...p, tags: tagsStr });
  const fail0 = new Map(after0.checks.map((c) => [c.key, c]));
  const need = {
    firstKw: !fail0.get("firstKw")!.pass,
    h2: Math.max(0, 6 - Number((fail0.get("h2")!.detail.match(/\d+/) ?? ["0"])[0])),
    chars: Math.max(0, 2500 - after0.charCount),
    faq: !fail0.get("faq")!.pass,
    desc: !fail0.get("desc")!.pass,
    keywordInTitle: !!keyword && norm(p.title).includes(norm(keyword)),
  };
  // 키워드가 제목에 없으면 첫 문단·요약을 새 키워드로 다시 쓰게 되므로 두 항목도 요청한다
  if (!need.keywordInTitle) {
    need.firstKw = true;
    need.desc = true;
  }
  const allowed = numberSet(p.content, "html");
  let plan: Plan = {};
  try {
    plan = parseJson(await generate(buildPrompt(p, keyword, need), { system: SYSTEM, maxTokens: 6000, model: MODEL, timeoutMs: 240_000 }));
  } catch (e) {
    console.log(`  LLM 실패: ${(e as Error).message?.slice(0, 120)} — 코드 보강만 적용`);
  }
  // 제목에 태그가 하나도 없으면 — 제목 안에 글자 그대로 있는 검색어를 첫 태그로 (제목은 안 바꾼다)
  if (keyword && !norm(p.title).includes(norm(keyword)) && plan.titleKeyword && p.title.includes(plan.titleKeyword.trim())) {
    tags = [plan.titleKeyword.trim(), ...tags.filter((t) => t !== plan.titleKeyword!.trim())];
    keyword = tags[0];
    tagsStr = tags.join(", ");
  }
  // 분량이 크게 모자라면 한 번 더 — 같은 말 반복 금지, 할 말 없으면 적게
  const countAdded = () => (plan.sections ?? []).reduce((n, x) => n + x.html.replace(/<[^>]+>/g, "").replace(/\s/g, "").length, 0);
  for (let extra = 0; extra < 2 && need.chars > 0 && countAdded() < need.chars; extra++) {
    try {
      const more = parseJson(
        await generate(
          buildPrompt(p, keyword, { ...need, h2: 0, chars: need.chars - countAdded(), faq: false, desc: false, firstKw: false }) +
            `\n\n## 추가 조건\n이미 만든 섹션: ${(plan.sections ?? []).map((x) => x.h2).join(" / ")}. 이것과 겹치지 않는 새 각도만. 같은 사실을 다른 말로 반복하면 안 된다. 정말 할 말이 없으면 sections 를 비워라.`,
          { system: SYSTEM, maxTokens: 4000, model: MODEL, timeoutMs: 240_000 },
        ),
      );
      if (!more.sections?.length) break;
      plan.sections = [...(plan.sections ?? []), ...more.sections];
    } catch {
      break;
    }
  }

  const lines = p.content.split("\n");
  const rejected: string[] = [];

  // 2a) 첫 문단 교체 (style 없는 첫 <p>)
  if (plan.firstParagraph && /^<p(\s|>)/i.test(plan.firstParagraph.trim())) {
    const idx = lines.findIndex((l) => /^\s*<p(\s|>)/i.test(l) && !/style=/.test(l));
    const bad = newNumbers(plan.firstParagraph, allowed);
    if (idx >= 0 && bad.length === 0) lines[idx] = plan.firstParagraph.trim();
    else if (bad.length) rejected.push(`첫 문단(새 숫자 ${bad.join(",")})`);
  }

  // 2b) 새 섹션 — 마지막 "실시간으로 보려면/관련" 섹션 앞, 없으면 </article> 앞
  const review: string[] = [];
  const sections = (plan.sections ?? []).filter((s) => {
    const bad = newNumbers(s.html + s.h2, allowed);
    const names = newLatinNames(s.html + s.h2, p.content);
    if (bad.length) rejected.push(`섹션 "${s.h2}"(새 숫자 ${bad.join(",")})`);
    if (names.length) rejected.push(`섹션 "${s.h2}"(새 영문 이름 ${names.join(",")})`);
    const nk = newKoreanWords(s.html, p.content);
    if (nk.length) review.push(`"${s.h2}": ${nk.join(" ")}`);
    return bad.length === 0 && names.length === 0 && /^<p/i.test(s.html.trim());
  });
  if (plan.firstParagraph) {
    const nk = newKoreanWords(plan.firstParagraph, p.content);
    if (nk.length) review.push(`첫 문단: ${nk.join(" ")}`);
  }
  const h2Style = (lines.find((l) => /<h2 style=/.test(l))?.match(/<h2 (style="[^"]*")/) ?? [])[1];
  const h2 = (t: string) => (h2Style ? `<h2 ${h2Style}>${esc(t)}</h2>` : `<h2>${esc(t)}</h2>`);
  const hr = lines.find((l) => /^\s*<hr/.test(l))?.trim();
  let insertAt = lines.findIndex((l) => /<h2[^>]*>(실시간으로 보려면|관련 (페이지|글)|함께 보면)/.test(l));
  if (insertAt < 0) insertAt = lines.findIndex((l) => /<\/article>/i.test(l));
  if (insertAt < 0) insertAt = lines.length;
  const addition: string[] = [];
  for (const s of sections) {
    if (hr) addition.push("", hr);
    addition.push("", h2(s.h2), ...s.html.trim().split(/\n+/).map((x) => x.trim()));
  }

  // 2c) FAQ — HTML 블록 + FAQPage JSON-LD (렌더는 blog 페이지가 script 를 추출해 재삽입한다)
  const faq = (plan.faq ?? []).filter((f) => f.q && f.a && newNumbers(`${f.q} ${f.a}`, allowed).length === 0 && newLatinNames(`${f.q} ${f.a}`, p.content).length === 0).slice(0, 5);
  if (faq.length >= 3 && failing.has("faq")) {
    if (hr) addition.push("", hr);
    addition.push("", h2("자주 묻는 질문"));
    for (const f of faq) addition.push(`<h3>${esc(f.q)}</h3>`, `<p class="sb-faq">${esc(f.a)}</p>`);
    const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
    addition.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/<\//g, "<\\/")}</script>`);
  } else if (failing.has("faq")) rejected.push(`FAQ(${faq.length}개뿐)`);

  // 2d) 외부 출처 1개
  if (failing.has("external")) {
    const ext = EXTERNAL.find((e) => e.match.test(`${p.slug} ${p.title} ${tagsStr}`))!;
    addition.push("", `<p class="sb-ref">참고 자료: <a href="${ext.href}" target="_blank" rel="noopener nofollow">${esc(ext.label)}</a></p>`);
  }
  lines.splice(insertAt, 0, ...addition);

  // 2e) 이미지 — 부족한 만큼 OG 카드(제목·부제 기반, alt 포함). 첫 H2 앞과 마지막 추가 섹션 앞.
  const imgCount = (p.content.match(/<img\s/gi) ?? []).length + (p.content.match(/!\[[^\]]*\]\(/g) ?? []).length;
  const needImg = Math.max(0, 2 - imgCount);
  const figure = (title: string, subtitle: string) =>
    `<figure><img src="${ogImage(title, subtitle, keyword ?? "스코어베이스")}" alt="${esc(`${title} — ${subtitle}`)}" width="1200" height="630" loading="lazy" style="width:100%;height:auto;border-radius:12px;display:block;" /></figure>`;
  if (needImg > 0) {
    // 첫 H2 앞, 없으면 첫 문단 뒤
    let at = lines.findIndex((l) => /<h2/i.test(l));
    if (at < 0) at = lines.findIndex((l) => /^\s*<p(\s|>)/i.test(l)) + 1;
    lines.splice(Math.max(at, 0), 0, figure(p.title.split(" — ")[0].slice(0, 40), keyword ?? "스코어베이스 데이터"), "");
  }
  if (needImg > 1) {
    // 첫 추가 섹션 앞, 없으면 마지막 H2 앞
    const h2s = lines.map((l, i) => (/<h2/i.test(l) ? i : -1)).filter((i) => i >= 0);
    let i = sections.length ? lines.findIndex((l) => l.includes(h2(sections[0].h2))) : -1;
    if (i < 0) i = h2s.length ? h2s[h2s.length - 1] : lines.length - 1;
    const sub = sections.length ? sections[0].h2 : keyword ?? "스코어베이스";
    lines.splice(i, 0, figure(sub.slice(0, 40), p.title.split(" — ")[0].slice(0, 40)), "");
  }

  let content = lines.join("\n");
  const excerpt = need.desc && plan.excerpt && plan.excerpt.length >= 80 && plan.excerpt.length <= 165 && keyword && norm(plan.excerpt).includes(norm(keyword)) ? plan.excerpt : p.excerpt;
  const thumbnailUrl = p.thumbnailUrl ?? ogImage(p.title.split(" — ")[0].slice(0, 40), keyword ?? "스코어베이스", "blog");

  // 3) 심판봇 (HTML 모드) — <p> 문단만 문체 교정, 숫자·구조는 불변
  const hz = await humanizeArticle(content, { format: "html", label: `blog#${p.id}`, model: MODEL });
  content = hz.content;

  const after = scoreBlogPost({ ...p, content, excerpt, tags: tagsStr, thumbnailUrl });
  const h0 = scoreHumanness(p.content, "html").score;
  console.log(`  SEO ${before.score}→${after.score}점 (${before.grade}→${after.grade}) · 심판봇 ${h0}→${hz.after}점(${hz.rounds}회${hz.accepted ? " 채택" : hz.rounds ? " 원문 유지" : ""}) · 분량 ${before.charCount}→${after.charCount}자 · 섹션 +${sections.length} · FAQ ${faq.length}`);
  if (rejected.length) console.log(`  버린 조각: ${rejected.join(" / ")}`);
  if (review.length) console.log(`  원문에 없던 낱말(사람 확인용): ${review.join(" | ")}`);
  const still = after.checks.filter((c) => !c.pass).map((c) => `${c.key}(${c.detail})`);
  if (still.length) console.log(`  남은 실패: ${still.join(" · ")}`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${p.id}-before.html`, p.content);
  writeFileSync(`${OUT}/${p.id}-after.html`, `<!-- excerpt: ${excerpt}\n     tags: ${tagsStr}\n     thumb: ${thumbnailUrl} -->\n${content}`);

  if (apply) {
    await prisma.blog.update({ where: { id: p.id }, data: { content, excerpt, tags: tagsStr, thumbnailUrl } });
    console.log(`  저장됨 → ${SITE_URL}/blog/${p.slug}`);
  }
  return { id: p.id, before: before.score, after: after.score };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const ids = arg("ids");
  const bottom = arg("bottom");
  let targets: number[] = [];
  if (ids) targets = ids.split(",").map(Number);
  else {
    const posts = await prisma.blog.findMany({ select: { id: true, title: true, excerpt: true, content: true, tags: true, thumbnailUrl: true } });
    targets = posts
      .map((p) => ({ id: p.id, s: scoreBlogPost(p).score }))
      .sort((a, b) => a.s - b.s)
      .slice(0, Number(bottom ?? 5))
      .map((x) => x.id);
  }
  console.log(`${apply ? "적용" : "DRY RUN"} · 대상 ${targets.length}편 · 모델 ${MODEL}`);
  const results = [];
  for (const id of targets) {
    try {
      results.push(await improveOne(id, apply));
    } catch (e) {
      console.error(`#${id} 실패:`, (e as Error).message);
    }
  }
  console.log(`\n요약: ${results.map((r) => `#${r.id} ${r.before}→${r.after}`).join(" · ")}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
