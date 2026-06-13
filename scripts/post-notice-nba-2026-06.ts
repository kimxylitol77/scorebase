// 공지 (CHANGELOG) 게시 — 2026-06 NBA 트랜잭션·연봉·선수 연결.
// 실행: npx tsx --env-file=.env.local scripts/post-notice-nba-2026-06.ts
import { prisma } from "@/lib/db";

const slug = "nba-transactions-salaries-2026-06";
const title = "NBA 트랜잭션·연봉 랭킹 신설 — 한국어·선수 사진·시즌 스탯 연결";

const content = `
## 한 줄 요약

**NBA 트랜잭션(이적·트레이드) 피드**와 **선수 연봉 랭킹**을 새로 열었습니다. 모두 한국어로 제공되고, 선수 사진·시즌 스탯까지 클릭 한 번으로 이어집니다.

---

## 🔄 NBA 트랜잭션 — 트레이드·FA·방출

- 트레이드, 자유계약(FA), 방출, 단기계약(10일), 감독 선임까지 **선수 이동 소식을 날짜순**으로 모았습니다.
- 영문 원문을 **한국어로 자동 번역**합니다 (예: "Hired Jamahl Mosley as head coach." → **"자말 모슬리 감독 선임"**). 원문도 함께 표기합니다.
- 유형별 필터(트레이드·계약·방출·단기·감독)와 25건씩 넘겨보기를 지원하고, **매일 자동 갱신**됩니다.

[NBA 트랜잭션 바로가기 →](/transactions/nba)

---

## 💰 NBA 연봉 랭킹 — 달러·원화 동시

- 현역 **500여 명의 시즌 연봉을 순위**로 정리했습니다. 1위는 스테판 커리 — 연 **약 906억원**($59.6M).
- **달러와 원화를 함께** 표시합니다 (환율 자동 반영).
- 25명씩 페이지로 넘겨보고, 선수별 사진도 함께 제공합니다.

[NBA 연봉 랭킹 바로가기 →](/salaries/nba)

---

## 👤 선수 페이지 연결 + 사진

- 트랜잭션·연봉에서 **선수를 누르면 선수 상세 페이지**로 이동합니다.
- 선수 **사진**, 시즌 평균(득점·리바운드·어시스트 등), **최근 10경기** 기록을 한 화면에서 볼 수 있습니다.
- 선수 이름·팀명 모두 **한국어 표기**입니다.

---

## ⚽ 유럽 2부 리그 순위 5개 추가

- **네덜란드·포르투갈·튀르키예·벨기에·스코틀랜드 2부** 순위표를 새로 추가했습니다.

[리그 순위 바로가기 →](/standings)

---

데이터는 ESPN·Basketball Reference·balldontlie 등 공개 출처를 활용하며, 한국어 번역은 AI(Claude) 협업으로 생성하고 영문 원문을 함께 제공합니다. 앞으로도 종목과 기능을 꾸준히 늘려가겠습니다.
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
