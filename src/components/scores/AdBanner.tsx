// /scores 상단 광고 배너 — enabled 일 때만 이미지 표시. 링크 있으면 새 탭 이동.
// 관리자(/admin/ad)에서 이미지 URL·크기·링크·표시여부를 설정한다.

import { prisma } from "@/lib/db";

export default async function AdBanner() {
  // 테이블 미생성 등 어떤 이유로든 조회 실패 시 배너 없이 안전하게 넘어감
  // (/scores 는 핵심 페이지이므로 광고 때문에 절대 깨지지 않게).
  let banner: Awaited<ReturnType<typeof prisma.adBanner.findUnique>> = null;
  try {
    banner = await prisma.adBanner.findUnique({ where: { id: 1 } });
  } catch {
    return null;
  }
  if (!banner || !banner.enabled || !banner.imageUrl) return null;

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={banner.imageUrl}
      alt="광고"
      width={banner.width || undefined}
      height={banner.height || undefined}
      style={{ maxWidth: "100%", height: "auto" }}
      className="rounded-lg"
    />
  );

  return (
    <div className="flex justify-center">
      {banner.linkUrl ? (
        <a
          href={banner.linkUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          aria-label="광고"
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
