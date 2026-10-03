// WNBA 선수 영문 → 한국어 사전 빌더 — 위키피디아 ko 표제어(정본) 우선, 없으면 Haiku 음역.
// 이름 소스: ESPN WNBA 이번 시즌 경기 boxscore(--from 부터 오늘까지) + 15개 팀 현재 로스터.
// 위키는 동명이인 오매칭을 막으려고 영문 문서 설명(short description)에 "basketball" 이 있을 때만 채택하고,
//  "{이름} (basketball)" 문서를 먼저 본다.
// 출력: data/wnba-player-names.json { names: {en: ko}, source: {en: "wiki"|"haiku"} } (멱등 머지 — 기존 항목 유지).
//  player-names.ts 가 WNBA 수동 사전(WNBA_PLAYER_NAMES_KO) 다음 순위로 읽는다 — 이미 쓰던 수동 표기는 안 바뀐다.
// 실행: env -u ANTHROPIC_API_KEY npx tsx scripts/build-wnba-player-names.ts [--from=2026-05-01] [--dry]
//  (Claude Code 가 빈 ANTHROPIC_API_KEY 를 주입 → env -u 로 제거 후 .env.local 에서 읽는다)
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { WNBA_PLAYER_NAMES_KO } from "../src/lib/sports/wnba-player-names";

const OUT = resolve("data/wnba-player-names.json");
const UA = "scorebase-bot/1.0 (+https://scorebase.kr; admin@scorebase.kr)";
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba";
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const DRY = process.argv.includes("--dry");
const FROM = new Date(`${arg("from") ?? "2026-05-01"}T00:00:00Z`);
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

// 위키피디아는 연락처 있는 User-Agent 를 요구하고, ESPN 은 그 UA 를 HTML 로 막는다 → 위키에만 붙인다
const getJson = async <T>(url: string): Promise<T | null> => {
  try {
    const headers = url.includes("wikipedia.org") ? { "user-agent": UA } : undefined;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
};

async function collectNames(): Promise<Set<string>> {
  const names = new Set<string>();
  // 현재 로스터
  const teams = await getJson<{ sports?: Array<{ leagues?: Array<{ teams?: Array<{ team: { id: string } }> }> }> }>(`${ESPN}/teams`);
  for (const t of teams?.sports?.[0]?.leagues?.[0]?.teams ?? []) {
    const r = await getJson<{ athletes?: Array<{ displayName?: string }> }>(`${ESPN}/teams/${t.team.id}/roster`);
    for (const a of r?.athletes ?? []) if (a.displayName?.trim()) names.add(a.displayName.trim());
  }
  console.log(`▶ 로스터 ${names.size}명`);
  // 시즌 경기 boxscore — 시즌 중 방출·이적 선수까지
  let games = 0;
  for (let d = new Date(FROM); d <= new Date(); d = new Date(d.getTime() + 86400_000)) {
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
    const sb = await getJson<{ events?: Array<{ id: string }> }>(`${ESPN}/scoreboard?dates=${ymd}`);
    for (const ev of sb?.events ?? []) {
      const s = await getJson<{ boxscore?: { players?: Array<{ statistics?: Array<{ athletes?: Array<{ athlete?: { displayName?: string } }> }> }> } }>(`${ESPN}/summary?event=${ev.id}`);
      for (const team of s?.boxscore?.players ?? [])
        for (const g of team.statistics ?? [])
          for (const a of g.athletes ?? []) if (a.athlete?.displayName?.trim()) names.add(a.athlete.displayName.trim());
      games++;
    }
  }
  console.log(`▶ boxscore ${games}경기 포함 총 ${names.size}명`);
  return names;
}

interface WikiResp {
  query?: {
    pages?: Record<string, { title?: string; description?: string; langlinks?: Array<{ "*"?: string }>; missing?: string }>;
    redirects?: Array<{ from: string; to: string }>;
    normalized?: Array<{ from: string; to: string }>;
  };
}

/** 제목 목록 → (입력 제목 → ko 표제어), 영문 설명에 basketball 이 있는 문서만 */
async function wikiLookup(titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks|description&lllang=ko&lllimit=50&redirects=1&format=json&titles=${encodeURIComponent(chunk.join("|"))}`;
    const data = await getJson<WikiResp>(url);
    const back = new Map<string, string>();
    for (const r of data?.query?.normalized ?? []) back.set(r.to, r.from);
    for (const r of data?.query?.redirects ?? []) back.set(r.to, r.from);
    for (const p of Object.values(data?.query?.pages ?? {})) {
      const ko = p.langlinks?.[0]?.["*"];
      if (!ko || !p.title || !/basketball/i.test(p.description ?? "")) continue;
      let orig = p.title;
      const seen = new Set<string>();
      while (back.has(orig) && !seen.has(orig)) { seen.add(orig); orig = back.get(orig)!; }
      out.set(orig, ko.replace(/\s*\([^)]*\)\s*$/, "")); // "(농구 선수)" 같은 괄호 제거
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return out;
}

async function haiku(batch: string[]): Promise<Record<string, string>> {
  if (!ANTHROPIC_KEY) return {};
  const prompt =
    `다음 WNBA(미국 여자프로농구) 선수 영문 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
    `- 풀네임(이름 성)으로 표기. "Caitlin Clark"→케이틀린 클라크, "A'ja Wilson"→아자 윌슨\n` +
    `- 국제 선수는 현지 발음 관용 표기. "Li Yueru"→리웨루, "Kitija Laksa"→키티야 락사\n` +
    `- 이니셜은 그대로. 자신 없으면 그 entry 제외 (틀린 음역보다 누락이 나음).\n\n` +
    batch.map((en, i) => `${i + 1}. "${en}"`).join("\n") +
    `\n\n출력 — JSON 객체 한 줄(설명 없이), key 는 위 영문 이름 그대로.`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) { console.warn(`! Haiku ${r.status}`); return {}; }
    const text = ((await r.json()) as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    const obj = m ? (JSON.parse(m[0]) as Record<string, unknown>) : {};
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v === "string" && /[가-힣]/.test(v)).map(([k, v]) => [k, (v as string).trim()]));
  } catch (e) {
    console.warn(`! Haiku 실패 ${(e as Error).message}`);
    return {};
  }
}

