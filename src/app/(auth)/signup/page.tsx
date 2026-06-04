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
        <GoogleButton from={from ?? "/"} label="구글로 시작하기" />
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
