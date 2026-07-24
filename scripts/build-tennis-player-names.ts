// 테니스 선수(ATP·WTA top150) 한국어 이름 사전 빌드.
// 흐름:
//   1) ESPN 랭킹 → 선수 id·영문명 수집 (ATP 150 + WTA 150)
//   2) 위키 en→ko langlink 로 정본 한글명 (실측 커버리지 ~21%)
//   3) 미확보분만 Haiku 음역 (외래어표기법)
//   4) data/tennis-player-names.json 멱등 머지 (기존 값 유지, 신규만 추가)
//
// 출력: data/tennis-player-names.json — mac-mini weekly-static-refresh 가 자동 갱신·push.
// 실행: tsx scripts/build-tennis-player-names.ts
// 환경변수: ANTHROPIC_API_KEY (미설정 시 위키분만 저장)

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const OUT = "data/tennis-player-names.json";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const BATCH = 50;

interface Player {
  id: string;
  name: string;
  tour: "ATP" | "WTA";
  rank: number;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

// 1) ESPN 랭킹에서 선수 수집
async function collectPlayers(): Promise<Player[]> {
  const out: Player[] = [];
  for (const tour of ["atp", "wta"] as const) {
    const j = await getJson<{
      rankings?: Array<{ ranks?: Array<{ current?: number; athlete?: { id?: string; displayName?: string } }> }>;
    }>(`https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/rankings`);
    for (const r of j?.rankings?.[0]?.ranks ?? []) {
      const id = r.athlete?.id;
      const name = r.athlete?.displayName;
      if (id && name) out.push({ id, name, tour: tour.toUpperCase() as "ATP" | "WTA", rank: r.current ?? 0 });
    }
  }
  return out;
}

// 2) 위키 en→ko langlink (정본 우선)
async function wikiKoNames(names: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < names.length; i += 40) {
    const chunk = names.slice(i, i + 40);
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks` +
      `&titles=${encodeURIComponent(chunk.join("|"))}&lllang=ko&format=json&redirects=1&lllimit=50`;
    const j = await getJson<{
      query?: {
        redirects?: Array<{ from: string; to: string }>;
        pages?: Record<string, { title?: string; langlinks?: Array<{ "*"?: string }> }>;
      };
    }>(url);
    const q = j?.query;
    if (!q) continue;
    // redirect 정규화 — 요청한 원본 제목으로도 매핑
    const backRef = new Map((q.redirects ?? []).map((r) => [r.to, r.from]));
    for (const p of Object.values(q.pages ?? {})) {
      const ko = p.langlinks?.[0]?.["*"];
      if (!p.title || !ko) continue;
      const clean = ko.replace(/\s*\(.*\)\s*$/, "").trim();
      map.set(p.title, clean);
      const orig = backRef.get(p.title);
      if (orig) map.set(orig, clean);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return map;
}

// 3) Haiku 음역 (위키 미확보분)
async function haikuTranslit(names: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ANTHROPIC_KEY || names.length === 0) return map;
  for (let i = 0; i < names.length; i += BATCH) {
    const chunk = names.slice(i, i + BATCH);
    const prompt =
      `다음 테니스 선수 이름을 한국어 외래어표기법으로 음역해줘.\n` +
      `- 각 줄 "원문|한글" 형식, 다른 말 금지\n` +
      `- 국적을 고려한 발음 (예: Mensik=체코, Vacherot=프랑스, Bublik=카자흐)\n` +
      `- 이미 널리 쓰이는 표기가 있으면 그것을 우선\n\n` +
      chunk.join("\n");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const j = (await res.json()) as { content?: Array<{ text?: string }> };
      const text = j.content?.[0]?.text ?? "";
      for (const line of text.split("\n")) {
        const [en, ko] = line.split("|").map((s) => s?.trim());
        if (en && ko && /[가-힣]/.test(ko)) map.set(en, ko);
      }
      console.log(`  Haiku ${i + chunk.length}/${names.length}`);
    } catch (e) {
      console.warn("  Haiku 실패:", (e as Error).message);
    }
  }
  return map;
}

async function main() {
  const players = await collectPlayers();
  console.log(`ESPN 랭킹 선수: ${players.length}명`);
  if (players.length === 0) {
    console.error("❌ 선수 0명 — ESPN 응답 확인 필요. 기존 사전 유지하고 종료.");
    process.exit(1);
  }

  const outPath = resolve(OUT);
  // 멱등 머지 — 기존 사전 유지(수동 교정 보존), 신규만 추가
  const prev: Record<string, string> = existsSync(outPath)
    ? JSON.parse(readFileSync(outPath, "utf8"))
    : {};

  const need = players.filter((p) => !prev[p.id]);
  console.log(`기존 ${Object.keys(prev).length}명 / 신규 필요 ${need.length}명`);

  if (need.length > 0) {
    const wiki = await wikiKoNames(need.map((p) => p.name));
    const wikiHit = need.filter((p) => wiki.has(p.name));
    console.log(`위키 확보: ${wikiHit.length}/${need.length}`);

    const rest = need.filter((p) => !wiki.has(p.name));
    const haiku = await haikuTranslit(rest.map((p) => p.name));
    console.log(`Haiku 확보: ${haiku.size}/${rest.length}`);

    for (const p of need) {
      const ko = wiki.get(p.name) ?? haiku.get(p.name);
      if (ko) prev[p.id] = ko;
    }
  }

  const sorted = Object.fromEntries(Object.entries(prev).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(outPath, JSON.stringify(sorted, null, 2) + "\n");
  const covered = players.filter((p) => sorted[p.id]).length;
  console.log(`✅ ${OUT} — 총 ${Object.keys(sorted).length}명 저장 (현재 랭킹 커버 ${covered}/${players.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
