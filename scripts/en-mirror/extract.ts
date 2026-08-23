// 한국어 page.tsx 에서 한글이 포함된 "렌더에 영향을 주는" 노드만 AST 로 추출한다.
// 주석은 AST 노드가 아니라 trivia 이므로 자연히 제외된다 — 의도된 동작.
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

const HANGUL = /[가-힣]/;

export type Kind = "string" | "jsxText" | "templateSpan" | "noSubTemplate";

export interface Hit {
  file: string;
  kind: Kind;
  start: number;
  end: number;
  text: string;      // 원문 (JSX 텍스트는 trim 된 값)
  raw: string;       // 파일에서 잘라낸 그대로
  line: number;
}

export function extractFile(file: string): Hit[] {
  return extractSource(fs.readFileSync(file, "utf8"), file);
}

/** 파일이 아니라 소스 문자열에서 추출 — 사전 처리(preReplace) 후 재파싱에 쓴다. */
export function extractSource(src: string, file = "inline.tsx"): Hit[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: Hit[] = [];

  const push = (node: ts.Node, kind: Kind, text: string) => {
    if (!HANGUL.test(text)) return;
    const start = node.getStart(sf);
    const end = node.getEnd();
    hits.push({
      file,
      kind,
      start,
      end,
      text: kind === "jsxText" ? text.trim() : text,
      raw: src.slice(start, end),
      line: sf.getLineAndCharacterOfPosition(start).line + 1,
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node)) {
      push(node, "string", node.text);
    } else if (ts.isJsxText(node)) {
      push(node, "jsxText", node.text);
    } else if (ts.isNoSubstitutionTemplateLiteral(node)) {
      push(node, "noSubTemplate", node.text);
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      // 템플릿 리터럴의 문자열 조각만 — ${} 표현식은 건드리지 않는다
      push(node, "templateSpan", node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

if (require.main === module) {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    console.error("사용법: tsx extract.ts <page.tsx> [...]");
    process.exit(1);
  }
  const all: Hit[] = [];
  for (const t of targets) {
    const abs = path.resolve(t);
    if (!fs.existsSync(abs)) { console.error(`없는 파일: ${t}`); continue; }
    all.push(...extractFile(abs));
  }
  const uniq = new Map<string, number>();
  for (const h of all) uniq.set(h.text, (uniq.get(h.text) ?? 0) + 1);

  console.log(`추출 ${all.length}건 / 고유 ${uniq.size}건\n`);
  const byKind = all.reduce<Record<string, number>>((a, h) => { a[h.kind] = (a[h.kind] ?? 0) + 1; return a; }, {});
  console.log("종류별:", byKind, "\n");
  for (const h of all) {
    console.log(`${String(h.line).padStart(4)} [${h.kind.padEnd(13)}] ${JSON.stringify(h.text)}`);
  }
}
