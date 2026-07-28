// 분석가 팔로우 토글 버튼 — form + 서버 액션 (클라이언트 JS 불필요).
// 비로그인 클릭 = 액션에서 /login 리다이렉트. 본인 프로필이면 호출부에서 렌더하지 말 것.
import { toggleAnalystFollowAction } from "@/app/analysis/actions";
import { UserPlus, UserCheck } from "lucide-react";

interface Props {
  analystId: string;
  /** 현재 로그인 회원이 이미 팔로우 중인지 */
  following: boolean;
  /** 로그인 리다이렉트 복귀 경로 (예: /experts/abc, /analysis/123) */
  from: string;
  /** compact = 글 상세 작성자 줄용 작은 버튼 */
  variant?: "default" | "compact";
  /** 아직 팔로우 안 한 사람에게 혜택을 한 줄로 — 버튼만 있으면 왜 눌러야 하는지 모른다 */
  hint?: boolean;
}

export default function FollowButton({
  analystId,
  following,
  from,
  variant = "default",
  hint = false,
}: Props) {
  const compact = variant === "compact";
  const form = (
    <form action={toggleAnalystFollowAction} className="inline-flex">
      <input type="hidden" name="analystId" value={analystId} />
      <input type="hidden" name="from" value={from} />
      <button
        type="submit"
        className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          compact ? "px-3 py-1 text-xs" : "px-4 py-2 text-sm"
        } ${
          following
            ? "bg-white/70 text-neutral-600 ring-black/10 hover:bg-neutral-100 dark:bg-white/5 dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"
            : "bg-rose-600 text-white ring-rose-600 shadow-[0_8px_24px_-10px_rgba(225,29,72,0.6)] hover:bg-rose-700"
        }`}
      >
        {following ? (
          <>
            <UserCheck className={compact ? "h-3 w-3" : "h-4 w-4"} aria-hidden /> 팔로잉
          </>
        ) : (
          <>
            <UserPlus className={compact ? "h-3 w-3" : "h-4 w-4"} aria-hidden /> 팔로우
          </>
        )}
      </button>
    </form>
  );

  // 이미 팔로우 중이면 혜택 설명이 필요 없다.
  if (!hint || following) return form;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      {form}
      <span className="text-[11px] leading-tight text-neutral-400 break-keep">
        팔로우하면 새 픽을 텔레그램으로 알려드려요
      </span>
    </span>
  );
}
