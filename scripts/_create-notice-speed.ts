// 라이브 점수 latency 개선 공지 생성.
//   npx tsx --env-file=.env.local scripts/_create-notice-speed.ts

import { prisma } from "../src/lib/db";

const title = "라이브 스코어 갱신 속도 대폭 단축 — 평균 15초 → 2-3초";

const content = `## 무엇이 바뀌었나

축구·야구 라이브 스코어 갱신 속도를 전면 재구성했습니다.

### Before (이전)
- 야구 라이브: ESPN/api-sports 기반, **체감 평균 10-30초**
- 축구 라이브: ESPN summary 기반, **체감 평균 40-70초**
- /scores 목록 페이지: 30초 자동 갱신

### After (개선)
- **KBO · NPB · MLB**: TheSports MQTT WebSocket push (1-2초) → 체감 **평균 2-3초**
- **축구** (EPL·라리가·세리에A·분데스·리그1·UCL·UEL·MLS 등): TheSports REST 2초 주기 poller → 체감 **평균 5초**
- /scores 목록 페이지: 15초 자동 갱신 (이전 30초)
- 상세 페이지 폴링: 5-10초 → **2-5초**

## 기술 스택 변화

| 구분 | Before | After |
|---|---|---|
| 야구 score source | ESPN scoreboard (30-60s 갱신) | TheSports MQTT push (1-2s) |
| 축구 score source | ESPN summary only | api-football + TheSports cache max() |
| 갱신 인프라 | Vercel cron 매 2분 | Lightsail worker 2초 cycle |
| 클라이언트 polling | 10-20초 | 2-5초 |

## 사용자 체감

- 골/홈런 발생 → 화면 반영 시간: **수십 초 → 수 초**
- /scores 목록: 매치 점수가 거의 실시간으로 갱신
- /live/[league]/[gameId] 상세 페이지: Flashscore / LiveScore 수준 latency

기존 페이지 그대로 사용하시면 자동으로 빨라진 갱신을 경험하실 수 있습니다.
`;

async function main() {
  const now = new Date();
  const dateOnly = now.toISOString().slice(0, 10);
  const slug = `${dateOnly}-live-score-speed-upgrade`;

  const created = await prisma.notice.create({
    data: {
      type: "CHANGELOG",
      title,
      slug,
      content,
      publishedAt: now,
    },
  });
  console.log(`✅ Notice 생성: id=${created.id} slug=${created.slug}`);
  console.log(`URL: https://www.scorebase.kr/notices/${created.slug}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
