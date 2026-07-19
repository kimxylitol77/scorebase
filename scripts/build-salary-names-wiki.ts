// 급여 랭킹 선수 한글명 위키 정본 동기 (MLB/NBA/NHL) — PlayerSalary+로스터 전체 이름을 en위키 ko langlinks 로 조회.
// 축구 apply-wiki-club-names.ts 의 북미 종목판. 동명이인 가드: disambiguation 제외 + description 종목 키워드 필수 +
// 접미사 재시도((baseball)/(basketball)/(ice hockey)...) + intitle 검색 fallback. 모호(후보 2+)·미확인은 보류(수동 검토).
// 산출: ① 종목별 위키 사전 파일 병합 재생성(기존 항목 유지, 위키 최신값 우선)
//      ② MLB 만 TheSportsPlayer.nameKo 교정(정규화 유일일치만) ③ 로스터 json 의 ko 를 사전값으로 동기.
// --apply 없으면 dry-run(파일·DB 무변경).
// 실행: npx tsx --env-file=.env.local scripts/build-salary-names-wiki.ts mlb nba nhl [--apply]
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const UA = "scorebase-bot/1.0 (+https://scorebase.kr; admin@scorebase.kr)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface KoJsonSync {
  path: string; // repo-relative
  nameKey: string; // 영문명 필드
  koKey: string; // 한글명 필드
}
interface LeagueCfg {
  salaryLeague: string;
  tsSport: string | null; // TheSportsPlayer.nameKo 교정 대상 sport (MLB 만)
  dictPath: string; // repo-relative 사전 파일
  constName: string;
  guard: RegExp; // en위키 description 종목 키워드
  keyword: string; // 검색 fallback 키워드
  suffixes: string[]; // "이름 (접미사)" 재시도
  extraNameFiles: KoJsonSync[]; // 로스터 json — 이름 추가 수집 + ko 동기 대상
  skipEn: string[]; // 위키 표제어가 개명·귀화명 등이라 채택하지 않는 예외
}

const LEAGUES: Record<string, LeagueCfg> = {
  mlb: {
    salaryLeague: "MLB",
    tsSport: "MLB",
    dictPath: "src/lib/sports/mlb-player-names.ts",
    constName: "MLB_PLAYER_NAMES_KO",
    guard: /baseball/i,
    keyword: "baseball",
    suffixes: ["baseball", "baseball player", "pitcher", "catcher", "infielder", "outfielder"],
    extraNameFiles: [],
    skipEn: [],
  },
  nba: {
    salaryLeague: "NBA",
    tsSport: null,
    dictPath: "src/lib/sports/nba-player-names-wiki.ts",
    constName: "NBA_PLAYER_NAMES_WIKI_KO",
    guard: /basketball/i,
    keyword: "basketball",
    suffixes: ["basketball", "basketball player"],
    extraNameFiles: [{ path: "data/nba-players.json", nameKey: "name", koKey: "ko" }],
    skipEn: ["Kyle Anderson"], // 위키 표제어=리카이얼(중국 귀화명) — NBA 표기 카일 앤더슨 유지
  },
  nhl: {
    salaryLeague: "NHL",
    tsSport: null,
    dictPath: "src/lib/sports/nhl-player-names-wiki.ts",
    constName: "NHL_PLAYER_NAMES_WIKI_KO",
    guard: /(ice )?hockey/i,
    keyword: "ice hockey",
    suffixes: ["ice hockey", "ice hockey player"],
    extraNameFiles: [
      { path: "data/nhl-players.json", nameKey: "name", koKey: "ko" },
      { path: "data/nhl-player-names-haiku.json", nameKey: "en", koKey: "ko" },
    ],
    skipEn: [],
  },
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ko 표제어 정리 — 괄호 접미("(야구 선수)", "(1992년)" 등) 제거, 한글 미포함이면 null.
function cleanKo(title: string): string | null {
  const ko = title.replace(/\s*\([^)]*\)\s*$/, "").replace(/ /g, " ").trim();
  if (!ko || !/[가-힣]/.test(ko)) return null;
  return ko;
}

interface WikiPage {
  title: string;
  missing?: boolean;
  description?: string;
  pageprops?: { disambiguation?: string };
  langlinks?: Array<{ lang: string; title: string }>;
}
interface WikiResp {
  query?: {
    pages?: WikiPage[];
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
  };
}

