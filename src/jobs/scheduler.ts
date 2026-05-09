// 스케줄러 — node-cron 으로 정해진 시간에 잡 실행.
//
// 사용:
//   npm run scheduler
//
// 운영 권장: 이 프로세스를 24시간 띄워두거나(서버),
//          Vercel Cron / GitHub Actions schedule 로 대체.

import "@/lib/env";
import cron from "node-cron";
import { spawn } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function runJob(name: string, args: string[] = []) {
  console.log(`[scheduler] 실행: ${name} ${args.join(" ")}`);
  const child = spawn(
    "npx",
    ["tsx", `src/jobs/${name}.ts`, ...args],
    { cwd: ROOT, stdio: "inherit" },
  );
  child.on("exit", (code) => {
    console.log(`[scheduler] ${name} 종료 (exit ${code})`);
  });
}

// === 스케줄 정의 (KST 기준) ===
// node-cron 은 서버 시간대를 따르므로 timezone 옵션 명시.

// 매 30분마다: 진행 중/오늘 경기 데이터 갱신
cron.schedule(
  "*/30 * * * *",
  () => runJob("collect", ["--all"]),
  { timezone: "Asia/Seoul" },
);

// 매일 오전 8시: 어제 끝난 경기들 RECAP 초안 생성
cron.schedule(
  "0 8 * * *",
  () => runJob("generate-articles"),
  { timezone: "Asia/Seoul" },
);

// 매일 오전 10시: 다가오는 7일 SCHEDULED 매치 PREVIEW 초안 생성
cron.schedule(
  "0 10 * * *",
  () => runJob("generate-previews"),
  { timezone: "Asia/Seoul" },
);

// 매주 월요일 11시: 리그별 시즌 종합 분석 글
cron.schedule(
  "0 11 * * 1",
  () => runJob("generate-analysis"),
  { timezone: "Asia/Seoul" },
);

console.log("[scheduler] 시작됨. Ctrl+C 로 종료.");
console.log("[scheduler] 등록된 잡:");
console.log("  - 매 30분: 경기 데이터 수집 (collect --all)");
console.log("  - 매일 08:00 KST: RECAP 자동 생성 (generate-articles)");
console.log("  - 매일 10:00 KST: PREVIEW 자동 생성 (generate-previews)");
console.log("  - 매주 월 11:00 KST: 시즌 종합 분석 (generate-analysis)");
