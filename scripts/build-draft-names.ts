// 드래프트 풀 전용 NBA 옛 선수 한글 이름 사전 (Haiku 음역) — 사이트 공용 사전에 없는 은퇴 선수만.
//   입력: data/draft-pool-nba.json 에서 아직 영문인 이름. 출력: data/draft-names-nba.json (멱등 머지).
//   공용 사전(nba-player-names-haiku.json)과 분리한 이유 — 그 파일은 주간 봇이 다시 쓰고 사이트 전체에 영향.
//   실행: env -u ANTHROPIC_API_KEY npx tsx scripts/build-draft-names.ts [LIMIT]   → 이후 build-draft-pool.ts nba 재실행
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PoolFile } from "../src/lib/draft/types";

const BATCH = 50;
const OUT = "data/draft-names-nba.json";
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const LIMIT = parseInt(process.argv[2] ?? "0", 10);

if (!KEY) {
  console.error("ANTHROPIC_API_KEY 미설정 (env -u ANTHROPIC_API_KEY 로 실행했는지 확인)");
  process.exit(1);
}

async function translate(batch: string[]): Promise<Record<string, string>> {
  const prompt =
    `다음 NBA 농구 선수(은퇴 선수 포함) 영문 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
    `- 풀네임(이름 성)으로 표기합니다. "Shaquille O'Neal"→샤킬 오닐, "Tracy McGrady"→트레이시 맥그레이디, "Hakeem Olajuwon"→하킴 올라주원\n` +
    `- 유럽·국제 선수는 현지 발음 관용 표기. "Dirk Nowitzki"→디르크 노비츠키, "Manu Ginobili"→마누 지노빌리\n` +
    `- 접미사 "Jr."→주니어. 이니셜은 그대로. "A.C. Green"→A.C. 그린\n` +
    `- 자신없으면 그 entry 제외 (틀린 음역보다 누락이 나음).\n\n` +
    `선수 list:\n` +
    batch.map((en, i) => `${i + 1}. "${en}"`).join("\n") +
    `\n\n출력 — JSON 객체 한 줄 (다른 설명 X). key 는 위 영문 이름 그대로:\n{"Shaquille O'Neal": "샤킬 오닐", ...}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) {
    console.warn(`! Haiku ${res.status} ${(await res.text()).slice(0, 200)}`);
    return {};
  }
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const m = (data.content?.[0]?.text ?? "").match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    const obj = JSON.parse(m[0]) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [en, ko] of Object.entries(obj)) if (typeof ko === "string" && /[가-힣]/.test(ko)) out[en] = ko.trim();
    return out;
  } catch {
    return {};
  }
}

async function main() {
  const pool = JSON.parse(readFileSync(resolve("data/draft-pool-nba.json"), "utf8")) as PoolFile;
  const outPath = resolve(OUT);
  const merged: Record<string, string> = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
  let todo = [...new Set(pool.cards.map((c) => c.name).filter((n) => !/[가-힣]/.test(n) && !(n in merged)))];
  if (LIMIT > 0) todo = todo.slice(0, LIMIT);
  console.log(`음역 대상 ${todo.length}명 (기존 ${Object.keys(merged).length})`);
  let added = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const got = await translate(chunk);
    for (const en of chunk) if (got[en]) { merged[en] = got[en]; added++; }
    console.log(`batch ${i / BATCH + 1}/${Math.ceil(todo.length / BATCH)} 누적 +${added}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  writeFileSync(outPath, JSON.stringify(Object.fromEntries(Object.entries(merged).sort((a, b) => a[0].localeCompare(b[0]))), null, 2) + "\n");
  console.log(`${OUT} 총 ${Object.keys(merged).length}명 (+${added})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
