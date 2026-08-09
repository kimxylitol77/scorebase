import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runEvaluate, runEvaluateMatches, runBrierReport } from "@/jobs/evaluate-predictions";
import { runEvaluateAiPredictions } from "@/jobs/fetch-gpt-predictions";
import { runPredictionPostmortems } from "@/jobs/prediction-postmortems";
import { runScoreMatchVotes } from "@/jobs/score-match-votes";
import { runScoreMemberBotPicks } from "@/jobs/score-member-bot-picks";

export const dynamic = "force-dynamic";
// take 200→400 (desc 백로그 배수)로 처리량 늘어 60s 부족 가능 → 180s.
export const maxDuration = 180;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const [previewResult, matchResult] = await Promise.all([
      runEvaluate(),
      runEvaluateMatches(),
    ]);
    // Brier 리포트 — predCorrect 채운 뒤 실행 (확률 품질 + 시장 대비, cron 로그·응답으로 확인)
    const brier = await runBrierReport().catch(() => null);
    // 멀티 AI 성적표 채점 — 종료 경기의 우리 모델·GPT 픽 correct 채움.
    const aiScore = await runEvaluateAiPredictions().catch(() => null);
    // 관리자 전용 예측 감사 — 최초 예측 스냅샷과 종료 데이터를 비교해 원인·위험 신호 저장.
    const postmortems = aiScore
      ? await runPredictionPostmortems().catch(() => null)
      : null;
    // 승부예측 투표 채점 — 회원·익명 투표의 correct 채움 (/picks 랭킹 소스)
    const votes = await runScoreMatchVotes().catch(() => null);
    // 회원 커스텀 봇 픽 채점 — MemberBotPick.correct 채움 (/lab 내 봇 픽 성적 소스)
    const botPicks = await runScoreMemberBotPicks().catch(() => null);
    await recordCronRun("evaluate");
    return NextResponse.json({
      ok: true,
      preview: previewResult,
      match: matchResult,
      brier,
      aiScore,
      postmortems,
      votes,
      botPicks,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
