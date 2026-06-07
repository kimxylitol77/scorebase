// 국가대표 감독 한글화 — TheSports coach/list 영문명 → Claude haiku 음역 → data/coach-names.json.
// 선수(build-football-player-names-haiku)와 동일 패턴. coachId → 한글명 (page 에서 override).
// 실행: env -u ANTHROPIC_API_KEY npx tsx --env-file=.env.local scripts/build-coach-names-haiku.ts
//   (Claude Code 가 빈 ANTHROPIC_API_KEY="" 주입 → env -u 로 제거해야 .env.local 값 로드됨)
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const U = process.env.THESPORTS_USER || "", S = process.env.THESPORTS_SECRET || "";
const NATL = ["WORLD_CUP", "WC_QUAL", "EURO_QUAL", "UEFA_NL", "AFCON", "CONCACAF_GOLD", "INTL_FRIENDLY", "U20_WC", "U17_WC", "OLYMPICS_FOOTBALL"];
const OUT = "data/coach-names.json";

if (!ANTHROPIC_KEY) { console.error("❌ ANTHROPIC_API_KEY 미설정 (env -u ANTHROPIC_API_KEY 로 실행했는지 확인)"); process.exit(1); }

interface AnthropicResp { content?: Array<{ text?: string }> }

async function fetchCoach(cid: string): Promise<{ name: string; nat: string } | null> {
  try {
    const j = (await (await fetch(`https://api.thesports.com/v1/football/coach/list?user=${U}&secret=${S}&uuid=${cid}`, { signal: AbortSignal.timeout(15000) })).json()) as { results?: Array<{ name: string; nationality: string }> };
    const c = j.results?.[0];
    return c ? { name: c.name, nat: c.nationality } : null;
  } catch { return null; }
}

async function haikuTranslate(batch: Array<{ en: string; nat: string }>): Promise<Record<string, string>> {
  const prompt =
    `다음 축구 감독 영문 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
    `국적이 다양합니다 — 각 국적의 한국어 관용 표기를 따르세요.\n` +
    `- 한국 감독: 두음법칙 + 성+이름 순서. "Myung-bo Hong"→홍명보, "Hong Myung-bo"→홍명보\n` +
    `- 일본: "Hajime Moriyasu"→모리야스 하지메 (성+이름)\n` +
    `- 유럽/남미: 관용 표기. "Julen Lopetegui"→훌렌 로페테기, "Javier Aguirre"→하비에르 아기레, "Heimir Hallgrímsson"→헤이미르 하들그림손, "Hugo Broos"→휘호 브로스\n` +
    `- 자신없으면 그 entry 제외 (틀린 음역보다 누락이 나음).\n\n` +
    `감독 list (이름·국적):\n` +
    batch.map((b, i) => `${i + 1}. "${b.en}" (${b.nat})`).join("\n") +
    `\n\n출력 — JSON 객체 한 줄 (다른 설명 X). key 는 위 영문 이름 그대로:\n` +
    `{"Julen Lopetegui": "훌렌 로페테기", "Myung-bo Hong": "홍명보", ...}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) { console.warn(`! Haiku ${res.status}`); return {}; }
  const data = (await res.json()) as AnthropicResp;
  const text = data?.content?.[0]?.text?.trim() ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) { console.warn(`! no JSON: ${text.slice(0, 120)}`); return {}; }
  try {
    const obj = JSON.parse(m[0]) as Record<string, string>;
    const cleaned: Record<string, string> = {};
    for (const [en, ko] of Object.entries(obj)) {
      if (typeof ko !== "string") continue;
      const k = ko.trim();
      if (!k || !/[가-힣]/.test(k)) continue;
      const cjk = k.match(/[一-鿿]/g);
      if (cjk && cjk.length >= 2) continue; // 중국어 혼입 방어
      cleaned[en] = k;
    }
    return cleaned;
  } catch { return {}; }
}

async function main() {
  const prisma = new PrismaClient();
  const ms = await prisma.match.findMany({ where: { league: { in: NATL } }, select: { id: true } });
  const caches = await prisma.theSportsMatchCache.findMany({ where: { matchId: { in: ms.map((m) => m.id) } }, select: { lineup: true } });
  const coachIds = new Set<string>();
  for (const c of caches) {
    if (!c.lineup) continue;
    let obj: { coach_id?: Record<string, string> };
    try { obj = typeof c.lineup === "string" ? JSON.parse(c.lineup) : (c.lineup as never); } catch { continue; }
    for (const side of ["home", "away"]) if (obj.coach_id?.[side]) coachIds.add(obj.coach_id[side]);
  }
  console.log(`감독 ${coachIds.size}명 (coach_id)`);

  const coaches: Array<{ id: string; en: string; nat: string }> = [];
  for (const cid of coachIds) {
    const co = await fetchCoach(cid);
    if (co?.name) coaches.push({ id: cid, en: co.name, nat: co.nat });
  }
  console.log(`coach/list 이름 확보 ${coaches.length}명`);

  let out: Record<string, string> = {};
  try { out = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { /* 신규 */ }

  const BATCH = 40;
  for (let i = 0; i < coaches.length; i += BATCH) {
    const batch = coaches.slice(i, i + BATCH);
    const tr = await haikuTranslate(batch.map((c) => ({ en: c.en, nat: c.nat })));
    for (const c of batch) if (tr[c.en]) out[c.id] = tr[c.en];
    console.log(`batch ${i}~${i + batch.length}: 누적 ${Object.keys(out).length}명`);
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`✅ ${Object.keys(out).length}명 한글 → ${OUT}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
