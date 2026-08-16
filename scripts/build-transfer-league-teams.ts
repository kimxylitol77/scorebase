// /transfers 비빅5 확장 리그의 ts 팀 id → league code 사전 생성 → data/transfer-league-teams.json
//
// 빅5는 TeamSourceId/PlayerMarketValue 로 동적 매핑되지만 K리그1·사우디·MLS 는 Team row 가
// 없거나(K리그·사우디) 축구 ts 매핑이 얇아(MLS) season 순위표에서 팀 목록을 떠서 정적 사전으로.
// whitelisted IP 필요(맥북 OK, Vercel ❌). 멱등 — 시즌 교체(승강·신팀) 시 재실행.
//
//   npx tsx --env-file=.env.local scripts/build-transfer-league-teams.ts
import { thesportsGet } from "../src/lib/sports/thesports/client";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(__dirname, "..", "data", "transfer-league-teams.json");
const MAPPING = path.join(__dirname, "..", "src", "lib", "sports", "thesports", "league-id-mapping.json");
// /transfers 확장 대상 리그 — 추가 시 여기 + page.tsx LEAGUES 에 같이.
const EXPANSION = ["K_LEAGUE_1", "K_LEAGUE_2", "SAUDI_PL", "MLS"];

interface TableRow { team_id?: string }
interface TablesResp { code: number; results?: { tables?: Array<{ rows?: TableRow[] }> } }

async function main() {
  const mapping = JSON.parse(fs.readFileSync(MAPPING, "utf8")) as Array<{
    code: string; tsSeasonId?: string;
  }>;
  const out: Record<string, string> = {};
  for (const code of EXPANSION) {
    const row = mapping.find((m) => m.code === code);
    if (!row?.tsSeasonId) { console.error(`! ${code}: tsSeasonId 없음 — skip`); continue; }
    const res = await thesportsGet<TablesResp>("/v1/football/season/recent/table/detail", {
      uuid: row.tsSeasonId,
    });
    const rows = (res.results?.tables ?? []).flatMap((t) => t.rows ?? []);
    let n = 0;
    for (const r of rows) {
      if (r.team_id) { out[r.team_id] = code; n++; }
    }
    console.log(`${code}: ${n}팀`);
    await new Promise((r) => setTimeout(r, 300));
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 0) + "\n");
  console.log(`✓ wrote ${OUT} — ${Object.keys(out).length}팀`);
}

main().catch((e) => { console.error(e); process.exit(1); });
