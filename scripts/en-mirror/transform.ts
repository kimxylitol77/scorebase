// 한국어 page.tsx → 영어 /en 페이지 생성기.
// 입력: 한국어 소스 + 공용 사전 + 페이지별 보정 규칙. 출력: src/app/en/**/page.tsx
//
// 처리 순서가 중요하다.
//   1) AST 로 잡은 한글 노드를 뒤에서부터 사전 치환 (앞에서 하면 위치가 밀린다)
//   2) 그 다음 replace 규칙 적용 (함수 호출·링크 등 소스 단위 치환)
// 사전에 없는 한글은 그대로 남겨두고 경고한다 — 조용히 넘기면 한글이 영어판에 샌다.
import * as fs from "fs";
import * as path from "path";
import { extractSource, type Hit } from "./extract";
import { applyGlobalReplace } from "./global-replace";

const ROOT = path.resolve(__dirname, "../..");

interface Override {
  route: string;            // 한국어 라우트 예: "/salaries/golf"
  dict?: Record<string, string>;
  preReplace?: [string, string][];  // 한국어 원문 기준 — 사전 치환 전에 적용
  replace?: [string, string][];     // 영어 치환 후 기준
  header?: string;          // 생성 파일 맨 위 주석 (한국어, CLAUDE.md 규칙 6)
}

function applyRules(src: string, rules: [string, string][], label: string): string {
  let out = src;
  for (const [from, to] of rules) {
    if (!out.includes(from)) {
      console.warn(`  [${label} 미적용] ${JSON.stringify(from.slice(0, 70))}`);
      continue;
    }
    out = out.split(from).join(to);
  }
  return out;
}

function loadDict(): Record<string, string> {
  const p = path.join(__dirname, "dict.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
}

function loadOverride(route: string): Override | null {
  const slug = route.replace(/^\//, "").replace(/\//g, "__").replace(/[\[\]]/g, "_");
  const p = path.join(__dirname, "overrides", `${slug}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

/**
 * 상대경로 import 재계산. /en 아래는 디렉토리 깊이가 한 단계 깊어서 그대로 두면 전부 깨진다.
 * "../" 를 하나 더 붙이는 방식은 형제 파일(`../transfer-display`)에서 틀리므로,
 * 절대경로로 풀었다가 새 위치 기준 상대경로로 다시 만든다.
 */
function rewriteRelativeImports(src: string, koDir: string, enDir: string): string {
  return src.replace(/from\s+(["'])(\.[^"']*)\1/g, (all, q, spec) => {
    const abs = path.resolve(koDir, spec);
    let next = path.relative(enDir, abs).split(path.sep).join("/");
    if (!next.startsWith(".")) next = "./" + next;
    return `from ${q}${next}${q}`;
  });
}

export function transform(koFile: string, route: string) {
  const src = fs.readFileSync(koFile, "utf8");
  const ov = loadOverride(route);
  const dict = { ...loadDict(), ...(ov?.dict ?? {}) };

  // 1) 한국어 원문 기준 사전 처리 → 그 결과를 다시 파싱해야 위치가 맞는다
  const pre = applyRules(applyGlobalReplace(src), ov?.preReplace ?? [], "preReplace");

  const hits: Hit[] = extractSource(pre, koFile);
  const missing: Hit[] = [];

  // 뒤에서부터 치환 — start 내림차순
  const sorted = [...hits].sort((a, b) => b.start - a.start);
  let out = pre;
  for (const h of sorted) {
    const en = dict[h.text];
    if (en === undefined) { missing.push(h); continue; }
    const raw = out.slice(h.start, h.end);
    // raw 안의 원문 부분만 바꾼다 (따옴표·백틱·JSX 공백 보존)
    const idx = raw.indexOf(h.text);
    if (idx < 0) { missing.push(h); continue; }
    const replaced = raw.slice(0, idx) + en + raw.slice(idx + h.text.length);
    out = out.slice(0, h.start) + replaced + out.slice(h.end);
  }

  // 3) 영어 치환 후 기준 규칙
  out = applyRules(out, ov?.replace ?? [], "replace");

  // 4) 상대경로 import 재계산
  const koDir = path.dirname(koFile);
  const enDir = path.join(ROOT, "src/app/en", route.replace(/^\//, ""));
  out = rewriteRelativeImports(out, koDir, enDir);

  if (ov?.header) out = `// ${ov.header}\n` + out.replace(/^(\/\/[^\n]*\n)+/, "");

  return { out, missing, hits };
}

if (require.main === module) {
  const route = process.argv[2];
  const write = process.argv.includes("--write");
  if (!route) { console.error("사용법: tsx transform.ts <route> [--write]"); process.exit(1); }

  const koFile = path.join(ROOT, "src/app", route.replace(/^\//, ""), "page.tsx");
  if (!fs.existsSync(koFile)) { console.error(`한국어 페이지 없음: ${koFile}`); process.exit(1); }

  const { out, missing, hits } = transform(koFile, route);
  console.log(`${route} — 한글 ${hits.length}건 중 ${hits.length - missing.length}건 치환, 미번역 ${missing.length}건`);
  if (missing.length) {
    console.log("\n미번역 목록:");
    for (const m of missing) console.log(`  ${String(m.line).padStart(4)} [${m.kind}] ${JSON.stringify(m.text)}`);
  }

  const enFile = path.join(ROOT, "src/app/en", route.replace(/^\//, ""), "page.tsx");
  if (write) {
    fs.mkdirSync(path.dirname(enFile), { recursive: true });
    fs.writeFileSync(enFile, out);
    console.log(`\n생성: ${path.relative(ROOT, enFile)}`);
  } else {
    console.log(`\n(미리보기 — 쓰려면 --write)`);
  }
}
