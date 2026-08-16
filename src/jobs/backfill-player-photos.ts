// 선수 사진 백필 — TheSportsPlayer.photoUrl 이 빈 선수를 ts 로 채운다. cron: /api/cron/player-photos.
//
// 왜 cron 인가. 기존 백필 둘은 조건이 좁아 "row 는 있는데 photoUrl 만 null" 구간을 아무도 안 봤다
// (2026-08-17 실측: 선수 페이지 모집단 13,109명 중 4,002명 결손, ts 표본 6/6 은 사진 보유 = 순수
// 미수집). 신규 선수가 계속 유입되므로 일회성 스크립트가 아니라 상시 잡이어야 한다.
//
// 페이스 = ts 화이트리스트 IP 버스트 금지 규약([[no-burst-from-worker-ip]]). Vercel 은
// THESPORTS_PROXY_URL(Vultr) 경유라 같은 IP 를 쓴다 → 여기서도 간격을 지킨다.
// 멱등 — photoUrl 있으면 대상에서 빠지고, name·position 은 덮지 않는다(한글명 잠금 보호).
import { prisma } from "@/lib/db";
import { thesportsGet } from "@/lib/sports/thesports/client";

const PACE_MS = 400;
/** 회당 상한 — 400ms × 300 ≈ 2분. Vercel maxDuration 300s 안에서 여유. */
const DEFAULT_LIMIT = 300;

interface TsPlayerRow { logo?: string }

export async function runBackfillPlayerPhotos(opts?: { limit?: number }): Promise<{
  targets: number; filled: number; missing: number;
}> {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  // 모집단 = 선수 페이지가 실제 있는 선수(몸값 보유). 몸값 큰 순 = 노출 많은 순으로 먼저 채운다.
  const mv = await prisma.playerMarketValue.findMany({
    where: { currentValue: { gt: 0 } },
    orderBy: { currentValue: "desc" },
    select: { id: true },
  });
  const ids = mv.map((m) => m.id);

  const targets: string[] = [];
  for (let i = 0; i < ids.length && targets.length < limit; i += 2000) {
    const slice = ids.slice(i, i + 2000);
    const rows = await prisma.theSportsPlayer.findMany({
      where: { id: { in: slice }, photoUrl: null },
      select: { id: true },
    });
    // 몸값 순서 유지 — findMany 는 순서를 안 지킨다.
    const need = new Set(rows.map((r) => r.id));
    for (const id of slice) {
      if (targets.length >= limit) break;
      if (need.has(id)) targets.push(id);
    }
  }

  let filled = 0;
  let missing = 0;
  for (const id of targets) {
    let logo: string | null = null;
    try {
      const d = await thesportsGet<{ code: number; results?: TsPlayerRow[] }>(
        "/v1/football/player/with_stat/list",
        { uuid: id },
      );
      logo = d?.results?.[0]?.logo || null;
    } catch {
      // 개별 실패는 건너뛴다 — 다음 회차가 다시 집는다(멱등).
    }
    if (logo) {
      await prisma.theSportsPlayer.update({ where: { id }, data: { photoUrl: logo } });
      filled++;
    } else {
      missing++;
    }
    await new Promise((r) => setTimeout(r, PACE_MS));
  }
  console.log(`[player-photos] 대상 ${targets.length} · 채움 ${filled} · ts 에도 없음 ${missing}`);
  return { targets: targets.length, filled, missing };
}
