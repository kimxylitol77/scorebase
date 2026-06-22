// MLB 선수목록 빌드 — 30팀 로스터(MLB Stats API 공개)를 data/mlb-players.json 으로. 선수 비교 피커 검색용.
// 실행: (메인 repo) npx tsx <path>/scripts/build-mlb-players.ts  — 공개 API라 키 불필요.
import { fetchMlbRoster } from "@/lib/sports/mlb-stats-api";
import { toKoreanPlayerName } from "@/lib/player-names";
import fs from "fs";
import path from "path";

async function main() {
  // 30개 팀명
  const r = await fetch("https://statsapi.mlb.com/api/v1/teams?sportId=1");
  const d = (await r.json()) as { teams?: Array<{ name: string }> };
  const teams = (d.teams ?? []).map((t) => t.name);
  console.log(`팀 ${teams.length}`);

  const out: Record<string, { name: string; ko: string; group: string; team: string; pos: string }> = {};
  for (const team of teams) {
    try {
      const roster = await fetchMlbRoster(team);
      for (const p of roster) {
        out[String(p.id)] = {
          name: p.name,
          ko: toKoreanPlayerName(p.name) || p.name,
          group: p.group === "P" ? "p" : "b", // 투수 p / 타자 b
          team,
          pos: p.position,
        };
      }
      console.log(`${team}: ${roster.length}`);
    } catch (e) {
      console.error(`${team} 실패:`, (e as Error).message);
    }
  }

  const outPath = path.resolve(__dirname, "../data/mlb-players.json");
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log(`\n총 ${Object.keys(out).length}명 → ${outPath}`);
}

main().then(() => process.exit(0));
