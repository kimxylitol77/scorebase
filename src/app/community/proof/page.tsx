// 인증샷 모음 — 운영자가 고른 SNS 공개 글(토토·프로토 투표권 인증)을 공식 임베드로 보여 준다. 사진은 원 플랫폼이 서빙.
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import BoardTabs from "@/components/BoardTabs";
import SnsEmbedFrame from "@/components/community/SnsEmbedFrame";
import { parseSnsUrl, SNS_LABEL } from "@/lib/sns-embed";

export const revalidate = 600; // 10분

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "토토·프로토 인증샷 모음",
  description: "SNS 에 올라온 스포츠토토·프로토 투표권 인증 글을 모았습니다. 원문은 각 플랫폼의 공식 임베드로 표시됩니다.",
  alternates: { canonical: `${SITE_URL}/community/proof` },
  // 본문이 전부 외부 임베드라 검색 색인 대상에서 뺀다
  robots: { index: false, follow: true },
};

export default async function ProofPage() {
  const rows = await prisma.snsEmbed.findMany({ where: { hidden: false }, orderBy: { createdAt: "desc" }, take: 30 });
  const items = rows.flatMap((r) => {
    const info = parseSnsUrl(r.url);
    return info ? [{ ...r, info }] : [];
  });

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <header className="mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> SNS 모음
        </span>
        <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight break-keep">토토·프로토 인증샷</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-neutral-600 break-keep dark:text-neutral-400">
          SNS 에 공개로 올라온 투표권 인증 글을 골라 모았습니다. 사진과 글은 작성자의 것이며, 각 플랫폼의 공식 임베드로 원문 그대로 표시됩니다.
        </p>
        <div className="mt-6">
          <BoardTabs active="proof" />
        </div>
      </header>

      {items.length === 0 ? (
        <p className="py-12 text-center text-sm text-neutral-500">아직 모은 인증샷이 없습니다.</p>
      ) : (
        <ul className="gap-4 sm:columns-2 lg:columns-3">
          {items.map((it) => (
            <li key={it.id} className="mb-4 break-inside-avoid overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
              <SnsEmbedFrame platform={it.info.platform} embedUrl={it.info.embedUrl} title={`${SNS_LABEL[it.info.platform]} 인증 글`} />
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                <span className="min-w-0 truncate text-neutral-600 dark:text-neutral-300">{it.note || SNS_LABEL[it.info.platform]}</span>
                <a href={it.url} target="_blank" rel="noopener noreferrer nofollow" className="shrink-0 font-semibold text-rose-600 hover:underline dark:text-rose-400">
                  원문 보기
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-[11px] leading-relaxed text-neutral-400 break-keep">
        합법 스포츠토토·프로토 투표권 인증 글만 싣습니다. 본인 글을 내리고 싶으면 원 플랫폼에서 글을 지우거나 비공개로 바꾸면 여기서도 바로 사라집니다. 베팅 권유가 아니며 만 19세 미만은 구매할 수 없습니다.
      </p>
    </main>
  );
}
