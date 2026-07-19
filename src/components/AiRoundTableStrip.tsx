// 매치 상세 "AI 원탁" 연결 스트립 (서버) — 이 경기에 멀티 AI 픽이 있으면
// 몇 개 AI 가 예측했고 만장일치인지까지만 보여주고(픽 내용은 회원 공개 정책),
// 성적표(/predictions/scorecard)로 흘려보낸다. 픽이 없는 리그도 리더보드 링크는 노출.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Users } from "lucide-react";

export default async function AiRoundTableStrip({ matchId }: { matchId: number }) {
  const rows = await prisma.aiPrediction.findMany({
    where: { matchId, market: "1X2", published: true },
    select: { model: true, pick: true },
  });
  const models = new Set(rows.map((r) => (r.model.startsWith("gpt-") ? "gpt" : r.model)));
  const n = models.size;
  const unanimous = n >= 2 && new Set(rows.map((r) => r.pick)).size === 1;

  return (
    <Link
      href="/predictions/scorecard"
      className="mt-3 flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-rose-500/[0.06] to-amber-500/[0.06] px-4 py-3 ring-1 ring-rose-500/15 transition-colors hover:ring-rose-500/30 dark:from-rose-500/10 dark:to-amber-500/10"
    >
      <Users className="h-4 w-4 shrink-0 text-rose-500" aria-hidden />
      <span className="min-w-0 flex-1 text-[13px] text-zinc-700 dark:text-white/70 break-keep">
        {n >= 2 ? (
          <>
            이 경기, <strong>AI {n}개</strong>가 승부를 예측했습니다
            {unanimous ? (
              <span className="ml-1.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">만장일치</span>
            ) : (
              <span className="ml-1.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">의견 갈림</span>
            )}
            <span className="ml-1.5 text-zinc-400 dark:text-white/40">픽은 성적표에서 (회원 공개)</span>
          </>
        ) : (
          <>
            통계모델·GPT·Grok·Gemini·Claude·Qwen — <strong>6개 AI 승부예측 리더보드</strong>가 매일 갱신됩니다
          </>
        )}
      </span>
      <span className="shrink-0 text-[12px] font-bold text-rose-600 dark:text-rose-400">AI 성적표 →</span>
    </Link>
  );
}