async function main() {
  const prev = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as { names: Record<string, string>; source: Record<string, string> }) : { names: {}, source: {} };
  const names = prev.names, source = prev.source;
  const all = [...(await collectNames())].filter((n) => !WNBA_PLAYER_NAMES_KO[n]);

  // 1) 위키 — "(basketball)" 문서 우선, 그다음 이름 그대로. 위키는 기존 haiku 항목도 덮는다(정본)
  const wikiTodo = all.filter((n) => source[n] !== "wiki");
  const byBk = await wikiLookup(wikiTodo.map((n) => `${n} (basketball)`));
  const byName = await wikiLookup(wikiTodo);
  let wiki = 0;
  for (const n of wikiTodo) {
    const ko = byBk.get(`${n} (basketball)`) ?? byName.get(n);
    if (ko) { names[n] = ko; source[n] = "wiki"; wiki++; }
  }
  console.log(`▶ 위키 표제어 ${wiki}명`);

  // 2) Haiku — 아직 없는 이름만
  const todo = all.filter((n) => !names[n]);
  let hk = 0;
  for (let i = 0; i < todo.length; i += 50) {
    const got = await haiku(todo.slice(i, i + 50));
    for (const n of todo.slice(i, i + 50)) if (got[n]) { names[n] = got[n]; source[n] = "haiku"; hk++; }
  }
  const left = all.filter((n) => !names[n]);
  console.log(`▶ Haiku 음역 ${hk}명 · 남은 영문 ${left.length}명${left.length ? ` (${left.slice(0, 10).join(", ")})` : ""}`);

  const sort = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort((a, b) => a[0].localeCompare(b[0])));
  const out = { meta: { updatedAt: new Date().toISOString(), count: Object.keys(names).length }, names: sort(names), source: sort(source) };
  if (DRY) console.log(JSON.stringify(out).slice(0, 600));
  else writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`✓ ${DRY ? "(dry) " : ""}${OUT} — ${out.meta.count}명`);
}

main().catch((e) => { console.error(e); process.exit(1); });
