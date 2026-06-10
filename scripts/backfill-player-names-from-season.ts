// 리그 단위 선수 한글명·사진 백필 — TheSports season player stat 방식 영구화.
// (라인업 cache 에 안 나오는 리그/선수용 — 2026-06-09 Serie A 87명 1회 복구 방식의 스크립트화)
//
// 흐름: league-id-mapping.json 의 tsSeasonId → /v1/football/season/recent/player/stat
//       → { id, name, logo } 수집 → nameKo 없는 선수만 Haiku 음역 → TheSportsPlayer upsert
//       → player.logo 는 data/player-photos.json 에 merge (없는 id 만, compact 한 줄 형식 유지)
//
// 실행: env -u ANTHROPIC_API_KEY npx tsx scripts/backfill-player-names-from-season.ts K_LEAGUE_1 SAUDI_PL MLS
// whitelisted IP 필요(맥북 OK, Vercel ❌). 멱등 — nameKo 있는 선수 skip.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
dotenv.config();
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const BATCH = 50;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const LEAGUES = process.argv.slice(2);
const MAPPING = path.join(__dirname, "..", "src", "lib", "sports", "thesports", "league-id-mapping.json");
const PHOTOS = path.join(__dirname, "..", "data", "player-photos.json");

if (!ANTHROPIC_KEY) { console.error("❌ ANTHROPIC_API_KEY 미설정 (env -u ANTHROPIC_API_KEY 로 실행)"); process.exit(1); }
if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS_USER/SECRET 미설정"); process.exit(1); }
if (LEAGUES.length === 0) { console.error("사용법: ... backfill-player-names-from-season.ts K_LEAGUE_1 SAUDI_PL MLS"); process.exit(1); }

interface SeasonPlayer { player?: { id?: string; name?: string; logo?: string; position?: string } }
interface AnthropicResp { content?: Array<{ text?: string }> }

async function fetchSeasonPlayers(seasonId: string): Promise<Array<{ id: string; name: string; logo: string | null; position: string | null }>> {
  const r = await fetch(
    `https://api.thesports.com/v1/football/season/recent/player/stat?uuid=${seasonId}&user=${TS_USER}&secret=${TS_SECRET}`,
    { signal: AbortSignal.timeout(30000) },
  );
  const d = (await r.json()) as { code?: number; results?: SeasonPlayer[] };
  if (d.code !== 0 || !Array.isArray(d.results)) return [];
  const out: Array<{ id: string; name: string; logo: string | null; position: string | null }> = [];
  for (const row of d.results) {
    const p = row.player;
    if (p?.id && p?.name) out.push({ id: p.id, name: p.name.trim(), logo: p.logo || null, position: p.position || null });
  }
  return out;
}

async function haikuTranslate(batch: Array<{ id: string; en: string }>): Promise<Record<string, string>> {
  const prompt =
    `다음 축구 선수 영문/로마자 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
    `국적이 다양합니다 (한국·유럽·남미·아프리카·중동·북미 등) — 각 국적의 한국어 관용 표기를 따르세요.\n` +
    `- 한국 선수: 로마자 → 한국 이름 직접 매핑 + 두음법칙. "Lee Kang-In"→이강인, "Roh"→노, "Ryu"→류\n` +
    `- 브라질: 현지 발음. "Vinicius"→비니시우스\n` +
    `- 중동(사우디 등 아랍권): 한국 언론 관용 표기. "Salem Al-Dawsari"→살렘 알다우사리\n` +
    `- 유럽/북미: 관용 표기. "Mbappe"→음바페, "Messi"→메시\n` +
    `- 풀네임이면 한국 미디어 핵심 표기.\n` +
    `- 자신없으면 그 entry 제외 (틀린 음역보다 누락이 낫습니다).\n\n` +
    `선수 list:\n` +
    batch.map((b, i) => `${i + 1}. "${b.en}"`).join("\n") +
    `\n\n출력 — JSON 객체 한 줄만 (설명 X). key 는 위 영문 그대로:\n` +
    `{"Lee Kang-In": "이강인", "Salem Al-Dawsari": "살렘 알다우사리"}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) { console.warn(`! Haiku ${res.status}`); return {}; }
    const data = (await res.json()) as AnthropicResp;
    const m = (data?.content?.[0]?.text ?? "").match(/\{[\s\S]*\}/);
    if (!m) return {};
    const obj = JSON.parse(m[0]) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [en, ko] of Object.entries(obj)) {
      if (typeof ko !== "string") continue;
      const s = ko.trim();
      if (!s || !/[가-힣]/.test(s)) continue;
      const cjk = s.match(/[一-鿿]/g);
      if (cjk && cjk.length >= 2) continue;
      out[en] = s;
    }
    return out;
  } catch (e) {
    console.warn(`! Haiku err: ${(e as Error).message}`);
    return {};
  }
}