type Verdict =
  | { status: "ok"; ko: string; enTitle: string; desc: string }
  | { status: "no-ko" | "not-sport" | "disambig" | "missing" | "no-desc" };

// 제목 배치 조회 → 제목별 판정. redirects/normalized 역추적으로 입력 제목 기준 키.
async function wikiVerdicts(titles: string[], guard: RegExp): Promise<Map<string, Verdict>> {
  const out = new Map<string, Verdict>();
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks%7Cdescription%7Cpageprops` +
      `&ppprop=disambiguation&lllang=ko&lllimit=max&redirects=1&format=json&formatversion=2` +
      `&titles=${encodeURIComponent(chunk.join("|"))}`;
    let data: WikiResp | null = null;
    for (let a = 0; a < 4; a++) {
      try {
        const res = await fetch(url, { headers: { "user-agent": UA } });
        if (res.ok) { data = (await res.json()) as WikiResp; break; }
        console.error(`  ! HTTP ${res.status}, retry ${a + 1}`);
      } catch (e) {
        console.error(`  ! fetch 실패, retry ${a + 1}: ${(e as Error).message}`);
      }
      await sleep(2500);
    }
    if (!data) continue;
    const back = new Map<string, string>();
    for (const r of data.query?.normalized ?? []) back.set(r.to, r.from);
    for (const r of data.query?.redirects ?? []) back.set(r.to, r.from);
    for (const p of data.query?.pages ?? []) {
      let orig = p.title;
      const seen = new Set<string>();
      while (back.has(orig) && !seen.has(orig)) { seen.add(orig); orig = back.get(orig)!; }
      if (p.missing) { out.set(orig, { status: "missing" }); continue; }
      if (p.pageprops?.disambiguation !== undefined) { out.set(orig, { status: "disambig" }); continue; }
      const desc = p.description ?? "";
      if (!desc) { out.set(orig, { status: "no-desc" }); continue; }
      if (!guard.test(desc)) { out.set(orig, { status: "not-sport" }); continue; }
      const koRaw = p.langlinks?.find((l) => l.lang === "ko")?.title;
      const ko = koRaw ? cleanKo(koRaw) : null;
      if (!ko) { out.set(orig, { status: "no-ko" }); continue; }
      out.set(orig, { status: "ok", ko, enTitle: p.title, desc });
    }
    process.stdout.write(".");
    await sleep(250);
  }
  return out;
}

// intitle 검색 fallback — "이름 (xxx)" 형태 후보 수집.
async function searchCandidates(name: string, keyword: string): Promise<string[]> {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=8&format=json&formatversion=2` +
    `&srsearch=${encodeURIComponent(`intitle:"${name}" ${keyword}`)}`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) return [];
    const data = (await res.json()) as { query?: { search?: Array<{ title: string }> } };
    return (data.query?.search ?? [])
      .map((s) => s.title)
      .filter((t) => t === name || t.startsWith(`${name} (`));
  } catch {
    return [];
  }
}

