// 야구 시즌 잔여 일정 선적재 CLI — 본체는 src/jobs/backfill-baseball-season.ts.
// 평상시는 주간 cron(/api/cron/baseball-season-backfill)이 돌린다. 이 스크립트는 수동
// 구간 지정(새 시즌 일정 발표 직후 등)·dry-run 확인용.
//
// 실행: npx tsx scripts/backfill-baseball-season.ts [--apply] [--from=2026-07-29] [--to=2026-09-27]
import "../src/lib/env";
import {
  runBaseballSeasonBackfill,
  todayKST,
  addDays,
} from "../src/jobs/backfill-baseball-season";

const APPLY = process.argv.includes("--apply");
const arg = (k: string) =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];

async function main() {
  const from = arg("from") ?? todayKST();
  const to = arg("to") ?? addDays(from, 90);
  console.log(
    `[backfill-baseball] MLB ${from} ~ ${to} (${APPLY ? "APPLY" : "dry-run"})`,
  );
  await runBaseballSeasonBackfill({ from, to, apply: APPLY });
  if (!APPLY) console.log("  → dry-run (적용하려면 --apply)");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
