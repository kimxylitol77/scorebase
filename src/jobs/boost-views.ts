// 분석 게시판(Post) 조회수 — 시간별 cron 으로 조금씩 자연 증가(한 번에 점프 X).
//   - DB의 Post.views 만 갱신(실제 페이지 방문 X → 광고 임프레션과 무관).
//   - 매 실행마다 글마다 소량 +(나이·인기 가중): 최근·추천 많은 글이 더 빨리 쌓여 자연 곡선.
//   - 시간별 호출(cron) → 며칠에 걸쳐 누적. 갑자기 0→수백 점프 없음.
// 사용(수동 1회 테스트): env -u ANTHROPIC_API_KEY npx tsx src/jobs/boost-views.ts
import "@/lib/env";
import { prisma } from "@/lib/db";

const DAY = 86400000;
const ri = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

// 글 1개의 "이번 1시간" 증가량 — 나이가 어릴수록·추천이 많을수록 큼.
// 한 시간 단위라 값이 작다(최근 글도 시간당 한 자릿수). 누적되어야 자연스러운 총량.
function hourlyInc(ageDays: number, likes: number): number {
  let inc: number;
  if (ageDays < 1) inc = ri(2, 9); // 첫날 활발
  else if (ageDays < 3) inc = ri(1, 5);
  else if (ageDays < 7) inc = ri(0, 3);
  else if (ageDays < 30) inc = Math.random() < 0.5 ? ri(0, 2) : 0;
  else inc = Math.random() < 0.2 ? 1 : 0; // 오래된 글은 가끔만
  // 인기(추천) 가산 — 추천 많은 글이 조회도 더 (자연 상관)
  if (likes > 0) inc += Math.floor(Math.random() * (likes * 0.5 + 1));
  return inc;
}

export async function runBoostViews(): Promise<{ total: number; bumped: number; added: number }> {
  const posts = await prisma.post.findMany({
    select: { id: true, likes: true, createdAt: true },
  });
  const now = Date.now();
  let bumped = 0;
  let added = 0;
  for (const p of posts) {
    const ageDays = (now - p.createdAt.getTime()) / DAY;
    const inc = hourlyInc(ageDays, p.likes);
    if (inc > 0) {
      await prisma.post.update({ where: { id: p.id }, data: { views: { increment: inc } } });
      bumped++;
      added += inc;
    }
  }
  return { total: posts.length, bumped, added };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBoostViews()
    .then((r) => console.log("[boost-views]", r))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
