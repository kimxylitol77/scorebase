// detailLive.players → playerNameById Record 빌드 helper.
// BaseballBoxscoreCard 가 prop 으로 받는 매핑. TheSportsPlayer DB 캐시 lookup.

import { prisma } from "@/lib/db";

/**
 * detailLive.players ({ home: [{id, stats}], away: [{id, stats}] }) 에서 모든 player id 추출.
 */
function extractIds(players: unknown): string[] {
  const ids = new Set<string>();
  if (!players || typeof players !== "object") return [];
  for (const side of ["home", "away"] as const) {
    const arr = (players as Record<string, unknown>)[side];
    if (!Array.isArray(arr)) continue;
    for (const row of arr) {
      const id = (row as { id?: unknown })?.id;
      if (typeof id === "string" && id) ids.add(id);
      else if (typeof id === "number") ids.add(String(id));
    }
  }
  return Array.from(ids);
}

/**
 * detailLive.players 의 모든 player id → nameKo (없으면 shortName, 없으면 name) 매핑.
 * DB miss 또는 빈 입력이면 빈 객체 반환 (카드 hide 됨).
 */
export async function buildPlayerNameMap(
  players: unknown,
): Promise<Record<string, string>> {
  const ids = extractIds(players);
  if (ids.length === 0) return {};
  try {
    const rows = await prisma.theSportsPlayer.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, nameKo: true, shortName: true },
    });
    const map: Record<string, string> = {};
    for (const r of rows) {
      map[r.id] = r.nameKo ?? r.shortName ?? r.name;
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * detailLive.players 의 모든 player id → photoUrl 매핑.
 * photoUrl 없는 player 는 결과에 미포함.
 */
export async function buildPlayerPhotoMap(
  players: unknown,
): Promise<Record<string, string>> {
  const ids = extractIds(players);
  if (ids.length === 0) return {};
  try {
    const rows = await prisma.theSportsPlayer.findMany({
      where: { id: { in: ids }, photoUrl: { not: null } },
      select: { id: true, photoUrl: true },
    });
    const map: Record<string, string> = {};
    for (const r of rows) {
      if (r.photoUrl) map[r.id] = r.photoUrl;
    }
    return map;
  } catch {
    return {};
  }
}
