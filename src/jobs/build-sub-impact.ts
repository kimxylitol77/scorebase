// 교체 임팩트 집계 수동 실행 잡 — npm run job:sub-impact (cron 은 /api/cron/sub-impact)

import "@/lib/env";
import { buildSubImpact } from "@/lib/tactical/sub-impact";

buildSubImpact()
  .then((r) => {
    console.log(`교체 임팩트 집계 완료 — ${r.leagues}개 리그, ${r.games}경기`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
