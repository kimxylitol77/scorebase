// 회원 마이페이지 — 애플풍 2컬럼. 좌: 프로필·등급표(sticky) / 우: 활동통계·즐겨찾기·내 글.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { USER_COOKIE_NAME, readUserSessionCookie } from "@/lib/user-auth";
import { logoutUserAction } from "@/app/(auth)/actions";
import { GRADES, gradeByExp, levelProgress } from "@/lib/user-level";
import { AVATAR_EDIT_MIN_LEVEL } from "@/lib/avatars";
import { resolveAvatar } from "@/lib/analysis/analysts";
import DeleteAccountButton from "./DeleteAccountButton";
import AvatarPicker from "./AvatarPicker";
import AvatarUpload from "./AvatarUpload";
import NicknameEditor from "./NicknameEditor";
import FavoriteSummary from "./FavoriteSummary";
import AmbientGlow from "@/components/AmbientGlow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내 정보 · 스코어베이스",
  robots: { index: false, follow: false },
};

function fmtKst(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}.${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())}`;
}

interface Props {
  searchParams: Promise<{ welcome?: string }>;
}

export default async function AccountPage({ searchParams }: Props) {
  const { welcome } = await searchParams;
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) redirect("/login?from=/account");

  const [user, myPosts, agg, settled, correct] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true, nickname: true, createdAt: true, exp: true, level: true, points: true, avatarUrl: true, badge: true },
    }),
    prisma.post.findMany({
      where: { authorId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, title: true, views: true, likes: true, isCorrect: true, createdAt: true },
    }),
    prisma.post.aggregate({
      where: { authorId: session.userId },
      _count: { _all: true },
      _sum: { likes: true, views: true },
    }),
    prisma.post.count({ where: { authorId: session.userId, isCorrect: { not: null } } }),
    prisma.post.count({ where: { authorId: session.userId, isCorrect: true } }),
  ]);
  if (!user) redirect("/login?from=/account");

  const avatar = resolveAvatar(user.avatarUrl, user.nickname, user.level, user.badge);
  const canEditAvatar = user.level >= AVATAR_EDIT_MIN_LEVEL;
  const grade = gradeByExp(user.exp);
  const prog = levelProgress(user.exp);
  const totalPosts = agg._count._all;
  const totalLikes = agg._sum.likes ?? 0;
  const totalViews = agg._sum.views ?? 0;
  const winRate = settled > 0 ? Math.round((correct / settled) * 100) : null;

  return (
    <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <AmbientGlow />
      {welcome && (
        <div className="mb-5 rounded-2xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-800 break-keep dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300">
          👋 가입을 환영합니다! 아래 프로필에서 <strong>닉네임</strong>을 원하는 대로 바꿔보세요.
        </div>
      )}
      <div className="mb-8 px-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 마이페이지
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">내 정보</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
        {/* 좌: 프로필 + 등급표 (데스크탑 sticky) */}
        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          {/* 프로필 카드 */}
          <div className="rounded-3xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-6">
            <div className="flex flex-col items-center text-center">
              {avatar.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar.imageUrl} alt="" className="w-20 h-20 rounded-full object-cover shadow-sm" />
              ) : (
                <div className={`w-20 h-20 rounded-full ${avatar.bg} flex items-center justify-center text-4xl shadow-sm`}>
                  {avatar.emoji}
                </div>
              )}
              <div className="mt-3 text-lg font-bold">{user.nickname}</div>
              <div className="mt-1.5">
                <NicknameEditor current={user.nickname} />
              </div>
              <div className="mt-0.5 text-sm text-neutral-500">
                {grade.emoji} Lv.{grade.level} · {grade.name}
              </div>
            </div>

            {/* 경험치 바 */}
            <div className="mt-5">
              <div className="flex justify-between text-[11px] text-neutral-500 mb-1.5">
                <span>경험치 {user.exp.toLocaleString()}</span>
                {prog.next ? (
                  <span>다음 {prog.next.emoji} {prog.next.name}</span>
                ) : (
                  <span>최고 등급 👑</span>
                )}
              </div>
              <div className="h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.round(prog.ratio * 100)}%` }} />
              </div>
            </div>

            {/* 포인트 / 글 수 */}
            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-2xl bg-neutral-50 dark:bg-white/[0.04] py-2.5">
                <div className="text-base font-bold tabular-nums">{user.points.toLocaleString()}</div>
                <div className="text-[10px] text-neutral-500">포인트</div>
              </div>
              <div className="rounded-2xl bg-neutral-50 dark:bg-white/[0.04] py-2.5">
                <div className="text-base font-bold tabular-nums">{totalPosts}</div>
                <div className="text-[10px] text-neutral-500">작성 글</div>
              </div>
            </div>

            {/* 아바타 — 1등급은 고정 기본 이미지, 2등급(유소년)부터 프리셋·사진 변경 가능 */}
            <div className="mt-5">
              <div className="text-xs font-semibold text-neutral-500 mb-2">아바타</div>
              {canEditAvatar ? (
                <>
                  <AvatarPicker current={avatar.id} />
                  <AvatarUpload />
                </>
              ) : (
                <div className="rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 px-3 py-3 text-center">
                  <p className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">2등급부터 아바타를 바꿀 수 있어요</p>
                  <p className="text-[10px] text-neutral-400 mt-1">유소년 등급(경험치 1,000)에 도달하면 열려요</p>
                </div>
              )}
            </div>

            {/* 계정 정보 */}
            <div className="mt-5 pt-4 border-t border-black/5 dark:border-white/10 space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-neutral-500 shrink-0">이메일</span>
                <span className="font-medium truncate">{user.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">가입일</span>
                <span className="font-medium">{fmtKst(user.createdAt)}</span>
              </div>
            </div>

            <form action={logoutUserAction} className="mt-4">
              <button
                type="submit"
                className="w-full py-2.5 rounded-2xl bg-neutral-100 dark:bg-white/[0.06] hover:bg-neutral-200 dark:hover:bg-white/[0.1] text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              >
                로그아웃
              </button>
            </form>
          </div>

          {/* 등급표 */}
          <div className="rounded-3xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none overflow-hidden">
            <div className="px-5 py-3.5 text-sm font-semibold border-b border-black/5 dark:border-white/10">
              등급표 <span className="text-neutral-400 font-normal">12단계</span>
            </div>
            <div className="divide-y divide-black/5 dark:divide-white/5">
              {GRADES.map((g) => {
                const cur = g.level === grade.level;
                return (
                  <div key={g.level} className={`flex items-center gap-3 px-5 py-2 ${cur ? "bg-blue-50 dark:bg-blue-500/10" : ""}`}>
                    <span className="text-base w-5 text-center">{g.emoji}</span>
                    <span className={`text-[13px] flex-1 ${cur ? "font-bold text-blue-600 dark:text-blue-400" : "text-neutral-600 dark:text-neutral-400"}`}>
                      Lv.{g.level} {g.name}
                    </span>
                    <span className="text-[10px] text-neutral-400 tabular-nums">{g.minExp.toLocaleString()}+</span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* 우: 활동통계 + 즐겨찾기 + 내 글 */}
        <main className="space-y-5">
          {/* 활동 통계 */}
          <section className="rounded-3xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-6">
            <h2 className="text-sm font-semibold text-neutral-500 mb-4">활동 통계</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="작성 글" value={totalPosts} />
              <Stat label="받은 추천" value={totalLikes} />
              <Stat label="총 조회" value={totalViews} />
              <Stat
                label="예측 적중률"
                value={winRate != null ? `${winRate}%` : "–"}
                sub={settled > 0 ? `${correct}/${settled}` : "예측 없음"}
              />
            </div>
          </section>

          {/* 즐겨찾기 경기 (client island) */}
          <FavoriteSummary />

          {/* 내가 쓴 글 */}
          <section className="rounded-3xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/10">
              <h2 className="text-sm font-semibold">내가 쓴 글</h2>
              <Link href="/analysis/new" className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                + 글쓰기
              </Link>
            </div>
            {myPosts.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-neutral-500">아직 작성한 글이 없습니다.</p>
                <Link href="/analysis/new" className="inline-block mt-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
                  첫 스포츠 분석 글 써보기 →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-black/5 dark:divide-white/5">
                {myPosts.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/analysis/${p.id}`}
                      className="group flex items-center gap-3 px-6 py-3 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.03]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate transition-colors group-hover:text-rose-600 dark:group-hover:text-rose-400">{p.title}</div>
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          조회 {p.views} · 추천 {p.likes} · {fmtKst(p.createdAt)}
                        </div>
                      </div>
                      {p.isCorrect != null && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            p.isCorrect
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : "bg-neutral-500/15 text-neutral-500"
                          }`}
                        >
                          {p.isCorrect ? "적중" : "실패"}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 회원 탈퇴 — 개인정보 삭제권 행사 지점 (개인정보처리방침 6조) */}
          <section className="flex items-center justify-between rounded-3xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-6">
            <div className="text-xs text-neutral-500">
              더 이상 이용하지 않으시나요?{" "}
              <Link href="/privacy" className="hover:underline">개인정보처리방침</Link>
            </div>
            <DeleteAccountButton />
          </section>
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl bg-neutral-50 dark:bg-white/[0.04] p-3.5 text-center">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-neutral-500 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-neutral-400 mt-0.5">{sub}</div>}
    </div>
  );
}
