// 봇 댓글 시딩 — 회원봇 페르소나가 최근 게시판 글에 단문 댓글을 낮은 확률로 남긴다.
// 커뮤니티 리서치(2026-07-05): 댓글 문화 = 단문 드립·동조·가벼운 반박. 게시판이 "살아있는
// 대화"로 보이는 최소 조건. fake-picks cron(30분 간격)에 합류해 하루 10~20개가 시간에 분산.

import "server-only";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { FAKE_NICKNAMES } from "@/lib/analysis/fake-members";

const MAX_COMMENTS_PER_POST = 5; // 글 하나에 봇 댓글이 도배되는 것 방지
const TARGET_WINDOW_H = 36;

/** 댓글 달 글 선택 — 최근 글 중 댓글 여유 있는 것. 오늘의 픽 스레드는 3배 가중. */
async function pickTargetPost() {
  const since = new Date(Date.now() - TARGET_WINDOW_H * 3600 * 1000);
  const posts = await prisma.post.findMany({
    where: {
      createdAt: { gte: since },
      commentCount: { lt: MAX_COMMENTS_PER_POST },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      authorId: true,
      title: true,
      content: true,
      pick: true,
      market: true,
      author: { select: { nickname: true } },
    },
  });
  if (posts.length === 0) return null;
  // 가중 풀 — 데일리 스레드(허브)는 댓글이 모여야 하므로 3배
  const pool = posts.flatMap((p) => (p.title.startsWith("오늘의 픽 스레드") ? [p, p, p] : [p]));
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 이 글에 아직 댓글 안 단 봇 중 랜덤 1명 (글 작성자 본인 제외). */
async function pickCommenter(postId: number, postAuthorId: string): Promise<{ userId: string; nickname: string } | null> {
  const bots = await prisma.user.findMany({
    where: { email: { startsWith: "fake", endsWith: "@scorebase.internal" } },
    select: { id: true, nickname: true },
  });
  const commented = await prisma.comment.findMany({
    where: { postId },
    select: { authorId: true },
  });
  const used = new Set(commented.map((c) => c.authorId));
  const avail = bots.filter((b) => b.id !== postAuthorId && !used.has(b.id) && FAKE_NICKNAMES.includes(b.nickname ?? ""));
  if (avail.length === 0) return null;
  const b = avail[Math.floor(Math.random() * avail.length)];
  return { userId: b.id, nickname: b.nickname ?? "회원" };
}

const COMMENT_SYSTEM = (nickname: string, recent: string[]) => `당신은 스포츠 커뮤니티 회원 "${nickname}"입니다. 게시판 글 하나에 짧은 댓글을 답니다.

[댓글 규칙]
- 길이 8~50자. 한 문장, 길어야 두 문장. 커뮤니티 댓글답게 가볍게.
- 톤은 상황 맞게 하나만: 동조("저도 이쪽"), 가벼운 반박("전 반대로 봅니다"), 드립·한 줄 농담, 응원, 짧은 질문.
- ㅋㅋ·ㄷㄷ 같은 표현 가끔 OK. 이모지 금지. 해시태그 금지.
- 분석가처럼 굴지 말 것 — 통계 나열 금지, 팬의 한 마디.
- 글 내용과 무관한 소리 금지. 글이 픽 글이면 그 픽에 대한 반응.

[중복 금지]
최근 다른 댓글: ${recent.length ? recent.join(" / ") : "(없음)"}
- 위와 같은 표현·구조 반복 금지.

[출력] 댓글 텍스트만. 따옴표·JSON·설명 금지.`;

/** 봇 댓글 1개 시딩. cron(30분 간격)에서 확률 게이트 후 호출. force=true 면 게이트 생략(검증용). */
export async function runBotComments(force = false): Promise<{ created: number; skipped: number }> {
  // 시간대별 확률(KST) — 글보다 흔하게. 저녁·아침 파도 높게, 새벽 낮게.
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  const rate = kstHour >= 18 ? 0.5 : kstHour >= 9 ? 0.3 : kstHour >= 7 ? 0.45 : 0.12;
  if (!force && Math.random() > rate) return { created: 0, skipped: 0 };

  try {
    const post = await pickTargetPost();
    if (!post) return { created: 0, skipped: 1 };
    const who = await pickCommenter(post.id, post.authorId);
    if (!who) return { created: 0, skipped: 1 };

    const recentComments = await prisma.comment.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { content: true },
    });

    const data = [
      `글 제목: ${post.title}`,
      `글 작성자: ${post.author?.nickname ?? "회원"}`,
      `글 내용(앞부분): ${post.content.slice(0, 400).replace(/!\[[^\]]*\]\([^)]*\)/g, "").trim()}`,
      post.pick ? `이 글의 픽: ${post.market} ${post.pick}` : null,
    ]
      .filter((l): l is string => l != null)
      .join("\n");

    const raw = await generate(data, {
      system: COMMENT_SYSTEM(who.nickname, recentComments.map((c) => c.content.slice(0, 40))),
      maxTokens: 150,
      temperature: 0.95,
    });
    const content = raw.trim().replace(/^["'`]+|["'`]+$/g, "").slice(0, 200);
    if (content.length < 4) return { created: 0, skipped: 1 };

    // createdAt 과거 지터 — cron 정각 티 제거 (fake-members 와 동일 장치)
    const createdAt = new Date(Date.now() - (1 + Math.floor(Math.random() * 29)) * 60_000 - Math.floor(Math.random() * 60) * 1000);
    await prisma.comment.create({
      data: { postId: post.id, authorId: who.userId, content, createdAt },
    });
    await prisma.post.update({
      where: { id: post.id },
      data: { commentCount: { increment: 1 } },
    });
    return { created: 1, skipped: 0 };
  } catch {
    return { created: 0, skipped: 1 };
  }
}
