// 모든 공개 page.tsx 의 헤더 주석을 추출해 페이지 인벤토리 JSON 생성.
// /admin/structure 의 "페이지 인벤토리" 섹션이 이 JSON 을 렌더한다.
// predev·prebuild hook 으로 dev 시작·배포 시 자동 실행 (package.json). 수동 재실행: npx tsx scripts/build-pages-inventory.ts
//
// 정책 — data/pages-inventory.json 은 "생성물이지만 커밋한다" 한 가지로 통일한다.
//   이유. /admin/structure 가 이 JSON 을 정적 import 하므로 파일이 없으면 tsc·lint 가 깨진다.
//   부수효과가 아니라 기능. 페이지를 추가/삭제했는데 커밋하지 않으면 git diff 에 그대로 드러난다.
//   → 페이지를 건드렸으면 이 스크립트를 돌리고 결과 JSON 도 같은 커밋에 넣는다.
import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { SPORT_CATEGORIES, COMMUNITY_CATEGORY } from "../src/components/nav-config";

const APP = "src/app";

// nav-config href 집합 — 메뉴 노출 여부 판정 (쿼리스트링 제거).
const menuHrefs = new Set<string>();
for (const cat of [...SPORT_CATEGORIES, COMMUNITY_CATEGORY]) {
  menuHrefs.add(cat.href.split("?")[0]);
  for (const it of cat.items) menuHrefs.add(it.href.split("?")[0]);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e === "page.tsx") out.push(p);
  }
  return out;
}

// src/app/.../page.tsx → URL 경로. route group (auth) 제거, [param] 은 유지.
function routeOf(file: string): string {
  let r = file.replace(/^src\/app/, "").replace(/\/page\.tsx$/, "");
  r = r.replace(/\/\([^)]+\)/g, "");
  return r === "" ? "/" : r;
}

// 첫 // 주석 블록 추출 ('use client'·빈 줄은 건너뜀, import 전까지).
function headerComment(file: string): string {
  const lines = readFileSync(file, "utf8").split("\n");
  const out: string[] = [];
  for (const l of lines) {
    const t = l.trim();
    if (t === "" || t.startsWith("'use") || t.startsWith('"use')) {
      if (out.length) break;
      continue;
    }
    if (t.startsWith("//")) out.push(t.replace(/^\/\/\s?/, ""));
    else break;
  }
  // "/route — 설명" 패턴이면 경로 접두어 제거 (중복 표시 방지)
  return out.join(" ").replace(/^\/\S+\s+[—-]\s+/, "");
}

function groupOf(route: string, inMenu: boolean): string {
  if (route.startsWith("/thesports-prototype")) return "prototype";
  if (route.startsWith("/live/")) return "live";
  if (route.startsWith("/world-cup") || route.startsWith("/national-teams")) return "worldcup";
  if (/\[[^\]]+\]/.test(route)) return "detail";
  if (inMenu) return "menu";
  if (route.startsWith("/predictions")) return "predictions-deep";
  return "other";
}

const files = walk(APP).filter((f) => !f.includes("/admin/"));
const inventory = files
  .map((f) => {
    const route = routeOf(f);
    const inMenu = menuHrefs.has(route);
    return {
      route,
      desc: headerComment(f),
      inMenu,
      dynamic: /\[[^\]]+\]/.test(route),
      group: groupOf(route, inMenu),
    };
  })
  .sort((a, b) => a.route.localeCompare(b.route));

writeFileSync("data/pages-inventory.json", JSON.stringify(inventory, null, 2) + "\n");
const withDesc = inventory.filter((p) => p.desc).length;
console.log(`${inventory.length} pages → data/pages-inventory.json (주석 있음 ${withDesc} / 없음 ${inventory.length - withDesc})`);
