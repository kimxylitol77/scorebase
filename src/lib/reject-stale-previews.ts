// phantom·취소 매치가 POSTPONED 로 정리될 때 연결된 PUBLISHED PREVIEW 글을 REJECTED 로 내린다.
// 실제 열리지 않은 경기의 예측 글이 /articles·/leagues·sitemap 에 계속 노출되는 것을 차단.
import { prisma } from "@/lib/db";

/**
 * 주어진 매치들의 PUBLISHED PREVIEW 글을 REJECTED 로 전환. 전환된 글 수를 반환.
 * cleanup 경로(cleanup-stale-scheduled / cleanup-ghost / stale-ts-verify)가 매치를
 * POSTPONED 처리한 직후 호출한다. RECAP/ANALYSIS·이미 종료된 실경기 글은 건드리지 않는다.
 */
export async function rejectPreviewsForPostponed(matchIds: number[]): Promise<number> {
  if (matchIds.length === 0) return 0;
  const res = await prisma.article.updateMany({
    where: { matchId: { in: matchIds }, type: "PREVIEW", status: "PUBLISHED" },
    data: { status: "REJECTED" },
  });
  if (res.count > 0) {
    console.log(
      `[reject-stale-previews] ${res.count} PREVIEW article(s) → REJECTED ` +
        `(POSTPONED matchIds: ${matchIds.slice(0, 20).join(",")})`,
    );
  }
  return res.count;
}
