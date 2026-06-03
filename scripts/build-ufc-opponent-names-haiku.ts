// UFC 파이터 영문명(본인 + Fight History 상대) → 한국어 dict (Claude Haiku).
//   - 본인(MmaFighter)은 nameKo(DB)가 1순위지만, Fight History 의 상대(opponent)는 우리 DB 에
//     없는 과거 상대가 많아 정적 dict 가 필요 → 상세 페이지 Fight History 상대명 한글화.
//   - 출력: src/lib/sports/ufc-fighter-names.ts (UFC_FIGHTER_NAMES_KO + toUfcFighterKo).
// 실행: env -u ANTHROPIC_API_KEY npx tsx scripts/build-ufc-opponent-names-haiku.ts
import "@/lib/env";
import { prisma } from "@/lib/db";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const OUT = "src/lib/sports/ufc-fighter-names.ts";
const BATCH = 60;

if (!ANTHROPIC_KEY) {
  console.error("❌ ANTHROPIC_API_KEY 미설정");
  process.exit(1);
}

async function haikuTranslate(batch: string[]): Promise<Record<string, string>> {
  const prompt =
    `다음 UFC(종합격투기) 파이터 영문 이름을 한국 스포츠 미디어 표기로 음역해주세요.\n` +
    `- 음역 정확성 우선 (Islam Makhachev → 이슬람 마카체프, Pat Sabatini → 팻 사바티니)\n` +
    `- 풀네임 한국어 표기 (이름 성 순서 유지)\n` +
    `- 한국·아시아 파이터는 통용 표기 (Chan Sung Jung → 정찬성)\n` +
    `- 자신없는 파이터는 결과에서 제외해도 됨\n\n` +
    `파이터 list:\n` +
    batch.map((n, i) => `${i + 1}. "${n}"`).join("\n") +
    `\n\n출력 형식 — JSON 객체 한 줄, 다른 설명 X:\n` +
    `{"Islam Makhachev": "이슬람 마카체프", ...}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) { console.warn(`! Haiku ${res.status}`); return {}; }
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const text = data?.content?.[0]?.text?.trim() ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    const obj = JSON.parse(m[0]) as Record<string, string>;
    const cleaned: Record<string, string> = {};
    for (const [en, ko] of Object.entries(obj)) {
      if (typeof ko !== "string") continue;
      const k = ko.trim();
      if (!k || !/[가-힣]/.test(k)) continue;
      const cjk = k.match(/[一-鿿]/g);
      if (cjk && cjk.length >= 3) continue;
      cleaned[en] = k;
    }
    return cleaned;
  } catch { return {}; }
}

async function main() {
  const all = await prisma.mmaFighter.findMany({ select: { name: true, fightHistory: true } });
  const names = new Set<string>();
  for (const f of all) {
    names.add(f.name);
    if (f.fightHistory) for (const h of JSON.parse(f.fightHistory) as Array<{ o?: string }>) if (h.o) names.add(h.o);
  }
  // 기존 dict 로드 (재실행 시 누락만 추가)
  const outPath = resolve(OUT);
  const existing: Record<string, string> = {};
  if (existsSync(outPath)) {
    for (const x of readFileSync(outPath, "utf8").matchAll(/"([^"]+)":\s*"([^"]+)"/g)) existing[x[1]] = x[2];
  }
  const missing = [...names].filter((n) => !(n in existing));
  console.log(`UFC 이름 ${names.size}개 (기존 ${Object.keys(existing).length}, 누락 ${missing.length})`);

  const dict: Record<string, string> = {};
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH);
    process.stdout.write(`▶ batch ${i / BATCH + 1}/${Math.ceil(missing.length / BATCH)} (${chunk.length}) `);
    const r = await haikuTranslate(chunk);
    Object.assign(dict, r);
    console.log(`+${Object.keys(r).length}`);
    await new Promise((res) => setTimeout(res, 500));
  }

  const merged = { ...existing, ...dict };
  const sorted = Object.entries(merged).sort((a, b) => a[0].localeCompare(b[0]));
  const body = sorted.map(([en, ko]) => `  "${en.replace(/"/g, '\\"')}": "${ko}",`).join("\n");
  const file = `// UFC 파이터 영문 → 한국어 dict (Haiku 음역). 자동 생성: scripts/build-ufc-opponent-names-haiku.ts
// Fight History 상대명 한글화용. 본인 파이터는 MmaFighter.nameKo(DB) 가 1순위.

export const UFC_FIGHTER_NAMES_KO: Record<string, string> = {
${body}
};

export function toUfcFighterKo(name: string | null | undefined): string {
  if (!name) return "";
  return UFC_FIGHTER_NAMES_KO[name] ?? name;
}
`;
  writeFileSync(outPath, file);
  console.log(`✓ wrote ${OUT} — ${sorted.length} entries (+${Object.keys(dict).length})`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
