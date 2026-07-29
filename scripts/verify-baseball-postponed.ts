// 야구 미래 POSTPONED 재대조 CLI — 로직 본체는 src/jobs/verify-baseball-postponed.ts.
// 실행: npx tsx scripts/verify-baseball-postponed.ts [--apply] [--leagues=KBO,NPB]
import "dotenv/config";
import { runVerifyBaseballPostponed } from "../src/jobs/verify-baseball-postponed";

const apply = process.argv.includes("--apply");
const leaguesArg = process.argv.find((a) => a.startsWith("--leagues="));
const leagues = leaguesArg ? leaguesArg.split("=")[1].split(",") : undefined;

runVerifyBaseballPostponed({ apply, leagues })
  .then((results) => {
    const total = results.reduce((s, r) => s + r.fixed, 0);
    console.log(
      apply ? `→ SCHEDULED 로 정정 ${total}건 적용` : `→ dry-run ${total}건 (적용하려면 --apply)`,
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
