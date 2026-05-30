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

/** 분석글 작성 (회원 전용). 예측은 선택 — 종목·경기·픽을 모두 채우면 저장. */
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
  const pick = String(formData.get("pick") ?? "").trim();

  if (title.length < 2 || title.length > 100) {
    return { ok: false, error: "제목은 2~100자로 입력해주세요." };
  }
  if (content.length < 5) {
    return { ok: false, error: "내용을 5자 이상 입력해주세요." };
  }

  // 예측 입력 검증 (선택사항이지만, 하나라도 있으면 셋 다 유효해야 함)
  let predData: { sport: string; matchId: number; pick: string } | null = null;
  if (sport || matchIdRaw || pick) {
    const matchId = Number(matchIdRaw);
    if (!VALID_SPORTS.has(sport) || !Number.isInteger(matchId) || !pick) {
      return { ok: false, error: "예측을 하려면 종목·경기·예상을 모두 선택해주세요." };
    }
    const allowed = sportHasDraw(sport) ? ["HOME", "DRAW", "AWAY"] : ["HOME", "AWAY"];
    if (!allowed.includes(pick)) {
      return { ok: false, error: "올바른 예상(승/무/패)을 선택해주세요." };
    }
    // 예정 경기만 — 이미 시작/종료된 경기는 픽 불가 (결과 보고 거는 어뷰징 차단)
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: { status: true, startTime: true },
    });
    if (!match || match.status !== "SCHEDULED" || match.startTime <= new Date()) {
      return { ok: false, error: "예측 가능한 예정 경기가 아닙니다." };
    }
    predData = { sport, matchId, pick };
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

  // 작성 경험치/포인트 지급 (등급 명예 용도)
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
