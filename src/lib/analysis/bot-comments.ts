// 봇 댓글 시딩 — 회원봇 페르소나가 최근 게시판 글에 단문 댓글을 낮은 확률로 남긴다.
// 커뮤니티 리서치(2026-07-05): 댓글 문화 = 단문 드립·동조·가벼운 반박. 게시판이 "살아있는
// 대화"로 보이는 최소 조건. fake-picks cron(30분 간격)에 합류해 하루 10~20개가 시간에 분산.

import "server-only";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { toKoreanTeamName } from "@/lib/team-names";
import { botTeamName } from "@/lib/analysis/manager-bot";
import { FAKE_NICKNAMES, PERSONAS } from "@/lib/analysis/fake-members";

/** 봇 표기용 한글 팀명 — 축하 댓글에서 팀 언급용. */
function botTeamNameSafe(name: string, league: string): string {
  return botTeamName(toKoreanTeamName(name, league), league);
}

/** 닉네임 → 페르소나 말투 (FAKE_NICKNAMES 인덱스 1:1). 미등록 닉이면 무난한 기본값. */
function personaTone(nickname: string): string {
  const i = FAKE_NICKNAMES.indexOf(nickname);
  return i >= 0 ? PERSONAS[i].tone : "평범한 스포츠팬. 가볍고 짧게";
}

const MAX_COMMENTS_PER_POST = 5; // 글 하나에 봇 댓글이 도배되는 것 방지
const TARGET_WINDOW_H = 36;

