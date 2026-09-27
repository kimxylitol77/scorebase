// 드래프트 풀 전용 옛 선수 한글 이름 사전 (Haiku 음역) — 사이트 공용 사전에 없는 은퇴 선수만.
//   입력: data/draft-pool-{mode}.json 에서 아직 영문인 이름. 출력: data/draft-names-{mode}.json (멱등 머지).
//   공용 사전(*-player-names-haiku.json)과 분리한 이유 — 그 파일들은 주간 봇이 다시 쓰고 사이트 전체에 영향.
//   실행: env -u ANTHROPIC_API_KEY npx tsx scripts/build-draft-names.ts <nba|mlb|epl> [LIMIT]   → 이후 build-draft-pool.ts <mode> 재실행
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BATCH = 50;
const MODE = process.argv[2] ?? "nba";
const OUT = `data/draft-names-${MODE}.json`;
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const LIMIT = parseInt(process.argv[3] ?? "0", 10);

if (!KEY) {
  console.error("ANTHROPIC_API_KEY 미설정 (env -u ANTHROPIC_API_KEY 로 실행했는지 확인)");
  process.exit(1);
}

const PROMPTS: Record<string, string> = {
  nba:
    `다음 NBA 농구 선수(은퇴 선수 포함) 영문 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
    `- 풀네임(이름 성)으로 표기합니다. "Shaquille O'Neal"→샤킬 오닐, "Tracy McGrady"→트레이시 맥그레이디, "Hakeem Olajuwon"→하킴 올라주원\n` +
    `- 유럽·국제 선수는 현지 발음 관용 표기. "Dirk Nowitzki"→디르크 노비츠키, "Manu Ginobili"→마누 지노빌리\n` +
    `- 접미사 "Jr."→주니어. 이니셜은 그대로. "A.C. Green"→A.C. 그린`,
  mlb:
    `다음 MLB 야구 선수(은퇴 선수 포함) 영문 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
    `- 풀네임(이름 성)으로 표기합니다. "Barry Bonds"→배리 본즈, "Pedro Martínez"→페드로 마르티네스, "Greg Maddux"→그렉 매덕스, "Ken Griffey Jr."→켄 그리피 주니어\n` +
    `- 중남미 선수는 스페인어 발음 관용 표기. "Vladimir Guerrero"→블라디미르 게레로. 일본·한국 선수는 본래 이름. "Hideo Nomo"→노모 히데오, "Chan Ho Park"→박찬호\n` +
    `- 이니셜은 그대로. "J.D. Drew"→J.D. 드류`,
  kleague:
    `다음 K리그 축구 선수 이름을 한국 스포츠 미디어에서 쓰는 표기로 변환해주세요.\n` +
    `- 한국 선수는 한국 이름으로. "Min-Kyu Joo"→주민규, "Y. Lee | Lee Young-Jae"→이영재. 외국인 선수는 K리그 등록명 또는 통용 표기로. "Cesinha"→세징야\n` +
    `- 입력이 "약칭 | 본명" 형식이면 본명으로 누구인지 확인하고, 출력 key 는 입력 문자열 전체를 그대로 쓰세요.`,
  epl:
    `다음 잉글랜드 프리미어리그 축구 선수(은퇴 선수 포함) 이름을 한국 스포츠 미디어에서 쓰는 표기로 변환해주세요.\n` +
    `- 한국 중계·기사에서 통용되는 이름으로. "Wayne Rooney"→웨인 루니, "Sergio Agüero"→세르히오 아구에로, "Eden Hazard"→에덴 아자르, "Heung-Min Son"→손흥민\n` +
    `- 브라질·포르투갈 선수처럼 통칭이 있으면 통칭으로. "Gabriel Fernando de Jesus"→가브리엘 제주스, "Willian Borges da Silva"→윌리안\n` +
    `- 선수 국적의 현지 발음을 따른다 (스페인어·프랑스어·독일어 등).\n` +
    `- 입력은 "약칭 | 본명" 형식입니다. 본명으로 누구인지 확인하고, 출력 key 는 입력 문자열 전체를 그대로 쓰세요. "M. Salah | Mohamed Salah Hamed Mahrous Ghaly"→모하메드 살라`,
};

async function translate(batch: string[]): Promise<Record<string, string>> {
  const prompt = `${PROMPTS[MODE] ?? PROMPTS.epl}
- 자신없으면 그 entry 제외 (틀린 음역보다 누락이 나음).

선수 list:
${batch.map((en, i) => `${i + 1}. "${en}"`).join("\n")}

출력 — JSON 객체 한 줄 (다른 설명 X). key 는 위 영문 이름 그대로:
{"<영문 이름>": "<한글 이름>", ...}`;
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
  // build-draft-pool.ts 가 남긴 미음역 목록 (축구는 "약칭 | 본명" 키)
  const listFile = join(tmpdir(), "draft-pool-cache", `untranslated-${MODE}.json`);
  if (!existsSync(listFile)) throw new Error(`${listFile} 없음 — build-draft-pool.ts ${MODE} 를 먼저 돌릴 것`);
  const outPath = resolve(OUT);
  const merged: Record<string, string> = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
  let todo = (JSON.parse(readFileSync(listFile, "utf8")) as string[]).filter((n) => !(n in merged));
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