function loadExistingDict(path: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(path)) return out;
  const content = readFileSync(path, "utf8");
  for (const m of content.matchAll(/"((?:[^"\\]|\\.)+)":\s*"((?:[^"\\]|\\.)+)",/g)) {
    out.set(m[1].replace(/\\"/g, '"'), m[2].replace(/\\"/g, '"'));
  }
  return out;
}

function writeDict(cfg: LeagueCfg, path: string, dict: Map<string, string>) {
  const sorted = [...dict.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const body = sorted
    .map(([en, ko]) => `  "${en.replace(/"/g, '\\"')}": "${ko.replace(/"/g, '\\"')}",`)
    .join("\n");
  const file = `// ${cfg.salaryLeague} 선수 영문 → 한국어 사전.
// 자동 생성: scripts/build-salary-names-wiki.ts (+ 구 build-player-names-from-wiki.ts)
// Source: 위키피디아 ko langlinks (en.wikipedia.org/w/api.php?prop=langlinks&lllang=ko)

export const ${cfg.constName}: Record<string, string> = {
${body}
};
`;
  writeFileSync(path, file);
  console.log(`✓ ${path} (${sorted.length} entries)`);
}

async function runLeague(key: string) {
  const cfg = LEAGUES[key];
  const root = resolve(__dirname, "..");
  console.log(`\n========== ${cfg.salaryLeague} ==========`);

  // 1) 대상 이름 수집 — 급여 랭킹 + (있으면) TheSportsPlayer + 로스터 json.
  const salaryRows = await prisma.playerSalary.findMany({
    where: { league: cfg.salaryLeague },
    select: { playerName: true },
  });
  const tsPlayers = cfg.tsSport
    ? await prisma.theSportsPlayer.findMany({
        where: { sport: cfg.tsSport },
        select: { id: true, name: true, nameKo: true },
      })
    : [];
  const nameSet = new Set<string>([...salaryRows.map((r) => r.playerName), ...tsPlayers.map((p) => p.name)]);
  for (const f of cfg.extraNameFiles) {
    const full = resolve(root, f.path);
    if (!existsSync(full)) continue;
    const j = JSON.parse(readFileSync(full, "utf8")) as Record<string, Record<string, unknown>>;
    for (const e of Object.values(j)) {
      const n = e?.[f.nameKey];
      if (typeof n === "string" && n.trim()) nameSet.add(n.trim());
    }
  }
  const names = [...nameSet].map((n) => n.trim()).filter(Boolean);
  console.log(`대상: salary ${salaryRows.length} + ts ${tsPlayers.length} + 로스터 → 고유 ${names.length}명`);

  // 2) 1차 배치 — 이름 그대로.
  console.log("▶ 1차 langlinks 배치");
  const resolved = new Map<string, { ko: string; enTitle: string }>();
  const hold: Record<string, string[]> = { disambig: [], "not-sport": [], "no-ko": [], missing: [], "no-desc": [], ambiguous: [] };
  const r1 = await wikiVerdicts(names, cfg.guard);
  let unresolved: string[] = [];
  for (const n of names) {
    const v = r1.get(n);
    if (v?.status === "ok") resolved.set(n, { ko: v.ko, enTitle: v.enTitle });
    else unresolved.push(n);
  }
  console.log(`\n1차 확정 ${resolved.size} / 미해결 ${unresolved.length}`);

  // 3) 접미사 재시도 라운드 — disambig·타인물·미존재 이름에 "(종목)" 류 붙여 재조회.
  for (const suf of cfg.suffixes) {
    if (!unresolved.length) break;
    const titleFor = new Map(unresolved.map((n) => [`${n} (${suf})`, n]));
    const vs = await wikiVerdicts([...titleFor.keys()], cfg.guard);
    const still: string[] = [];
    for (const [title, base] of titleFor) {
      const v = vs.get(title);
      if (v?.status === "ok") resolved.set(base, { ko: v.ko, enTitle: v.enTitle });
      else still.push(base);
    }
    unresolved = still;
    console.log(`\n  (${suf}) 후 확정 ${resolved.size} / 미해결 ${unresolved.length}`);
  }

  // 4) 검색 fallback — 남은 이름 intitle 검색, 종목 후보 정확히 1명일 때만 채택.
  console.log("▶ 검색 fallback");
  const still: string[] = [];
  for (const n of unresolved) {
    const cands = await searchCandidates(n, cfg.keyword);
    await sleep(300);
    if (!cands.length) { still.push(n); continue; }
    const vs = await wikiVerdicts(cands, cfg.guard);
    const oks = [...vs.values()].filter((v): v is Extract<Verdict, { status: "ok" }> => v.status === "ok");
    if (oks.length === 1) resolved.set(n, { ko: oks[0].ko, enTitle: oks[0].enTitle });
    else if (oks.length > 1) { hold.ambiguous.push(`${n} ← ${oks.map((o) => o.enTitle).join(" / ")}`); still.push(n); }
    else still.push(n);
  }
  unresolved = still;
  for (const n of unresolved) {
    const v = r1.get(n);
    if (v && v.status !== "ok") hold[v.status]?.push(n);
  }
  for (const s of cfg.skipEn) {
    if (resolved.delete(s)) console.log(`예외 제외: ${s}`);
  }
  console.log(`최종 확정 ${resolved.size} / 보류 ${unresolved.length}`);

  // 5) 사전 파일 병합 — 기존 항목 유지, 이번 위키값 우선.
  const dictFull = resolve(root, cfg.dictPath);
  const dict = loadExistingDict(dictFull);
  const before = dict.size;
  let dictChanged = 0;
  for (const [en, { ko }] of resolved) {
    if (dict.get(en) !== ko) { dict.set(en, ko); dictChanged++; }
  }
  console.log(`사전: 기존 ${before} → ${dict.size} (변경/추가 ${dictChanged})`);

  // 6) DB 교정 (tsSport 리그만) — 정규화 유일일치만.
  const changes: { id: string; en: string; from: string | null; to: string }[] = [];
  if (cfg.tsSport) {
    const idx = new Map<string, typeof tsPlayers>();
    for (const p of tsPlayers) {
      const k = norm(p.name);
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k)!.push(p);
    }
    let same = 0, ambiguousDb = 0, notInDb = 0;
    for (const [en, { ko }] of resolved) {
      const hits = idx.get(norm(en)) ?? [];
      if (hits.length === 0) { notInDb++; continue; }
      if (hits.length > 1) { ambiguousDb++; hold.ambiguous.push(`(DB동명) ${en}`); continue; }
      const p = hits[0];
      if (p.nameKo === ko) { same++; continue; }
      changes.push({ id: p.id, en, from: p.nameKo, to: ko });
    }
    console.log(`\nDB: 교정 ${changes.length} / 동일 ${same} / DB동명 ${ambiguousDb} / DB미존재 ${notInDb}`);
    console.log("\nDB 교정 목록 (전체):");
    for (const c of changes) console.log(`  ${c.en}: ${c.from ?? "(null)"} → ${c.to}`);
  }

  // 7) 로스터 json ko 동기 — 사전 확정값과 다르면 교체.
  const jsonPlans: { path: string; full: string; next: Record<string, Record<string, unknown>>; diffs: string[] }[] = [];
  for (const f of cfg.extraNameFiles) {
    const full = resolve(root, f.path);
    if (!existsSync(full)) continue;
    const j = JSON.parse(readFileSync(full, "utf8")) as Record<string, Record<string, unknown>>;
    const diffs: string[] = [];
    for (const e of Object.values(j)) {
      const en = e?.[f.nameKey];
      if (typeof en !== "string") continue;
      const wiki = resolved.get(en.trim())?.ko ?? dict.get(en.trim());
      if (wiki && e[f.koKey] !== wiki) {
        diffs.push(`${en}: ${String(e[f.koKey])} → ${wiki}`);
        e[f.koKey] = wiki;
      }
    }
    if (diffs.length) jsonPlans.push({ path: f.path, full, next: j, diffs });
    console.log(`json ${f.path}: ko 교체 ${diffs.length}건`);
    for (const d of diffs.slice(0, 30)) console.log(`  ${d}`);
    if (diffs.length > 30) console.log(`  … 외 ${diffs.length - 30}건`);
  }

  for (const [k, arr] of Object.entries(hold)) {
    if (!arr.length) continue;
    console.log(`\n보류 [${k}] ${arr.length}건: ${arr.slice(0, 40).join(", ")}${arr.length > 40 ? " …" : ""}`);
  }

  if (!APPLY) {
    console.log("\n(dry-run — --apply 로 사전 파일·json·DB 반영)");
    return;
  }
  writeDict(cfg, dictFull, dict);
  for (const plan of jsonPlans) {
    writeFileSync(plan.full, JSON.stringify(plan.next, null, 1) + "\n");
    console.log(`✓ ${plan.path} ko ${plan.diffs.length}건 반영`);
  }
  for (let i = 0; i < changes.length; i += 50) {
    await prisma.$transaction(
      changes.slice(i, i + 50).map((c) =>
        prisma.theSportsPlayer.update({ where: { id: c.id }, data: { nameKo: c.to } }),
      ),
    );
  }
  if (changes.length) console.log(`✓ DB nameKo ${changes.length}건 반영`);
}

async function main() {
  const keys = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((k) => k.toLowerCase());
  if (!keys.length || keys.some((k) => !LEAGUES[k])) {
    console.error("사용법: build-salary-names-wiki.ts <mlb|nba|nhl>... [--apply]");
    process.exit(1);
  }
  for (const k of keys) await runLeague(k);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
