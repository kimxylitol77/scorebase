// 글쓰기 전 소프트 가입 안내 — 비로그인 유저를 로그인 폼으로 즉시 튕기지 않고,
// "가입하면 얻는 것 + 첫 글 보너스" 를 먼저 보여주는 전환 유도 카드. 두 write 페이지 공용.
import Link from "next/link";
import { PenLine, Trophy, Target, Gift } from "lucide-react";
import { EXP_REWARDS, POINT_REWARDS } from "@/lib/user-level";

export default function SignupGateCard({ from }: { from: string }) {
  const q = `from=${encodeURIComponent(from)}`;
  const bonusExp = EXP_REWARDS.analysisPost + EXP_REWARDS.firstPostBonus;
  const bonusPt = POINT_REWARDS.analysisPost + POINT_REWARDS.firstPostBonus;
  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.2)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none overflow-hidden">
      {/* 첫 글 보너스 히어로 */}
      <div className="bg-gradient-to-br from-rose-500 to-rose-600 px-6 py-6 text-white">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em]">
          <Gift className="h-3.5 w-3.5" aria-hidden /> 첫 글 보너스
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl font-black tabular-nums">+{bonusExp.toLocaleString()}</span>
          <span className="text-lg font-bold">XP</span>
          <span className="text-white/70">·</span>
          <span className="text-xl font-black tabular-nums">+{bonusPt}</span>
          <span className="text-sm font-bold">P</span>
        </div>
        <p className="mt-1 text-sm text-white/85">가입하고 첫 글을 남기면 바로 지급됩니다.</p>
      </div>

      <div className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <PenLine className="h-5 w-5 text-rose-500" aria-hidden /> 로그인하고 글 남기기
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
          <li className="flex items-start gap-2">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden />
            <span>승부예측을 올리면 경기 결과로 <strong>자동 채점</strong> — 내 적중률이 기록됩니다</span>
          </li>
          <li className="flex items-start gap-2">
            <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden />
            <span>활동 경험치로 <strong>12단계 등급</strong> 승급 + 적중률 랭킹 경쟁</span>
          </li>
          <li className="flex items-start gap-2">
            <Gift className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden />
            <span>FM 스타일 <strong>드림팀</strong> 저장·전술판 공유</span>
          </li>
        </ul>

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          <Link
            href={`/signup?${q}`}
            className="flex-1 inline-flex items-center justify-center rounded-full bg-rose-600 px-5 py-3 text-sm font-bold text-white shadow-[0_10px_30px_-10px_rgba(225,29,72,0.6)] transition-all hover:bg-rose-700 hover:scale-[1.01] active:scale-[0.99]"
          >
            30초 가입하고 글쓰기
          </Link>
          <Link
            href={`/login?${q}`}
            className="inline-flex items-center justify-center rounded-full bg-neutral-100 px-5 py-3 text-sm font-semibold text-neutral-700 transition-all hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-200 dark:hover:bg-white/10"
          >
            로그인
          </Link>
        </div>
        <p className="mt-3 text-center text-xs text-neutral-400">구글 계정이면 한 번의 클릭으로 시작할 수 있습니다.</p>
      </div>
    </div>
  );
}
