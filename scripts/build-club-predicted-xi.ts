// 클럽 예상 라인업 수동 실행 래퍼 — 본체는 src/jobs/build-club-xi.ts (2026-08-17 이관).
// 운영은 Vercel cron /api/cron/club-xi(하루 2회)가 돌리고 산출물은 PredictedXiCache(DB).
// 이 래퍼는 로컬 검증·긴급 수동 갱신용: npx tsx --env-file=.env.local scripts/build-club-predicted-xi.ts
// (구버전은 data/club-predicted-xi.json 을 써서 git 커밋했다 — 그 파일은 이제 전환기 폴백 전용.)
import { runBuildClubXi } from "../src/jobs/build-club-xi";

runBuildClubXi()
  .then((r) => {
    console.log(`완료 — ${r.leagues}개 리그 ${r.teams}팀 (PredictedXiCache 저장)`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
