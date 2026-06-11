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

interface TablesResp { code: number; results?: { tables?: Array<{ rows?: Array<{ team_id?: string }> }> } }

async function main() {
  const big5Rows = await prisma.teamSourceId.findMany({
    where: { source: "thesports", team: { league: { in: BIG5 } } },
    select: { externalId: true },
  });
  // 월드컵 국가대표 — TeamSourceId(WORLD_CUP) + WC season 순위표(미매핑 국가 보충)
  const wcRows = await prisma.teamSourceId.findMany({
    where: { source: "thesports", team: { league: "WORLD_CUP" } },
    select: { externalId: true },
  });
  const mapping = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "src", "lib", "sports", "thesports", "league-id-mapping.json"), "utf8"),
  ) as Array<{ code: string; tsSeasonId?: string }>;
  const wcSeason = mapping.find((m) => m.code === "WORLD_CUP")?.tsSeasonId;
  const wcSeasonIds: string[] = [];
  if (wcSeason) {
    try {
      const r = await fetch(
        `https://api.thesports.com/v1/football/season/recent/table/detail?uuid=${wcSeason}&user=${TS_USER}&secret=${TS_SECRET}`,
        { signal: AbortSignal.timeout(25000) },
      );
      const d = (await r.json()) as TablesResp;
      for (const t of d.results?.tables ?? []) for (const row of t.rows ?? []) if (row.team_id) wcSeasonIds.push(row.team_id);
    } catch { /* 보충 실패해도 TeamSourceId 분으로 진행 */ }
  }
  const ourTeams = new Set([
    ...big5Rows.map((r) => r.externalId),
    ...Object.keys(EXPANSION),
    ...wcRows.map((r) => r.externalId),
    ...wcSeasonIds,
  ]);
  console.log(`대상: 빅5 ${big5Rows.length} + 확장 ${Object.keys(EXPANSION).length} + WC ${new Set([...wcRows.map((r) => r.externalId), ...wcSeasonIds]).size}`);

  // ts→af 팀 매핑 — ts coach_id 공백 팀(감독 교체기 데이터 공백)의 api-football 폴백용
  const allMaps = await prisma.teamSourceId.findMany({
    where: { source: { in: ["thesports", "api-football"] } },
    select: { teamId: true, source: true, externalId: true },
  });
  const tsToAf = new Map<string, string>();
  {
    const byTeamId = new Map<number, { ts?: string; af?: string }>();
    for (const m of allMaps) {
      const e = byTeamId.get(m.teamId) ?? {};
      if (m.source === "thesports") e.ts = m.externalId;
      else e.af = m.externalId;
      byTeamId.set(m.teamId, e);
    }
    for (const e of byTeamId.values()) if (e.ts && e.af) tsToAf.set(e.ts, e.af);
  }
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

  // === api-football 폴백 — ts coach/list 가 team_id 를 못 채운 팀 (2026-06 실측:
  // 여름 감독 교체기에 나폴리·맨시티 등 14팀 coach_id='' — ts 1순위, af 는 보충만) ===
  const AF_KEY = process.env.API_FOOTBALL_KEY;
  interface AfCoach {
    name: string; logo: string | null; age: number | null;
    nationality: string | null; joined: number | null;
  }
  const afFallback = new Map<string, AfCoach>();
  const missingTs = [...ourTeams].filter((id) => !byTeam.has(id) && tsToAf.has(id));
  if (AF_KEY && missingTs.length > 0) {
    for (const tsId of missingTs) {
      const afId = tsToAf.get(tsId)!;
      try {
        const r = await fetch(`https://v3.football.api-sports.io/coachs?team=${afId}`, {
          headers: { "x-apisports-key": AF_KEY },
          signal: AbortSignal.timeout(20000),
        });
        const d = (await r.json()) as {
          response?: Array<{
            name?: string; firstname?: string; lastname?: string;
            age?: number; nationality?: string; photo?: string;
            career?: Array<{ team?: { id?: number }; start?: string; end?: string | null }>;
          }>;
        };
        // 이 팀을 "현재"(career end=null) 맡고 있는 감독만 — 과거 감독 오염 방지
        const cur = (d.response ?? []).find((co) =>
          (co.career ?? []).some((k) => String(k.team?.id) === afId && k.end == null),
        );
        if (!cur) continue;
        const stint = (cur.career ?? []).find((k) => String(k.team?.id) === afId && k.end == null);
        // af 의 name 은 "A. Conte" 축약형 — 풀네임(firstname+lastname) 우선해야
        // Haiku 한글 변환("안토니오 콘테")이 제대로 된다
        const nm = [cur.firstname, cur.lastname].filter(Boolean).join(" ") || cur.name;
        if (!nm) continue;
        afFallback.set(tsId, {
          name: nm,
          logo: cur.photo || null,
          age: cur.age ?? null,
          nationality: cur.nationality ?? null,
          joined: stint?.start ? Math.floor(Date.parse(stint.start) / 1000) : null,
        });
        await new Promise((res) => setTimeout(res, 350));
      } catch {
        /* 한 팀 실패는 건너뜀 — ts 분만으로도 동작 */
      }
    }
    console.log(`af 폴백 감독 ${afFallback.size}/${missingTs.length} (ts coach_id 공백 팀)`);
  }

  const names = [
    ...new Set([
      ...[...byTeam.values()].map((c) => c.name!),
      ...[...afFallback.values()].map((c) => c.name),
    ]),
  ];
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
  // af 폴백 병합 — ts 에 없는 팀만 (id 없음 = 감독 상세 페이지 링크는 생기지 않음)
  for (const [tid, c] of afFallback) {
    if (out[tid]) continue;
    out[tid] = {
      name: c.name,
      nameKo: enToKo[c.name] ?? null,
      logo: c.logo,
      age: c.age,
      nationality: c.nationality,
      preferredFormation: null,
      joined: c.joined,
      contractUntil: null,
    };
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`✓ wrote team-coaches.json — ${Object.keys(out).length}팀 (af 폴백 ${afFallback.size} 포함)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
