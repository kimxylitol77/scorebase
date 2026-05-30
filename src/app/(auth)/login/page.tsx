import Link from "next/link";
import LoginForm from "./LoginForm";

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
