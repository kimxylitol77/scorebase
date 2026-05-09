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
          <div className="text-2xl font-black tracking-tight">Scorebase</div>
          <div className="mt-1 text-sm text-neutral-500">관리자 로그인</div>
        </div>
        <LoginForm from={from ?? "/admin"} />
      </div>
    </div>
  );
}
