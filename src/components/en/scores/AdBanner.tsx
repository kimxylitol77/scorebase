// scores__AdBanner (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import { prisma } from "@/lib/db";
import Link from "next/link";

export default async function AdBanner() {
  // 테이블 미생성 등 어떤 이유로든 조회 실패 시 house ad 로 폴백
  // (/scores 는 핵심 페이지이므로 광고 때문에 절대 깨지지 않게).
  let banner: Awaited<ReturnType<typeof prisma.adBanner.findUnique>> = null;
  try {
    banner = await prisma.adBanner.findUnique({ where: { id: 1 } });
  } catch {
    return <TransferPromoBanner />;
  }

  // 유료 광고가 켜져 있으면 이미지 광고 표시
  if (banner?.enabled && banner.imageUrl) {
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={banner.imageUrl}
        alt="Ad"
        width={banner.width || undefined}
        height={banner.height || undefined}
        style={{ maxWidth: "100%", height: "auto" }}
        className="rounded-xl"
      />
    );
    return (
      <div className="flex justify-center">
        {banner.linkUrl ? (
          <a
            href={banner.linkUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            aria-label="Ad"
            className="inline-block"
          >
            {img}
          </a>
        ) : (
          img
        )}
      </div>
    );
  }

  // 광고가 없으면 자사 이적시장 홍보 (house ad)
  return <TransferPromoBanner />;
}

// 자사 이적시장(/transfers) 홍보 — 얇은 리더보드 띠, 폭 100% 반응형.
function TransferPromoBanner() {
  return (
    <Link
      href="/transfers"
      aria-label="Go to transfers"
      className="group block overflow-hidden rounded-xl border border-indigo-400/20"
    >
      <div className="relative flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900">
        <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(60%_120%_at_100%_50%,rgba(244,63,94,0.28),transparent)]" />
        <div className="relative flex items-center gap-3 min-w-0">
          <span className="text-xl sm:text-2xl" aria-hidden>
            ⚽
          </span>
          <div className="min-w-0">
            <p className="text-sm sm:text-base font-bold text-white leading-tight truncate">
              Summer <span className="text-rose-400">transfer window</span> in full
            </p>
            <p className="hidden sm:block text-[11px] text-indigo-200/70 leading-tight">
              Signings, exits, fees and rumours in one place
            </p>
          </div>
        </div>
        <span className="relative shrink-0 inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-white bg-white/10 group-hover:bg-white/20 px-3 py-1.5 rounded-lg transition">
          Open
          <span className="transition group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </Link>
  );
}
