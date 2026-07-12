"use client";
// AI 원탁 소프트 게이트 — 비로그인 사용자에게 예정 픽 일부를 블러 처리해 가입을 유도한다.
// 콘텐츠는 서버 HTML 에 그대로 있어 SEO·크롤러는 전체를 보고, 사람만 게이트를 만난다.
// 마운트 시 /api/me 로 로그인 확인 — 로그인 상태면 자동 해제(ISR 캐시 유지 목적의 클라 게이트).
import { useEffect, useState } from "react";

export default function ConsensusGate({ children, title, desc }: { children: React.ReactNode; title: string; desc: string }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { nickname?: string | null }) => {
        if (!alive) return;
        if (j.nickname) setOpen(true);
        setChecked(true);
      })
      .catch(() => setChecked(true));
    return () => { alive = false; };
  }, []);

  if (open) return <>{children}</>;

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none select-none blur-[7px] opacity-60">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="mx-4 max-w-sm rounded-2xl bg-white/95 p-5 text-center shadow-xl ring-1 ring-zinc-200 backdrop-blur dark:bg-zinc-900/95 dark:ring-white/15">
          <p className="text-[15px] font-bold text-zinc-900 dark:text-white">{title}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-600 dark:text-white/60 break-keep">{desc}</p>
          <a
            href="/signup?from=%2Fpredictions%2Fscorecard"
            className="mt-3 inline-block rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white transition-opacity hover:opacity-85"
          >
            3초 구글 가입하고 전부 보기
          </a>
          {checked && (
            <p className="mt-2 text-[11px] text-zinc-400 dark:text-white/35">
              이미 회원이라면 <a href="/login?from=%2Fpredictions%2Fscorecard" className="underline underline-offset-2">로그인</a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
