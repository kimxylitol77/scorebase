// /en 미러 빌더 — 한국어 페이지 + 그 페이지가 쓰는 공용 컴포넌트를 영어판으로 생성한다.
//
// 2패스로 도는 이유: import 경로를 "@/components/en/..." 로 바꾸려면
// 어떤 컴포넌트가 미러 대상인지 먼저 확정돼야 한다.
//   1패스 — 의존성 재귀 수집 → 렌더 한글이 있는 파일만 미러 대상으로 확정
//   2패스 — 각 파일 변환 (사전 치환 + 보정 규칙 + import 경로 재작성)
import * as fs from "fs";
import * as path from "path";
import { extractSource, type Hit } from "./extract";

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");

export interface Override {
  dict?: Record<string, string>;
  preReplace?: [string, string][];
  replace?: [string, string][];
  header?: string;
}

// ---------- 로딩 ----------

function loadJson<T>(p: string, fallback: T): T {
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as T) : fallback;
}

const DICT_PATH = path.join(__dirname, "dict.json");
const OVERRIDE_DIR = path.join(__dirname, "overrides");

function overrideKey(rel: string): string {
  // src 기준 상대경로 → 파일명. "app/salaries/golf/page.tsx" → "app__salaries__golf__page"
  return rel.replace(/\.(tsx|ts)$/, "").replace(/[\/\[\]]/g, (c) => (c === "/" ? "__" : "_"));
}

function loadOverride(rel: string): Override {
  return loadJson<Override>(path.join(OVERRIDE_DIR, `${overrideKey(rel)}.json`), {});
}

// ---------- 파일 해석 ----------

/** "@/components/Foo" → src 기준 실제 파일 경로. 없으면 null. */
function resolveAlias(spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const base = path.join(SRC, spec.slice(2));
  for (const ext of [".tsx", ".ts"]) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  for (const ext of [".tsx", ".ts"]) {
    const idx = path.join(base, "index" + ext);
    if (fs.existsSync(idx)) return idx;
  }
  return null;
}