/** 댓글 달 글 선택 — 최근 글 중 댓글 여유 있는 것. 오늘의 픽 스레드는 3배 가중. */
async function pickTargetPost() {
  const since = new Date(Date.now() - TARGET_WINDOW_H * 3600 * 1000);
  const posts = await prisma.post.findMany({
    where: {
      category: { in: ["ANALYSIS", "FREE", "BRIEFING"] },
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

const PICK_KO: Record<string, string> = { HOME: "홈", AWAY: "원정", DRAW: "무승부", OVER: "오버", UNDER: "언더" };

const CONGRATS_SYSTEM = (nickname: string, tone: string, recent: string[]) => `당신은 스포츠 커뮤니티 회원 "${nickname}"입니다. 다른 회원의 픽이 적중한 글에 축하 댓글을 답니다.

[댓글 규칙]
- 길이 6~45자. 한 문장. 진짜 사람이 지나가다 남기는 축하처럼.
- 표현은 매번 다르게 — 축하("적중 축하요", "추카추카"), 부러움("아 따라갈걸"), 감탄("역배를 이걸 맞추네 ㄷㄷ", "오 진짜 맞췄네"), 인정("보는 눈 있으시네") 등 다양한 결 중 하나만.
- 말투: ${tone}
- ㅋㅋ·ㄷㄷ 가끔 OK. 이모지 금지. 픽 내용이나 스코어를 살짝 언급해도 좋지만 강제 아님.
- 분석 금지 — 축하 한 마디만.

[중복 금지]
최근 다른 축하 댓글: ${recent.length ? recent.join(" / ") : "(없음)"}
- 위와 같은 표현·구조 반복 금지.

[출력] 댓글 텍스트만. 따옴표·JSON·설명 금지.`;

/** 적중 픽 축하 댓글 — 채점(isCorrect=true) 직후 24h 내 글에 1개씩. 실회원 글 우선.
 *  cron(30분)마다 최대 1개 → 채점 파도(22시) 이후 밤~아침에 걸쳐 자연 분산. */
export async function runHitCongrats(force = false): Promise<{ created: number; skipped: number }> {
  // 새벽(KST 1~7시)엔 낮은 확률로만 — 사람 활동 패턴 흉내
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  if (!force && kstHour >= 1 && kstHour < 7 && Math.random() > 0.2) return { created: 0, skipped: 0 };

  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const posts = await prisma.post.findMany({
      where: { category: "ANALYSIS", isCorrect: true, settledAt: { gte: since } },
      orderBy: { settledAt: "desc" },
      take: 25,
      select: {
        id: true,
        authorId: true,
        title: true,
        market: true,
        pick: true,
        line: true,
        settledAt: true,
        author: { select: { nickname: true, email: true } },
        match: {
          select: {
            league: true,
            homeScore: true,
            awayScore: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        },
      },
    });
    if (posts.length === 0) return { created: 0, skipped: 0 };

    // 이미 채점 후 봇 댓글(=축하)이 달린 글 제외
    const bots = await prisma.user.findMany({
      where: { email: { startsWith: "fake", endsWith: "@scorebase.internal" } },
      select: { id: true },
    });
    const botIds = new Set(bots.map((b) => b.id));
    const existing = await prisma.comment.findMany({
      where: { postId: { in: posts.map((p) => p.id) } },
      select: { postId: true, authorId: true, createdAt: true },
    });
    const congratted = new Set(
      existing
        .filter((c) => {
          const post = posts.find((p) => p.id === c.postId);
          return post?.settledAt && botIds.has(c.authorId) && c.createdAt >= post.settledAt;
        })
        .map((c) => c.postId),
    );
    const fresh = posts.filter((p) => !congratted.has(p.id));
    if (fresh.length === 0) return { created: 0, skipped: 0 };

    // 실회원 글 우선 — 진짜 사람이 적중했을 때 반드시 축하받는 경험이 리텐션의 핵심
    const real = fresh.filter((p) => !p.author?.email?.startsWith("fake"));
    const target = (real.length > 0 ? real : fresh)[0];

    const who = await pickCommenter(target.id, target.authorId);
    if (!who) return { created: 0, skipped: 1 };

    const recentCongrats = existing.length
      ? (
          await prisma.comment.findMany({
            where: { authorId: { in: [...botIds] } },
            orderBy: { createdAt: "desc" },
            take: 8,
            select: { content: true },
          })
        ).map((c) => c.content.slice(0, 40))
      : [];

    const m = target.match;
    const home = m ? botTeamNameSafe(m.homeTeam.name, m.league) : null;
    const away = m ? botTeamNameSafe(m.awayTeam.name, m.league) : null;
    const pickLabel =
      target.pick && target.market
        ? `${target.market === "OU" ? "" : target.pick === "HOME" ? `${home ?? "홈"} ` : target.pick === "AWAY" ? `${away ?? "원정"} ` : ""}${PICK_KO[target.pick] ?? target.pick}${target.line != null ? ` ${target.line}` : ""}`
        : null;
    const data = [
      `적중한 글 제목: ${target.title}`,
      `작성자: ${target.author?.nickname ?? "회원"}`,
      pickLabel ? `적중 픽: ${target.market} — ${pickLabel}` : null,
      m && m.homeScore != null ? `최종 결과: ${home} ${m.homeScore} : ${m.awayScore} ${away}` : null,
    ]
      .filter((l): l is string => l != null)
      .join("\n");

    const raw = await generate(data, {
      system: CONGRATS_SYSTEM(who.nickname, personaTone(who.nickname), recentCongrats),
      maxTokens: 120,
      temperature: 0.95,
    });
    const content = raw.trim().replace(/^["'`]+|["'`]+$/g, "").slice(0, 200);
    if (content.length < 3) return { created: 0, skipped: 1 };

    const createdAt = new Date(Date.now() - (1 + Math.floor(Math.random() * 29)) * 60_000 - Math.floor(Math.random() * 60) * 1000);
    await prisma.comment.create({
      data: { postId: target.id, authorId: who.userId, content, createdAt },
    });
    await prisma.post.update({
      where: { id: target.id },
      data: { commentCount: { increment: 1 } },
    });
    return { created: 1, skipped: 0 };
  } catch {
    return { created: 0, skipped: 1 };
  }
}

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
