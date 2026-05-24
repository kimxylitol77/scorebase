// 공지 (CHANGELOG) 게시 — 야구 선발 투수 ~ 라이브 스코어 묶음.
import "@/lib/env";
import { prisma } from "@/lib/db";

const title = "라이브 스코어 출시 + NPB 한글화 + 야구 선발 투수";

const content = `
## 한 줄 요약

13개 리그(EPL·UCL·라리가·분데스·세리에 A·리그 1·MLS·FIFA 월드컵 2026·KBO·NPB·MLB·NBA·NHL·LCK) **라이브 스코어 페이지**를 추가했습니다. 헤더 sticky bar 도 자동으로 활성 매치를 보여주고, 야구 매치엔 선발 투수가 함께 노출됩니다.

---

## 🔴 신규: 라이브 스코어

### \`/scores\` 페이지
- **종목 탭** — 전체 / 축구 / 야구 / 농구 / 하키 / e스포츠
- **일자 네비게이션** — 어제 · 오늘 · 내일
- **리그별 그룹** — KBO·NPB·MLB 가 상단 (한국 시청자 우선 순서)
- 각 매치 우측에 분석 글 링크 (FINISHED → RECAP, 그 외 → PREVIEW)
- 데스크탑 호버 시 팀 풀명·상태·분석 글 유무 popover
- 모바일 라이브 카드 가로 swipe 캐러셀

### 헤더 sticky bar
- 진행 중인 매치가 1건이라도 있으면 헤더 바로 아래에 자동으로 LIVE 칩이 등장합니다.
- 30초마다 자동 갱신 + 창 포커스 복귀 시 즉시 갱신.
- 라이브 매치가 0건이면 자동으로 숨겨져 다른 페이지 레이아웃에 영향을 주지 않습니다.

### 데이터 소스 (모두 유료 SLA)
- **API-Football Pro** — 축구 8개 리그 + UCL + 월드컵
- **API-Sports Baseball Pro** — KBO · NPB · MLB
- **BALLDONTLIE GOAT** — NBA · NHL

상태 라벨은 한국어로 자동 변환됩니다. (전반 67' · HT · 5회 초 · 3Q 4:23 등)

---

## ⚾ 야구 통합 강화

### 매치 row 에 선발 투수
KBO / NPB / MLB 매치에 선발 투수 이름이 팀 이름 바로 아래에 함께 노출됩니다. 이전부터 수집해 둔 \`Match.homeStarter / awayStarter\` 데이터를 활용하므로 추가 API 호출은 없습니다.

### NPB 선수 페이지 + 부상자 한글 음역
- npb.jp 의 한자 풀명 + 히라가나 카나를 한국 외래어 표기법(일본어) 규칙으로 자동 음역.
- 戸郷 翔征 → 도고 쇼세이, 中西 聖輝 → 나카니시 마사키 같이 표시.
- 어두 평음(か→가, た→다), 장음(お단+う 생략), 촉음(っ→ㅅ 받침), ん(→ㄴ 받침) 등 반영.

### NPB 부상자 페이지 (\`/injuries/NPB\`)
- npb.jp 공식 1군 등록말소(出場選手登録抹消) 명단을 누적해 표시.
- 한국 야구 표현에 맞춰 "**1군 엔트리 제외**" 로 표기. (별도 부상자 명단 제도가 없는 NPB 특성 명시)
- 같은 선수가 재등록되면 자동 제외(active 만 노출).
- 페이지 로딩 시간 22초 → **1~3초** 로 단축 (Vercel Data Cache + 병렬화).

### KBO 부상자 페이지 (\`/injuries/KBO\`)
- koreabaseball.com 의 부상자 명단 + 치료·재활명단 통합.
- 기간(10일 / 15일 / 30일+)으로 심각도 자동 분류.

### PREVIEW 본문에 부상자 자동 인용
KBO·NPB PREVIEW 글마다 양 팀 부상자 / 1군 엔트리 제외 선수가 모델 분석 컨텍스트에 들어가 본문에서 직접 인용됩니다.

---

## 🎨 사이트 디자인

- **파비콘 신규** — 헤더 로고와 동일한 그라데이션 막대 그래프 (파랑→보라).
- **푸터 브랜드** — 헤더와 같은 로고 마크 추가, 이모지 정리.
- **히어로 CTA** — '스코어베이스 라이브스코어' 진입 버튼 추가 (rose 점멸).
- **메뉴** — '라이브' 를 데스크탑·모바일 모두 최상단으로 이동.
- **월드컵** — 축구 카테고리로 통합 (별도 카테고리 제거).

---

## 데이터·운영 메모

- 라이브 매치 polling: 클라이언트 60초 + 서버 캐시 30초 (\`s-maxage=30, stale-while-revalidate=60\`).
- API 호출량: 30초 캐시 기준 일 약 5,760회. 결제 한도(7,500/day) 내.
- \`?demo=1\` query 로 mock 라이브 6건을 강제 표시 (디자인 검증용, 캐시 없음).

이 변경의 일부는 결과가 시간대에 따라 다르게 보일 수 있습니다. 예를 들어 새벽 시간엔 라이브 매치가 0건이라 sticky bar 가 등장하지 않습니다.
`.trim();

const slug = "live-scores-launch-2026-05-13";

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