/** 파일이 import 하는 "@/components/**" 스펙 목록. */
function componentImports(src: string): string[] {
  const out: string[] = [];
  const re = /from\s+["'](@\/components\/[^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

/** 렌더 경로(주석 제외)에 한글이 있는가 — AST 기준. */
function hasHangul(src: string, file: string): boolean {
  return extractSource(src, file).length > 0;
}

// ---------- 1패스: 의존성 수집 ----------

export interface Plan {
  /** 미러를 만들 컴포넌트: alias spec → 원본 절대경로 */
  mirrorComponents: Map<string, string>;
  /** 한글이 없어 원본을 그대로 쓰는 컴포넌트 */
  reused: Set<string>;
}

export function collectPlan(pageFiles: string[]): Plan {
  const mirrorComponents = new Map<string, string>();
  const reused = new Set<string>();
  const seen = new Set<string>();

  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = fs.readFileSync(file, "utf8");
    for (const spec of componentImports(src)) {
      const abs = resolveAlias(spec);
      if (!abs) { console.warn(`  [해석 실패] ${spec}`); continue; }
      if (abs.includes(`${path.sep}components${path.sep}en${path.sep}`)) continue; // 이미 영어 전용
      const csrc = fs.readFileSync(abs, "utf8");
      if (hasHangul(csrc, abs)) mirrorComponents.set(spec, abs);
      else reused.add(spec);
      walk(abs);
    }
  };
  for (const f of pageFiles) walk(f);
  return { mirrorComponents, reused };
}

// ---------- 2패스: 변환 ----------

function applyRules(src: string, rules: [string, string][], label: string, file: string): string {
  let out = src;
  for (const [from, to] of rules) {
    if (!out.includes(from)) {
      console.warn(`  [${label} 미적용] ${path.basename(file)} :: ${JSON.stringify(from.slice(0, 60))}`);
      continue;
    }
    out = out.split(from).join(to);
  }
  return out;
}

function rewriteRelativeImports(src: string, fromDir: string, toDir: string): string {
  return src.replace(/from\s+(["'])(\.[^"']*)\1/g, (_all, q, spec) => {
    const abs = path.resolve(fromDir, spec);
    let next = path.relative(toDir, abs).split(path.sep).join("/");
    if (!next.startsWith(".")) next = "./" + next;
    return `from ${q}${next}${q}`;
  });
}

function rewriteComponentImports(src: string, mirror: Map<string, string>): string {
  return src.replace(/from\s+(["'])(@\/components\/[^"']+)\1/g, (all, q, spec) => {
    if (!mirror.has(spec)) return all;
    return `from ${q}@/components/en/${spec.slice("@/components/".length)}${q}`;
  });
}

export interface FileResult {
  rel: string;
  outPath: string;
  missing: Hit[];
  total: number;
}

export function transformFile(
  absFile: string,
  outPath: string,
  dict: Record<string, string>,
  mirror: Map<string, string>,
): { code: string; missing: Hit[]; total: number } {
  const rel = path.relative(SRC, absFile).split(path.sep).join("/");
  const ov = loadOverride(rel);
  const merged = { ...dict, ...(ov.dict ?? {}) };

  const src = fs.readFileSync(absFile, "utf8");
  const pre = applyRules(src, ov.preReplace ?? [], "preReplace", absFile);

  const hits = extractSource(pre, absFile);
  const missing: Hit[] = [];

  let out = pre;
  for (const h of [...hits].sort((a, b) => b.start - a.start)) {
    const en = merged[h.text];
    if (en === undefined) { missing.push(h); continue; }
    const raw = out.slice(h.start, h.end);
    const idx = raw.indexOf(h.text);
    if (idx < 0) { missing.push(h); continue; }
    out = out.slice(0, h.start) + raw.slice(0, idx) + en + raw.slice(idx + h.text.length) + out.slice(h.end);
  }

  out = applyRules(out, ov.replace ?? [], "replace", absFile);
  out = rewriteRelativeImports(out, path.dirname(absFile), path.dirname(outPath));
  out = rewriteComponentImports(out, mirror);

  if (ov.header) out = `// ${ov.header}\n` + out.replace(/^(\/\/[^\n]*\n)+/, "");

  return { code: out, missing, total: hits.length };
}

// ---------- 엔트리 ----------

function pageFileFor(route: string): string {
  return path.join(SRC, "app", route.replace(/^\//, ""), "page.tsx");
}
function enPageFileFor(route: string): string {
  return path.join(SRC, "app/en", route.replace(/^\//, ""), "page.tsx");
}
function enComponentFileFor(spec: string): string {
  const rest = spec.slice("@/components/".length);
  const abs = resolveAlias(spec)!;
  return path.join(SRC, "components/en", rest + path.extname(abs));
}

if (require.main === module) {
  const write = process.argv.includes("--write");
  const routes = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (routes.length === 0) { console.error("사용법: tsx build.ts <route...> [--write]"); process.exit(1); }

  const pageFiles = routes.map(pageFileFor);
  for (const f of pageFiles) if (!fs.existsSync(f)) { console.error(`없는 페이지: ${f}`); process.exit(1); }

  const plan = collectPlan(pageFiles);
  console.log(`대상 페이지 ${routes.length}개 · 미러 컴포넌트 ${plan.mirrorComponents.size}개 · 원본 재사용 ${plan.reused.size}개\n`);

  const dict = loadJson<Record<string, string>>(DICT_PATH, {});
  const results: FileResult[] = [];

  const emit = (abs: string, outPath: string) => {
    const { code, missing, total } = transformFile(abs, outPath, dict, plan.mirrorComponents);
    const rel = path.relative(SRC, abs).split(path.sep).join("/");
    results.push({ rel, outPath, missing, total });
    if (write) {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, code);
    }
    const ok = total - missing.length;
    const mark = missing.length === 0 ? "OK  " : "미번역";
    console.log(`  ${mark} ${rel.padEnd(52)} ${String(ok).padStart(4)}/${String(total).padEnd(4)}`);
  };

  console.log("[컴포넌트]");
  for (const [spec, abs] of plan.mirrorComponents) emit(abs, enComponentFileFor(spec));
  console.log("\n[페이지]");
  routes.forEach((r, i) => emit(pageFiles[i], enPageFileFor(r)));

  const allMissing = results.flatMap((r) => r.missing.map((m) => ({ rel: r.rel, m })));
  console.log(`\n총 미번역 ${allMissing.length}건`);
  if (allMissing.length) {
    const uniq = new Map<string, number>();
    for (const { m } of allMissing) uniq.set(m.text, (uniq.get(m.text) ?? 0) + 1);
    console.log(`고유 ${uniq.size}건:\n`);
    for (const [text, n] of [...uniq].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(3)}x ${JSON.stringify(text)}`);
    }
  }
  if (!write) console.log("\n(미리보기 — 쓰려면 --write)");
}
