// LOL 챔피언 아이콘 사전 — TheSports hero/list → data/lol-heroes.json (챔프명 → 아이콘 URL).
// 챔피언 픽/밴 랭킹 아이콘용. 로컬 전용(ts IP whitelist). 사용: npx tsx scripts/build-lol-heroes.ts
import "@/lib/env";
import { thesportsGet } from "@/lib/sports/thesports/client";
import fs from "fs";
import type { TsListResponse, TsNamedRow } from "./_external-api-types";

(async () => {
  const r = (await thesportsGet("/v1/lol/hero/list", { page: 1 })) as TsListResponse<TsNamedRow>;
  const heroes: Record<string, string> = {};
  for (const h of r.results || []) if (h.name && h.logo) heroes[h.name] = h.logo;
  fs.writeFileSync(
    "data/lol-heroes.json",
    JSON.stringify({ updatedAt: new Date().toISOString(), heroes }, null, 2),
  );
  console.log(`저장 ${Object.keys(heroes).length}개 챔피언 → data/lol-heroes.json`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
