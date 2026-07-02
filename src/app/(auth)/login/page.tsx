import Link from "next/link";
import LoginForm from "./LoginForm";
import GoogleButton from "../GoogleButton";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ from?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { from } = await searchParams;
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-2xl font-black tracking-tight">로그인</div>
          <div className="mt-1 text-sm text-neutral-500">스코어베이스 회원 로그인</div>
        </div>
        <GoogleButton from={from ?? "/"} label="구글로 로그인" />
        <p className="mt-2 text-center text-[11px] text-neutral-400">
          구글 계정으로 처음 로그인하면 가입되며, <a href="/terms" target="_blank" className="underline">이용약관</a>과{" "}
          <a href="/privacy" target="_blank" className="underline">개인정보처리방침</a>에 동의한 것으로 간주됩니다.
        </p>
        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
          <span className="text-xs text-neutral-400">또는 이메일로</span>
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
        </div>
        <LoginForm from={from ?? "/"} />
        <div className="mt-4 text-center text-sm text-neutral-500">
          아직 회원이 아니신가요?{" "}
          <Link
            href="/signup"
            className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            회원가입
          </Link>
        </div>
      </div>
    </div>
  );
}
