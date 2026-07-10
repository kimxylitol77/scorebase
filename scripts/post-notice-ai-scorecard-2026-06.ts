// 공지 (CHANGELOG) 게시 — AI 예측 성적표 신설 (우리 모델 vs GPT-5.6).
// 실행: npx tsx --env-file=.env.local scripts/post-notice-ai-scorecard-2026-06.ts
import { prisma } from "@/lib/db";

const slug = "ai-scorecard-gpt-vs-model-2026-06";
const title = "AI 예측 성적표 신설 — 우리 AI vs GPT-5.6, 같은 경기로 정면 비교";

const content = `
## 한 줄 요약

스코어베이스 통계모델과 **GPT-5.6**가 **정확히 같은 경기**를 경기 전에 예측하고, 결과로 채점합니다. 누가 더 잘 맞히는지 경기별 적중·실패를 숨김 없이 누적 공개하는 **AI 예측 성적표**를 새로 열었습니다.

[AI 예측 성적표 바로가기 →](/predictions/scorecard)

---

## 무엇이 새로운가

- 두 AI가 **경기 시작 전**에 1X2(승·무·패) 픽을 제출합니다. 결과가 나오면 실제 승자와 맞는지로 채점합니다 (축구는 정규시간 기준).
- **정면 비교** — 두 AI가 모두 예측한 동일 경기만 놓고 적중률·연속 적중·단독 적중을 나란히 보여줍니다.
- **다가오는 맞대결 픽** — 오늘·이번 주 경기에 대한 두 AI의 픽을 미리 확인할 수 있습니다 (GPT의 한 줄 근거 포함).

---

## 공정성 원칙

- 스코어베이스 AI는 Elo·Dixon-Coles에 선발 투수·골리·시장 배당을 더한 통계모델입니다.
- GPT-5.6는 팀·리그·일정 정보만 받아 **우리 모델 수치를 보지 않고** 독립적으로 예측합니다.
- 두 픽 모두 **경기 전에 저장**되며, 사후 수정은 없습니다.

---

## 비교 대상

축구 빅5·MLS·챔피언스리그·FIFA 월드컵, 그리고 NBA·NHL·MLB·KBO·NPB 의 예정 경기를 매일 자동 수집합니다. 채점된 전적은 경기가 끝나는 대로 매일 쌓입니다.

리그·시장별 전체 적중률은 [AI 예측 적중률 보드](/predictions/accuracy)에서 함께 확인하세요.
`.trim();

async function main() {
  const n = await prisma.notice.upsert({
    where: { slug },
    create: { type: "CHANGELOG", title, slug, content },
    update: { title, content, type: "CHANGELOG" },
  });
  console.log(`✓ 공지 발행: [${n.type}] ${n.slug}\n  ${n.title}`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
