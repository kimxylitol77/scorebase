"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { awardExp } from "@/lib/user-exp";
import { EXP_REWARDS, POINT_REWARDS } from "@/lib/user-level";
import { sportHasDraw } from "@/lib/analysis/scoring";
import { rateLimit } from "@/lib/rate-limit";

export interface PostFormState {
  ok: boolean;
  error?: string;
}

const VALID_SPORTS = new Set(["soccer", "baseball", "basketball", "hockey"]);
const VALID_MARKETS = new Set(["1X2", "HANDICAP", "OU"]);

/** 분석글 작성 (회원 전용). 예측은 선택 — 종목·경기·마켓·픽을 채우면 저장. */
export async function createPostAction(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "로그인이 필요합니다." };

  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const sport = String(formData.get("sport") ?? "").trim();
  const matchIdRaw = String(formData.get("matchId") ?? "").trim();
  const market = String(formData.get("market") ?? "").trim();
  const pick = String(formData.get("pick") ?? "").trim();

  if (title.length < 2 || title.length > 120) {
    return { ok: false, error: "제목은 2~120자로 입력해주세요." };
  }
  if (content.length < 5) {
    return { ok: false, error: "내용을 5자 이상 입력해주세요." };
  }

  // 예측 입력 검증 (선택이지만 하나라도 있으면 종목·경기·마켓·픽 모두 유효해야)
  let predData:
    | { sport: string; matchId: number; market: string; line: number | null; pick: string }
    | null = null;

  if (sport || matchIdRaw || market || pick) {
    const matchId = Number(matchIdRaw);
    if (
      !VALID_SPORTS.has(sport) ||
      !Number.isInteger(matchId) ||
      !VALID_MARKETS.has(market) ||
      !pick
    ) {
      return { ok: false, error: "예측하려면 종목·경기·마켓·픽을 모두 선택해주세요." };
    }

    // 예정 경기만 + line 은 서버에서 경기 배당으로 확정(클라 값 신뢰 X = 어뷰징 차단)
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        status: true,
        startTime: true,
        oddsHcLine: true,
        oddsTotalLine: true,
      },
    });
    if (!match || match.status !== "SCHEDULED" || match.startTime <= new Date()) {
      return { ok: false, error: "예측 가능한 예정 경기가 아닙니다." };
    }

    let line: number | null = null;
    if (market === "1X2") {
      const allowed = sportHasDraw(sport) ? ["HOME", "DRAW", "AWAY"] : ["HOME", "AWAY"];
      if (!allowed.includes(pick)) return { ok: false, error: "올바른 승무패 픽을 선택해주세요." };
    } else if (market === "HANDICAP") {
      if (!["HOME", "AWAY"].includes(pick)) return { ok: false, error: "올바른 핸디캡 픽을 선택해주세요." };
      if (match.oddsHcLine == null) return { ok: false, error: "이 경기는 핸디캡 배당이 없어요." };
      line = match.oddsHcLine;
    } else {
      // OU
      if (!["OVER", "UNDER"].includes(pick)) return { ok: false, error: "올바른 오버/언더 픽을 선택해주세요." };
      if (match.oddsTotalLine == null) return { ok: false, error: "이 경기는 오버언더 배당이 없어요." };
      line = match.oddsTotalLine;
    }

    predData = { sport, matchId, market, line, pick };
  }

  // 도배 방지 (회원 단위)
  const rl = rateLimit(`post-create:${userId}`, {
    max: 10,
    windowMs: 10 * 60 * 1000,
    lockMs: 10 * 60 * 1000,
  });
  if (!rl.allowed) {
    const min = Math.ceil(rl.retryAfterSec / 60);
    return { ok: false, error: `글 작성이 너무 많습니다. ${min}분 후 다시 시도해주세요.` };
  }

  const post = await prisma.post.create({
    data: {
      authorId: userId,
      title,
      content,
      ...(predData ?? {}),
    },
    select: { id: true },
  });

  await awardExp(userId, {
    exp: EXP_REWARDS.analysisPost,
    points: POINT_REWARDS.analysisPost,
  });

  revalidatePath("/analysis");
  redirect(`/analysis/${post.id}`);
}

/** 글 추천 (회원, 본인 글 제외, 1인 1회). 작성자에게 추천 경험치 지급. */
export async function likePostAction(formData: FormData): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;
  const postId = Number(formData.get("postId"));
  if (!Number.isInteger(postId)) return;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true },
  });
  if (!post || post.authorId === userId) return; // 본인 글 추천 불가

  try {
    await prisma.postLike.create({ data: { postId, userId } });
  } catch {
    return; // unique 위반 = 이미 추천함 → 무시
  }

  await prisma.post.update({
    where: { id: postId },
    data: { likes: { increment: 1 } },
  });
  await awardExp(post.authorId, {
    exp: EXP_REWARDS.recommendReceived,
    points: POINT_REWARDS.recommendReceived,
  });

  revalidatePath(`/analysis/${postId}`);
  revalidatePath("/analysis");
}

/** 댓글 작성 (회원 전용). 댓글당 경험치 +50 (rate limit 으로 도배 방지). */
export async function createCommentAction(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "로그인이 필요합니다." };

  const postId = Number(formData.get("postId"));
  const content = String(formData.get("content") ?? "").trim();
  if (!Number.isInteger(postId)) return { ok: false, error: "잘못된 글입니다." };
  if (content.length < 1 || content.length > 1000) {
    return { ok: false, error: "댓글은 1~1000자로 입력해주세요." };
  }

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
  if (!post) return { ok: false, error: "존재하지 않는 글입니다." };

  const rl = rateLimit(`comment:${userId}`, {
    max: 15,
    windowMs: 5 * 60 * 1000,
    lockMs: 5 * 60 * 1000,
  });
  if (!rl.allowed) {
    const min = Math.ceil(rl.retryAfterSec / 60);
    return { ok: false, error: `댓글이 너무 많습니다. ${min}분 후 다시 시도해주세요.` };
  }

  await prisma.comment.create({ data: { postId, authorId: userId, content } });
  await prisma.post.update({
    where: { id: postId },
    data: { commentCount: { increment: 1 } },
  });
  await awardExp(userId, { exp: EXP_REWARDS.comment, points: POINT_REWARDS.comment });

  revalidatePath(`/analysis/${postId}`);
  return { ok: true };
}
