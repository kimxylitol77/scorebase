// coach-photos.json 감독 이름 일괄 한글화 — Haiku, 멱등(이미 nameKo 있으면 skip).
//   env -u ANTHROPIC_API_KEY npx tsx --env-file=.env.local scripts/translate-coach-names.ts
// 프롬프트·검증 규칙은 build-team-coaches.ts 의 haikuTranslate 와 동일하게 유지한다 —
// 감독 표기가 소스마다 달라지면 화면(라인업 vs /coaches)이 서로 다른 이름을 말한다.
import { readFileSync, writeFileSync } from "fs";

const FILE = "data/coach-photos.json";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
if (!ANTHROPIC_KEY) {
  console.error("ANTHROPIC_API_KEY 없음 (env -u ANTHROPIC_API_KEY 로 셸 빈 값을 지우고 실행)");
  process.exit(1);
}

interface Entry {
  name: string;
  logo: string | null;
  nameKo?: string;
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
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.warn(`! Haiku ${res.status}`);
      return {};
    }
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    const m = (data?.content?.[0]?.text ?? "").match(/\{[\s\S]*\}/);
    if (!m) return {};
    const obj = JSON.parse(m[0]) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [en, ko] of Object.entries(obj)) {
      if (typeof ko === "string" && /[가-힣]/.test(ko.trim())) out[en] = ko.trim();
    }
    return out;
  } catch {
    return {};
  }
}

async function main() {
  const map = JSON.parse(readFileSync(FILE, "utf-8")) as Record<string, Entry>;

  // 기존 8리그 사전(team-coaches.json)의 표기를 먼저 흡수 — 이미 확정된 표기를 재번역하지 않는다
  const legacy = JSON.parse(readFileSync("data/team-coaches.json", "utf-8")) as Record<
    string,
    { name?: string; nameKo?: string | null }
  >;
  const legacyKo = new Map<string, string>();
  for (const c of Object.values(legacy)) {
    if (c?.name && c.nameKo) legacyKo.set(c.name.trim().toLowerCase(), c.nameKo);
  }

  let fromLegacy = 0;
  const need = new Set<string>();
  for (const e of Object.values(map)) {
    if (e.nameKo || /[가-힣]/.test(e.name)) continue;
    const hit = legacyKo.get(e.name.trim().toLowerCase());
    if (hit) {
      e.nameKo = hit;
      fromLegacy++;
    } else {
      need.add(e.name);
    }
  }
  console.log(`대상 ${Object.keys(map).length}명 — 기존 사전 흡수 ${fromLegacy} · 번역 필요 ${need.size}`);

  const names = [...need];
  const translated: Record<string, string> = {};
  const BATCH = 60;
  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH);
    const out = await haikuTranslate(batch);
    Object.assign(translated, out);
    console.log(`  ${Math.min(i + BATCH, names.length)}/${names.length} — 누적 ${Object.keys(translated).length}`);
    await new Promise((r) => setTimeout(r, 400));
  }

  let applied = 0;
  for (const e of Object.values(map)) {
    if (e.nameKo) continue;
    const ko = translated[e.name];
    if (ko) {
      e.nameKo = ko;
      applied++;
    }
  }
  writeFileSync(FILE, JSON.stringify(map, null, 1));
  const total = Object.values(map).filter((e) => e.nameKo).length;
  console.log(`번역 적용 ${applied} / nameKo 보유 ${total}/${Object.keys(map).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
