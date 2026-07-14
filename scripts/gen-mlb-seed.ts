// MLB 연봉 seed 생성 — 브라우저로 추출한 Spotrac 이름+금액 pairs 를
// enrichMlbSalaries(MLB Stats 팀·사진 보강)로 완성해 data/mlb-salaries-seed.json 기록.
// pairs 는 scripts/mlb-pairs.json (브라우저 추출본, [["이름", 금액], ...]).

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { enrichMlbSalaries, type NormalizedSalary } from "../src/lib/sports/mlb-salaries";

async function main() {
  const pairsPath = resolve(process.cwd(), "scripts/mlb-pairs.json");
  const pairs = JSON.parse(readFileSync(pairsPath, "utf8")) as [string, number][];
  const rows: NormalizedSalary[] = pairs
    .filter(([name, salary]) => name && salary > 0)
    .map(([playerName, salary]) => ({ rank: 0, playerName, teamName: "", salary }));
  rows.sort((a, b) => b.salary - a.salary);
  rows.forEach((r, i) => (r.rank = i + 1));

  await enrichMlbSalaries(rows);

  const path = resolve(process.cwd(), "data/mlb-salaries-seed.json");
  writeFileSync(path, JSON.stringify(rows, null, 0) + "\n");
  console.log(`mlb: ${rows.length}명 → ${path}`);
  console.log(`팀 매칭: ${rows.filter((r) => r.teamName).length} | 사진: ${rows.filter((r) => r.photoUrl).length}`);
  console.log("TOP5:", rows.slice(0, 5).map((r) => `${r.playerName}(${r.teamName || "?"})`).join(", "));
}

main();
