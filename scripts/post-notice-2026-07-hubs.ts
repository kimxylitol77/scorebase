// 공지 (CHANGELOG) 게시 — 2026년 7월 초 업데이트 (종목 허브·AI 파워랭킹·팀 역사 묶음).
import "@/lib/env";
import { prisma } from "@/lib/db";

const title = "종목별 허브 신설 · AI 파워랭킹 전 종목 확대 · 팀 역사";

const content = `
## 한 줄 요약

축구·야구·농구를 각각 하나의 **종목 허브**로 묶어 전 리그로 바로 들어가게 했고, **AI 파워랭킹**을 야구·농구·하키·롤까지 넓혔습니다. 팀과 리그마다 **역대 우승·역사**를 붙였고, 월드컵 선수 STAR 리포트를 새로 발행합니다.

---

## 종목 허브 신설

축구·야구·농구를 종목별 허브 한 곳에서 전 리그로 진입하도록 재구성했습니다.

- **축구 허브** — 빅5(EPL·라리가·분데스·세리에 A·리그 1) + K리그1을 동일한 리그 카드 형식으로.
- **야구 허브** — KBO·MLB·NPB 3리그 전 진입로 (기존 KBO 편중 해소).
- **농구 허브** — NBA·WNBA·KBL·WKBL.
- 각 리그의 예측·순위·일정·역사로 한 번에 이동.

## AI 파워랭킹 전 종목 확대

Elo 기반 리그 전력 순위를 야구·농구·하키·e스포츠까지 넓혔습니다.

- **MLB** — Elo + ERA 기반 30팀 전력 순위 (야구 첫 파워랭킹).
- **KBO · NPB** — 야구 3리그 공용화.
- **NHL · WNBA · LCK** — 하키·여자농구·롤 추가.
- 축구 빅5는 기존 유지.

## 역대 우승 · 역사

- **야구 역사** — KBO·MLB·NPB 역대 우승 기록을 다른 종목과 동일하게.
- **축구 역사 탭** — 최신 챔피언 옆에 예측·순위 바로가기, 우승 기록은 시즌 결산글로 연결.
- **팀 페이지 역대 우승·명장·레전드** — EPL 20팀 (위키 사실 기반, 대회·감독·선수 표기 한글화).

## 팀 페이지 강화

- **SEO 소개 문단** — 전 팀 자동 생성 (홈구장·지난 시즌 성적).
- 순위 **팩트카드 클릭 연결** — 챔피언 → 팀 상세, 득점왕 → 선수 상세.
- 리그 역사 탭의 우승팀명·로고 → 팀 페이지로 링크.

## 월드컵 STAR 리포트

- 선수 1인 스토리텔링 + 데이터 리포트를 자동 발행.
- 예상 라인업 **피치 뷰** + 부상·결장 명단.

## MLB Statcast 리더보드

- 배럴% · 타구 속도 · 하드히트% · xwOBA 리더보드 신설.

## 라이브 스코어 리디자인

- \`/scores\` 데스크톱 왼쪽 **리그 사이드바** — 경기 있는 리그만 + 경기 수 카운트.
- 축구 라이브 리그 그룹 카드 리디자인.

## 프리시즌 · 이적시장

- 국제 클럽 친선(프리시즌) 스코어 피드 + 참가 클럽 801팀 한글화.
- 이적 임박·루머 → 해외 브리핑 연결 카드.
- K리그 트레이딩 카드 랜딩 (\`/k-league-cards\`).
`.trim();

const slug = "2026-07-hubs-power-rankings-history";

async function main() {
  const existing = await prisma.notice.findUnique({ where: { slug } });
  if (existing) {
    const updated = await prisma.notice.update({
      where: { slug },
      data: { title, content, type: "CHANGELOG" },
    });
    console.log("기존 공지 갱신:", updated.id, updated.slug);
  } else {
    const created = await prisma.notice.create({
      data: { title, slug, type: "CHANGELOG", content },
    });
    console.log("신규 공지 등록:", created.id, created.slug);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
