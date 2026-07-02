// 회원가입 — 이메일 가입 + 구글 OAuth
import Link from "next/link";
import SignupForm from "./SignupForm";
import GoogleButton from "../GoogleButton";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ from?: string }>;
}

export default async function SignupPage({ searchParams }: Props) {
  const { from } = await searchParams;
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-2xl font-black tracking-tight">회원가입</div>
          <div className="mt-1 text-sm text-neutral-500">스코어베이스 회원가입</div>
        </div>
        <ul className="mb-6 space-y-1.5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-white/[0.04] p-4 text-xs text-neutral-600 dark:text-neutral-400">
          <li>· 승부예측 올리면 경기 결과로 <strong>자동 채점</strong> — 내 적중률 기록</li>
          <li>· 활동 경험치로 <strong>12단계 등급</strong> 승급 + 적중률 랭킹 경쟁</li>
          <li>· FM 스타일 <strong>드림팀</strong> 저장·봇 대전</li>
        </ul>
        <GoogleButton from={from ?? "/"} label="구글로 시작하기" />
        <p className="mt-2 text-center text-[11px] text-neutral-400">
          구글로 가입하면 <a href="/terms" target="_blank" className="underline">이용약관</a>과{" "}
          <a href="/privacy" target="_blank" className="underline">개인정보처리방침</a>에 동의한 것으로 간주됩니다.
        </p>
        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
          <span className="text-xs text-neutral-400">또는 이메일로</span>
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
        </div>
        <SignupForm from={from ?? "/"} />
        <div className="mt-4 text-center text-sm text-neutral-500">
          이미 회원이신가요?{" "}
          <Link
            href="/login"
            className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            로그인
          </Link>
        </div>
      </div>
    </div>
  );
}
