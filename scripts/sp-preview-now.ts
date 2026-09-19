// sportspredictions.live 핵심 경기 영어 프리뷰 즉시 생성 (수동). 사용: npm run sp-preview -- [limit]
import { runSpPreviews } from "../src/lib/sp/preview";

async function main() {
  const limit = Number(process.argv[2]) || undefined;
  const r = await runSpPreviews({ limit });
  console.log(JSON.stringify(r, null, 2));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
