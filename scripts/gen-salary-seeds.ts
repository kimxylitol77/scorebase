// 연봉 seed 생성 — 프로덕션 스크래퍼를 그대로 호출해 data/{league}-salaries-seed.json 기록.
// 사용: npx tsx scripts/gen-salary-seeds.ts <nhl|nba>
// (MLB 는 Spotrac 하드차단이라 브라우저 수동 추출 → data/mlb-salaries-seed.json 직접 작성)

import { writeFileSync } from "fs";
import { resolve } from "path";
import { fetchNhlSalaries } from "../src/lib/sports/nhl-salaries";
import { fetchNbaSalaries } from "../src/lib/sports/nba-salaries";

async function main() {
  const league = (process.argv[2] ?? "").toLowerCase();
  const fetcher = league === "nhl" ? fetchNhlSalaries : league === "nba" ? fetchNbaSalaries : null;
  if (!fetcher) {
    console.error("usage: tsx scripts/gen-salary-seeds.ts <nhl|nba>");
    process.exit(1);
  }
  const rows = await fetcher();
  if (rows.length === 0) {
    console.error(`${league}: 0건 — seed 생성 실패(스크래핑 차단 의심)`);
    process.exit(1);
  }
  const path = resolve(process.cwd(), `data/${league}-salaries-seed.json`);
  writeFileSync(path, JSON.stringify(rows, null, 0) + "\n");
  console.log(`${league}: ${rows.length}명 → ${path}`);
  console.log("TOP5:", rows.slice(0, 5).map((r) => `${r.playerName}($${(r.salary / 1e6).toFixed(1)}M)`).join(", "));
}

main();
