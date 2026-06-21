// 페이지 상단 은은한 메시 글로우 — 라이트/다크 공용 앰비언트 배경 (프리미엄 톤).
export default function AmbientGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[440px] overflow-hidden"
    >
      <div className="absolute -top-40 left-[15%] h-96 w-96 rounded-full bg-rose-500/10 blur-[130px] dark:bg-rose-500/15" />
      <div className="absolute -top-32 right-[12%] h-[26rem] w-[26rem] rounded-full bg-emerald-500/[0.06] blur-[140px] dark:bg-emerald-500/10" />
    </div>
  );
}
