// NPB 외국인 선수 공식 pid → 한글 이름 (영문 원명 기준 Haiku 음역).
//   npb.jp 카나 필드는 외국인 선수에 한해 로마자 원명을 병기한다:
//     "ホセ・キハダ　(JOSE QUIJADA)"
//   카나만 음역하면 일본어 발음을 거쳐 "호세 기하다"·"카타 스추와토 주니아" 처럼 원명과 멀어진다.
//   → 괄호 안 영문 원명을 뽑아 Haiku 로 음역하고, npbPlayerKo 가 이 사전을 1순위로 쓴다.
// 실행: env -u ANTHROPIC_API_KEY npx tsx --env-file=.env.local scripts/build-npb-foreign-names-haiku.ts
//   (Claude Code 세션 키와 충돌 방지 — .env.local 의 ANTHROPIC_API_KEY 를 쓰게 한다)
import fs from "fs";
import kanaDict from "../data/npb-player-kana.json";

const OUT = "data/npb-foreign-names.json";
const BATCH = 40;
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

if (!KEY) {
  console.error("ANTHROPIC_API_KEY 미설정");
  process.exit(1);
}

interface AnthropicResp {
  content?: Array<{ text?: string }>;
}

async function haikuTranslate(names: string[]): Promise<Record<string, string>> {
  const prompt =
    `다음 NPB(일본 프로야구) 외국인 선수의 영문 원명을 한국 스포츠 미디어 표기로 음역해주세요.\n` +
    `- 영어/스페인어권 원명 기준입니다. 일본어 발음을 거치지 마세요.\n` +
    `  예: JOSE QUIJADA → 호세 키하다 (X 호세 기하다), CARTER STEWART JR → 카터 스튜어트 주니어\n` +
    `- 중남미 선수가 많습니다. 스페인어 발음을 따르세요 (VICIEDO → 비시에도, CEDENO → 세데뇨)\n` +
    `- 이름+성 사이 띄어쓰기 1개. JR/II 등은 "주니어"·"2세" 로.\n` +
    `- 자신없는 선수는 결과에서 제외 (잘못된 음역보다 누락이 낫습니다)\n\n` +
    `선수 list:\n` +
    names.map((n, i) => `${i + 1}. "${n}"`).join("\n") +
    `\n\n출력 — JSON 객체 한 줄 (다른 설명 X):\n` +
    `{"JOSE QUIJADA": "호세 키하다", "DAYAN VICIEDO": "다얀 비시에도", ...}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) {
    console.warn(`! Haiku ${res.status}`);
    return {};
  }
  const data = (await res.json()) as AnthropicResp;
  const text = data?.content?.[0]?.text?.trim() ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    return JSON.parse(m[0]) as Record<string, string>;
  } catch {
    return {};
  }
}

async function main() {
  const DICT = kanaDict as Record<string, string>;
  // 카나에 로마자 원명이 병기된 선수 = 외국인
  const targets: Array<{ pid: string; en: string }> = [];
  for (const [pid, kana] of Object.entries(DICT)) {
    // 쉼표 포함 — "CARTER STEWART, JR." 같은 표기가 있다
    const m = kana.match(/[（(]\s*([A-Za-z][A-Za-z .,'\-]*)\s*[）)]/);
    if (m) targets.push({ pid, en: m[1].replace(/\s+/g, " ").trim() });
  }
  console.log(`[npb-foreign] 영문 원명 보유 ${targets.length}명`);

  const prev: Record<string, string> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const todo = targets.filter((t) => !prev[t.pid]);
  console.log(`[npb-foreign] 기존 ${Object.keys(prev).length} · 신규 ${todo.length}`);

  const out = { ...prev };
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const uniq = [...new Set(batch.map((b) => b.en))];
    const map = await haikuTranslate(uniq);
    let n = 0;
    for (const b of batch) {
      const ko = map[b.en];
      if (ko && /[가-힣]/.test(ko)) {
        out[b.pid] = ko.trim();
        n++;
      }
    }
    console.log(`  배치 ${i / BATCH + 1}: ${n}/${batch.length} 음역`);
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 0));
  console.log(`[npb-foreign] 완료 → ${Object.keys(out).length}명 저장 (${OUT})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
