// 회원 로그인 — 이메일/비밀번호 + 구글 OAuth
import Link from "next/link";
import LoginForm from "./LoginForm";
import GoogleButton from "../GoogleButton";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ from?: string; error?: string }>;
}

// 구글 콜백 fail() 리다이렉트의 error 코드 → 사용자 문구 (없던 표시를 신설 — 감사 C3)
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth: "구글 로그인이 취소됐거나 응답이 올바르지 않습니다. 다시 시도해 주세요.",
  state: "보안 확인에 실패했습니다. 다시 시도해 주세요.",
  oauth_unconfigured: "구글 로그인이 아직 설정되지 않았습니다.",
  token: "구글 인증 처리에 실패했습니다. 다시 시도해 주세요.",
  userinfo: "구글 프로필을 가져오지 못했습니다. 다시 시도해 주세요.",
  profile: "구글 계정 정보가 올바르지 않습니다.",
  server: "로그인 처리 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};

export default async function LoginPage({ searchParams }: Props) {
  const { from, error } = await searchParams;
  const errorMsg = error ? (OAUTH_ERROR_MESSAGES[error] ?? OAUTH_ERROR_MESSAGES.server) : null;
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-2xl font-black tracking-tight">로그인</div>
          <div className="mt-1 text-sm text-neutral-500">스코어베이스 회원 로그인</div>
        </div>
        {errorMsg && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {errorMsg}
          </div>
        )}
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
