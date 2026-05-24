// 잡 스크립트(tsx) 실행 시 환경 변수 로드.
//
// Next.js 는 .env 와 .env.local 을 자동으로 읽지만, 우리가 따로 돌리는
// jobs/scripts 는 그렇지 않다. 두 파일을 모두 읽고, .env.local 이
// 후순위로 로드되어 같은 변수를 덮어쓰도록 한다.

import dotenv from "dotenv";
import path from "node:path";

const ROOT = process.cwd();

dotenv.config({ path: path.join(ROOT, ".env") });
dotenv.config({
  path: path.join(ROOT, ".env.local"),
  override: true,
});