async function main() {
  const prisma = new PrismaClient();
  const mapping = JSON.parse(fs.readFileSync(MAPPING, "utf8")) as Array<{ code: string; tsSeasonId?: string }>;
  const photos: Record<string, string> = fs.existsSync(PHOTOS) ? JSON.parse(fs.readFileSync(PHOTOS, "utf8")) : {};
  let photoAdded = 0;

  for (const code of LEAGUES) {
    const m = mapping.find((x) => x.code === code);
    if (!m?.tsSeasonId) { console.error(`! ${code}: tsSeasonId 없음 — skip`); continue; }
    const players = await fetchSeasonPlayers(m.tsSeasonId);
    console.log(`[${code}] season 선수 ${players.length}`);
    if (players.length === 0) continue;

    // 사진 merge — photos json 에 없는 id 만
    for (const p of players) {
      if (p.logo && !photos[p.id]) { photos[p.id] = p.logo; photoAdded++; }
    }

    // nameKo 이미 있는 선수 skip
    const existing = await prisma.theSportsPlayer.findMany({
      where: { id: { in: players.map((p) => p.id) }, nameKo: { not: null } },
      select: { id: true },
    });
    const have = new Set(existing.map((e) => e.id));
    const todo = players.filter((p) => !have.has(p.id));
    console.log(`[${code}] 이미 매핑 ${have.size}, 신규 ${todo.length}`);

    const enToKo: Record<string, string> = {};
    for (let i = 0; i < todo.length; i += BATCH) {
      const chunk = todo.slice(i, i + BATCH).map((p) => ({ id: p.id, en: p.name }));
      const r = await haikuTranslate(chunk);
      Object.assign(enToKo, r);
      process.stdout.write(`  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(todo.length / BATCH)} +${Object.keys(r).length}\n`);
      await new Promise((res) => setTimeout(res, 500));
    }

    let upserted = 0;
    for (const p of todo) {
      const ko = enToKo[p.name];
      try {
        await prisma.theSportsPlayer.upsert({
          where: { id: p.id },
          // ko 없어도 영문명·사진은 채움 (이름 미상 "선수" placeholder 방지)
          update: { name: p.name, ...(ko ? { nameKo: ko } : {}), ...(p.logo ? { photoUrl: p.logo } : {}), ...(p.position ? { position: p.position } : {}) },
          create: { id: p.id, name: p.name, nameKo: ko ?? null, photoUrl: p.logo, position: p.position, sport: "FOOTBALL" },
        });
        upserted++;
      } catch { /* skip */ }
    }
    console.log(`[${code}] ✓ upsert ${upserted} (한글 ${Object.keys(enToKo).length})`);
    await new Promise((res) => setTimeout(res, 500));
  }

  // compact 한 줄 형식 유지 (기존 파일 포맷)
  fs.writeFileSync(PHOTOS, JSON.stringify(photos) + "\n");
  console.log(`✓ player-photos.json +${photoAdded} (총 ${Object.keys(photos).length})`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
