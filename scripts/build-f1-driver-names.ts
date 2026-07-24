// F1 드라이버 한국어 이름 사전 빌드 → data/f1-driver-names.json
// ESPN 챔피언십 standings 의 드라이버 → 위키 ko langlink → 미확보분 Haiku 음역.
// 팀명은 11개 고정이라 코드 상수(src/lib/sports/espn-f1.ts F1_TEAM_KO)로 관리.
//
// 실행: tsx scripts/build-f1-driver-names.ts [연도]
// 환경변수: ANTHROPIC_API_KEY (없으면 위키분만)

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const YEAR = process.argv[2] ?? String(new Date().getFullYear());
const OUT = "data/f1-driver-names.json";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

interface RefItem {
  $ref?: string;
}
interface StandingsRoot {
  items?: RefItem[];
}
interface StandingsGroup {
  standings?: Array<{ athlete?: RefItem }>;
}

async function collectDrivers(): Promise<{ id: string; name: string }[]> {
  const root = await getJson<StandingsRoot>(
    `https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/${YEAR}/types/2/standings`,
  );
  const driverRef = root?.items?.[0]?.$ref;
  if (!driverRef) return [];
  const grp = await getJson<StandingsGroup>(driverRef);
  const out: { id: string; name: string }[] = [];
  for (const row of grp?.standings ?? []) {
    if (!row.athlete?.$ref) continue;
    const a = await getJson<{ id?: string; displayName?: string }>(row.athlete.$ref);
    if (a?.id && a?.displayName) out.push({ id: a.id, name: a.displayName });
  }
  return out;
}

async function wikiKo(names: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < names.length; i += 40) {
    const chunk = names.slice(i, i + 40);
    const j = await getJson<{
      query?: {
        redirects?: Array<{ from: string; to: string }>;
        pages?: Record<string, { title?: string; langlinks?: Array<{ "*"?: string }> }>;
      };
    }>(
      `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&titles=${encodeURIComponent(chunk.join("|"))}&lllang=ko&format=json&redirects=1&lllimit=50`,
    );
    const q = j?.query;
    if (!q) continue;
    const back = new Map((q.redirects ?? []).map((r) => [r.to, r.from]));
    for (const p of Object.values(q.pages ?? {})) {
      const ko = p.langlinks?.[0]?.["*"];
      if (!p.title || !ko) continue;
      const clean = ko.replace(/\s*\(.*\)\s*$/, "").trim();
      map.set(p.title, clean);
      const orig = back.get(p.title);
      if (orig) map.set(orig, clean);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return map;
}

async function haiku(names: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ANTHROPIC_KEY || names.length === 0) return map;
  const prompt =
    `다음 F1 드라이버 이름을 한국어 외래어표기법으로 음역해줘.\n` +
    `- 각 줄 "원문|한글" 형식, 다른 말 금지\n` +
    `- 국적 발음 반영 (예: Verstappen=네덜란드 "막스 페르스타펀", Leclerc=모나코/프랑스어 "샤를 르클레르")\n` +
    `- 널리 쓰이는 표기가 있으면 우선\n\n` +
    names.join("\n");
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
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const j = (await res.json()) as { content?: Array<{ text?: string }> };
    for (const line of (j.content?.[0]?.text ?? "").split("\n")) {
      const [en, ko] = line.split("|").map((s) => s?.trim());
      if (en && ko && /[가-힣]/.test(ko)) map.set(en, ko);
    }
  } catch (e) {
    console.warn("Haiku 실패:", (e as Error).message);
  }
  return map;
}

async function main() {
  const drivers = await collectDrivers();
  console.log(`${YEAR} 시즌 드라이버: ${drivers.length}명`);
  if (drivers.length === 0) {
    console.error("❌ 드라이버 0명 — ESPN 응답 확인. 기존 파일 유지하고 종료.");
    process.exit(1);
  }

  const outPath = resolve(OUT);
  const prev: Record<string, string> = existsSync(outPath)
    ? JSON.parse(readFileSync(outPath, "utf8"))
    : {};
  const need = drivers.filter((d) => !prev[d.id]);
  console.log(`기존 ${Object.keys(prev).length}명 / 신규 필요 ${need.length}명`);

  if (need.length > 0) {
    const w = await wikiKo(need.map((d) => d.name));
    console.log(`  위키 확보 ${need.filter((d) => w.has(d.name)).length}/${need.length}`);
    const rest = need.filter((d) => !w.has(d.name));
    const h = await haiku(rest.map((d) => d.name));
    console.log(`  Haiku 확보 ${h.size}/${rest.length}`);
    for (const d of need) {
      const ko = w.get(d.name) ?? h.get(d.name);
      if (ko) prev[d.id] = ko;
    }
  }

  const sorted = Object.fromEntries(Object.entries(prev).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(outPath, JSON.stringify(sorted, null, 2) + "\n");
  const covered = drivers.filter((d) => sorted[d.id]).length;
  console.log(`✅ ${OUT} — ${Object.keys(sorted).length}명 저장 (현재 시즌 커버 ${covered}/${drivers.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
