// 8리그 감독 수집 — TheSports coach/list 전량 iterate → 우리 팀 필터 → Haiku 한글명
// → data/team-coaches.json { tsTeamId: { name, nameKo, logo, age, nationality, countryKo,
//   preferredFormation, joined, contractUntil } }
//
// /transfers view=team 감독 카드용. whitelisted IP 필요(맥북 OK). 멱등(전체 갱신).
// 감독 교체기(시즌 중)엔 재실행으로 갱신.
//
//   env -u ANTHROPIC_API_KEY npx tsx scripts/build-team-coaches.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
dotenv.config();
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const OUT = path.join(__dirname, "..", "data", "team-coaches.json");
const EXPANSION: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "transfer-league-teams.json"), "utf8"),
);
const BIG5 = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env"); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error("❌ ANTHROPIC_API_KEY (env -u ANTHROPIC_API_KEY 로 실행)"); process.exit(1); }

interface CoachRow {
  id: string; team_id?: string; name?: string; logo?: string; type?: number;
  age?: number; nationality?: string; preferred_formation?: string;
  joined?: number; contract_until?: number; updated_at?: number;
}

async function fetchAllCoaches(): Promise<CoachRow[]> {
  const all: CoachRow[] = [];
  for (let page = 1; page <= 400; page++) {
    const r = await fetch(
      `https://api.thesports.com/v1/football/coach/list?user=${TS_USER}&secret=${TS_SECRET}&page=${page}`,
      { signal: AbortSignal.timeout(25000) },
    );
    const d = (await r.json()) as { code?: number; results?: CoachRow[] };
    const rows = d.results ?? [];
    all.push(...rows);
    if (rows.length < 1000) break;
    await new Promise((res) => setTimeout(res, 500));
  }
  return all;
}

async function haikuTranslate(names: string[]): Promise<Record<string, string>> {
  const prompt =
    `다음 축구 감독 영문 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
    `한국 언론 관용 표기를 따르세요 (예: "Pep Guardiola"→펩 과르디올라, "Mikel Arteta"→미켈 아르테타,\n` +
    `"Thomas Frank"→토마스 프랑크, 한국인 감독은 그대로: "Kim Gi-dong"→김기동).\n` +
    `자신없으면 그 entry 제외.\n\n` +
    names.map((n, i) => `${i + 1}. "${n}"`).join("\n") +
    `\n\n출력 — JSON 객체 한 줄만: {"Pep Guardiola": "펩 과르디올라"}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) { console.warn(`! Haiku ${res.status}`); return {}; }
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    const m = (data?.content?.[0]?.text ?? "").match(/\{[\s\S]*\}/);
    if (!m) return {};
    const obj = JSON.parse(m[0]) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [en, ko] of Object.entries(obj)) {
      if (typeof ko === "string" && /[가-힣]/.test(ko.trim())) out[en] = ko.trim();
    }
    return out;
  } catch { return {}; }
}

async function main() {
  const big5Rows = await prisma.teamSourceId.findMany({
    where: { source: "thesports", team: { league: { in: BIG5 } } },
    select: { externalId: true },
  });
  const ourTeams = new Set([...big5Rows.map((r) => r.externalId), ...Object.keys(EXPANSION)]);
  await prisma.$disconnect();

  const coaches = await fetchAllCoaches();
  console.log(`coach/list 전체 ${coaches.length}`);
  // type=1 이 현직 감독(head coach) — 같은 팀 복수면 updated_at 최신.
  const byTeam = new Map<string, CoachRow>();
  for (const c of coaches) {
    if (!c.team_id || !ourTeams.has(c.team_id) || !c.name) continue;
    if (c.type !== 1) continue;
    const cur = byTeam.get(c.team_id);
    if (!cur || (c.updated_at ?? 0) > (cur.updated_at ?? 0)) byTeam.set(c.team_id, c);
  }
  console.log(`우리 팀 감독 ${byTeam.size}/${ourTeams.size}`);

  const names = [...new Set([...byTeam.values()].map((c) => c.name!))];
  const enToKo: Record<string, string> = {};
  for (let i = 0; i < names.length; i += 50) {
    Object.assign(enToKo, await haikuTranslate(names.slice(i, i + 50)));
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`한글명 ${Object.keys(enToKo).length}/${names.length}`);

  const out: Record<string, unknown> = {};
  for (const [tid, c] of byTeam) {
    out[tid] = {
      id: c.id,
      name: c.name,
      nameKo: enToKo[c.name!] ?? null,
      logo: c.logo || null,
      age: c.age || null,
      nationality: c.nationality || null,
      preferredFormation: c.preferred_formation || null,
      joined: c.joined || null,
      contractUntil: c.contract_until || null,
    };
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`✓ wrote team-coaches.json — ${Object.keys(out).length}팀`);
}

main().catch((e) => { console.error(e); process.exit(1); });
