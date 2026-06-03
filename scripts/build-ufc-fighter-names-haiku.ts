// UFC 파이터 영문명 → 한국어 음역 (Claude Haiku) → MmaFighter.nameKo 업데이트.
//   - 야구(build-*-player-names-haiku.ts)는 정적 dict 파일을 출력하지만, UFC 파이터는
//     collect-mma 가 신규를 계속 추가하므로 DB(nameKo) 방식으로 자동화(cron 재실행만으로 보강).
//   - nameKo 가 비어있는(null) MmaFighter 만 대상. batch 50명.
// 실행: env -u ANTHROPIC_API_KEY npx tsx scripts/build-ufc-fighter-names-haiku.ts
//   ⚠️ shell 에 (만료된) ANTHROPIC_API_KEY 가 export 돼 있으면 .env.local 값을 덮어쓰지 못함
//      → env -u 로 제거 후 실행 (baseball 한글화와 동일 함정).
// 환경변수: ANTHROPIC_API_KEY (필수, .env.local), ANTHROPIC_MODEL (기본 haiku-4-5)
import "@/lib/env";
import { prisma } from "@/lib/db";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const BATCH = 50;

if (!ANTHROPIC_KEY) {
  console.error("❌ ANTHROPIC_API_KEY 미설정");
  process.exit(1);
}

interface AnthropicResp {
  content?: Array<{ text?: string }>;
}

async function haikuTranslate(batch: string[]): Promise<Record<string, string>> {
  const prompt =
    `다음 UFC(종합격투기) 파이터 영문 이름을 한국 스포츠 미디어 표기로 음역해주세요.\n` +
    `참고: 위키피디아 한국어판 또는 네이버 스포츠/UFC 중계 표기 기준.\n` +
    `- 음역 정확성 우선 (Islam Makhachev → 이슬람 마카체프, Jon Jones → 존 존스, Alex Pereira → 알렉스 페레이라)\n` +
    `- 풀네임 한국어 표기 (이름 성 순서 유지)\n` +
    `- 한국·아시아 파이터는 통용 표기 (Chan Sung Jung → 정찬성, Doo Ho Choi → 최두호)\n` +
    `- 자신없는 파이터는 결과에서 제외해도 됨\n\n` +
    `파이터 list:\n` +
    batch.map((n, i) => `${i + 1}. "${n}"`).join("\n") +
    `\n\n출력 형식 — JSON 객체 한 줄, 다른 설명 X:\n` +
    `{"Islam Makhachev": "이슬람 마카체프", "Jon Jones": "존 존스", ...}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    console.warn(`! Haiku ${res.status}`);
    return {};
  }
  const data = (await res.json()) as AnthropicResp;
  const text = data?.content?.[0]?.text?.trim() ?? "";
  // JSON 추출 — 가끔 ```json wrap 또는 설명 prefix 있을 수 있음
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) {
    console.warn(`! no JSON in response: ${text.slice(0, 200)}`);
    return {};
  }
  try {
    const obj = JSON.parse(m[0]) as Record<string, string>;
    // 한국어 검증 — 한글 포함 + 한자 3+ 혼입 배제 (Qwen 류 한자 혼입 방지 패턴 재사용)
    const cleaned: Record<string, string> = {};
    for (const [en, ko] of Object.entries(obj)) {
      if (typeof ko !== "string") continue;
      const koStr = ko.trim();
      if (!koStr) continue;
      if (!/[가-힣]/.test(koStr)) continue;
      const cjk = koStr.match(/[一-鿿]/g);
      if (cjk && cjk.length >= 3) continue;
      cleaned[en] = koStr;
    }
    return cleaned;
  } catch (e) {
    console.warn(`! JSON parse fail: ${(e as Error).message}`);
    return {};
  }
}

async function main() {
  const rows = await prisma.mmaFighter.findMany({
    where: { nameKo: null },
    select: { teamId: true, name: true },
  });
  console.log(`▶ UFC 파이터 nameKo 누락: ${rows.length}명`);
  if (rows.length === 0) {
    console.log("✓ 전부 한글화됨 — Haiku 호출 skip");
    await prisma.$disconnect();
    return;
  }

  const names = rows.map((r) => r.name);
  const dict: Record<string, string> = {};
  for (let i = 0; i < names.length; i += BATCH) {
    const chunk = names.slice(i, i + BATCH);
    process.stdout.write(`▶ batch ${i / BATCH + 1}/${Math.ceil(names.length / BATCH)} (${chunk.length}명) `);
    const result = await haikuTranslate(chunk);
    Object.assign(dict, result);
    console.log(`+${Object.keys(result).length}`);
    await new Promise((r) => setTimeout(r, 500));
  }

  let updated = 0;
  for (const r of rows) {
    const ko = dict[r.name];
    if (!ko) continue;
    await prisma.mmaFighter.update({ where: { teamId: r.teamId }, data: { nameKo: ko } });
    updated++;
  }
  console.log(`✓ nameKo 업데이트 ${updated}/${rows.length}명 (미매칭 ${rows.length - updated}명은 다음 실행 재시도)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
