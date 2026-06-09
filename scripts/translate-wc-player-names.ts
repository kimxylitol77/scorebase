// 월드컵 베스트11 선수 영문명 → 한국어 음역 (OpenAI gpt-4o-mini) → TheSportsPlayer.nameKo upsert.
// 한 번 음역하면 DB 캐시 → 빌더가 nameKo 읽음. worker cron 에서 빌더 후 실행 (새 선수만 음역).
// 실행: npx tsx --env-file=.env.local scripts/translate-wc-player-names.ts
import { generate } from "../src/lib/ai/openai";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const p = new PrismaClient();
const GROUPS = "ABCDEFGHIJKL".split("");
function chunk<T>(a: T[], n: number): T[][] { const r: T[][] = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; }

async function main() {
  const players = new Map<string, { name: string; logo: string | null }>();
  for (const g of GROUPS) {
    const f = `data/world-cup-xi/${g}.json`;
    if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    for (const pl of [...(j.xi ?? []), ...(j.bench ?? [])]) players.set(pl.id, { name: pl.name, logo: pl.logo ?? null });
  }
  console.log("총 선수:", players.size);

  const ids = [...players.keys()];
  const existing = await p.theSportsPlayer.findMany({ where: { id: { in: ids } }, select: { id: true, nameKo: true } });
  const haveKo = new Set(existing.filter((e) => e.nameKo).map((e) => e.id));
  const todo = [...players].filter(([id]) => !haveKo.has(id));
  console.log("음역 필요:", todo.length, "(이미 보유:", haveKo.size, ")");

  let done = 0;
  for (const batch of chunk(todo, 40)) {
    const names = batch.map(([, v]) => v.name);
    const prompt =
      `다음 축구 국가대표 선수의 영문 이름을 한국어로 음역하라.\n` +
      `- 잘 알려진 선수는 한국 축구 팬에게 통용되는 표기 사용 (예: Son Heung-min→손흥민, Kylian Mbappé→킬리안 음바페, Martin Ødegaard→마르틴 외데고르).\n` +
      `- 결과는 JSON 객체 {"영문이름":"한글이름"} 만 출력. 코드블록·설명 절대 금지.\n` +
      `- 자신없으면 그 항목 제외(틀린 음역보다 누락이 낫다).\n\n` +
      names.join("\n");
    let map: Record<string, string> = {};
    try {
      const res = await generate(prompt, { system: "너는 축구 선수명 한국어 음역 전문가다. JSON 객체만 출력한다.", temperature: 0.2, maxTokens: 2000 });
      map = JSON.parse(res.replace(/```json|```/g, "").trim());
    } catch (e) {
      console.warn("배치 음역/파싱 실패:", (e as Error).message);
    }
    for (const [id, v] of batch) {
      const nameKo = map[v.name] || null;
      await p.theSportsPlayer.upsert({
        where: { id },
        create: { id, name: v.name, nameKo, sport: "FOOTBALL", photoUrl: v.logo },
        update: { nameKo: nameKo ?? undefined, photoUrl: v.logo ?? undefined },
      });
      if (nameKo) done++;
    }
    console.log(`  진행 ${done}명 음역...`);
  }
  console.log("✅ 음역 완료:", done, "명");
}
main().then(() => p.$disconnect()).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(0); });
