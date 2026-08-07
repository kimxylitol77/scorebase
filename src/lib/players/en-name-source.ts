// TheSports 축구 선수 id → 영문 풀네임 해석 — 무료 소스(팀 로스터 JSON · 라인업 캐시)만 사용.
//   TheSportsPlayer.name 은 영문 풀네임 칸인데, 한글명만 아는 상태로 신규 행을 만들면 여기가 오염된다.
//   신규 생성 전에 이 맵으로 영문을 먼저 찾으라고 두는 모듈. 상세는 docs/player-en-name-restore/.
import type { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const SQUADS_PATH = new URL("../../../data/team-squads.json", import.meta.url).pathname;

/** 복구값으로 쓸 수 있는 영문명인지 — 한글이 섞였거나 비면 거부(오염을 다른 모양으로 바꾸지 않는다). */
export function usableEnName(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || /[가-힣]/.test(s) || !/[A-Za-z]/.test(s)) return null;
  return s;
}

interface SquadFile {
  [teamId: string]: { squad?: Array<{ id?: string; name?: string }> };
}
interface LineupPlayer {
  id?: string;
  name?: string;
}

/** data/team-squads.json 로스터. 최신 풀네임이라 라인업보다 우선한다. */
export function enNamesFromSquads(): Map<string, string> {
  const out = new Map<string, string>();
  let file: SquadFile;
  try {
    file = JSON.parse(readFileSync(SQUADS_PATH, "utf8")) as SquadFile;
  } catch {
    return out; // 로스터 파일이 없어도 라인업만으로 동작
  }
  for (const team of Object.values(file)) {
    for (const p of team.squad ?? []) {
      const en = usableEnName(p?.name);
      if (p?.id && en) out.set(p.id, en);
    }
  }
  return out;
}

/** TheSportsMatchCache.lineup — 출전 이력이 있는 선수. 최신 캐시가 뒤에 오도록 정렬해 덮어쓴다. */
export async function enNamesFromLineups(prisma: PrismaClient): Promise<Map<string, string>> {
  const rows = await prisma.theSportsMatchCache.findMany({
    where: { lineup: { not: undefined } },
    select: { lineup: true },
    orderBy: { updatedAt: "asc" },
  });
  const out = new Map<string, string>();
  for (const r of rows) {
    const lu = (r.lineup as { lineup?: { home?: LineupPlayer[]; away?: LineupPlayer[] } } | null)?.lineup;
    if (!lu) continue;
    for (const side of [lu.home, lu.away]) {
      if (!Array.isArray(side)) continue;
      for (const p of side) {
        const en = usableEnName(p?.name);
        if (p?.id && en) out.set(p.id, en);
      }
    }
  }
  return out;
}

/** squad 우선 합집합. 신규 행 생성 전에 이걸로 영문을 찾고, 없을 때만 한글로 대체할 것. */
export async function resolveEnNames(prisma: PrismaClient): Promise<Map<string, string>> {
  const [squads, lineups] = [enNamesFromSquads(), await enNamesFromLineups(prisma)];
  return new Map([...lineups, ...squads]);
}
