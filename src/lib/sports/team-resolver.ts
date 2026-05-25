// Team source-aware resolution helper.
//
// 같은 팀이 외부 source 별로 다른 ext id 를 가질 때 row 양산을 막기 위한 단일 진입점.
// (league, source, externalId) → canonical Team.id 매핑은 TeamSourceId 테이블에 저장.
//
// resolveTeamId 순서:
//   1) TeamSourceId.findUnique 로 직접 매핑
//   1.5) cross-league lookup: 같은 (source, externalId) 가 다른 league 에 매핑되어 있고
//        normalize name 도 일치하면 그 canonical Team 재사용 → 새 mapping row 만 추가.
//        클럽컵(UCL/UEL/UECL/COPA_LIB 등) 진출팀이 도메스틱+컵 양쪽 row 로 양산되는
//        패턴 차단. name 가드는 같은 ID 가 다른 팀을 가리키는 케이스(예: Barcelona vs
//        Barcelona SC) 오매핑 방지.
//   2) 같은 league 안에서 normalize name 일치하는 기존 Team 찾기 → 매핑 추가
//   3) 새 Team + TeamSourceId 동시 생성 (Team.externalId collision 시 기존 row 재사용)

import { prisma } from "@/lib/db";
import type { League } from "./types";

export function normalizeTeamName(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(
      /\b(fc|cf|ac|afc|sc|cd|rcd|sv|ss|ssc|nk|hsv|fk|club|de|el|hotspur|wanderers)\b/g,
      "",
    )
    .replace(/[^a-z0-9가-힣]/g, "");
}

export interface ResolveTeamArgs {
  league: League;
  source: string;
  externalId: string;
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
}

/** (league, source, externalId) → canonical Team.id. 필요 시 새 Team / 매핑 생성 */
export async function resolveTeamId(args: ResolveTeamArgs): Promise<number> {
  const { league, source, externalId, name } = args;
  const shortName = args.shortName ?? null;
  const logoUrl = args.logoUrl ?? null;

  // 1) 직접 매핑
  const mapped = await prisma.teamSourceId.findUnique({
    where: { league_source_externalId: { league, source, externalId } },
    select: { teamId: true },
  });
  if (mapped) {
    await prisma.team.update({
      where: { id: mapped.teamId },
      data: {
        name,
        shortName: shortName ?? undefined,
        logoUrl: logoUrl ?? undefined,
      },
    });
    return mapped.teamId;
  }

  const norm = normalizeTeamName(name);

  // 1.5) cross-league lookup — 같은 (source, externalId) 가 다른 league 에 이미 매핑돼 있고
  //      그 Team 의 normalize name 이 일치하면 재사용. 클럽컵 진출 팀 row 양산 방지.
  if (norm) {
    const otherLeagueMaps = await prisma.teamSourceId.findMany({
      where: { source, externalId, NOT: { league } },
      select: { teamId: true, team: { select: { id: true, name: true } } },
    });
    const canonical = otherLeagueMaps.find(
      (m) => normalizeTeamName(m.team.name) === norm,
    );
    if (canonical) {
      await prisma.teamSourceId
        .create({
          data: { league, source, externalId, teamId: canonical.teamId },
        })
        .catch((e: unknown) => {
          const code = (e as { code?: string })?.code;
          if (code !== "P2002") throw e;
        });
      await prisma.team.update({
        where: { id: canonical.teamId },
        data: {
          name,
          shortName: shortName ?? undefined,
          logoUrl: logoUrl ?? undefined,
        },
      });
      return canonical.teamId;
    }
  }

  // 2) name fuzzy match (같은 league 안에서 normalize 일치)
  if (norm) {
    const candidates = await prisma.team.findMany({
      where: { league },
      select: { id: true, name: true },
    });
    const matched = candidates.find((c) => normalizeTeamName(c.name) === norm);
    if (matched) {
      await prisma.teamSourceId
        .create({
          data: { league, source, externalId, teamId: matched.id },
        })
        .catch((e: unknown) => {
          // race 로 같은 (league, source, externalId) 가 동시 insert 됐을 수 있음 — 무시
          const code = (e as { code?: string })?.code;
          if (code !== "P2002") throw e;
        });
      await prisma.team.update({
        where: { id: matched.id },
        data: {
          name,
          shortName: shortName ?? undefined,
          logoUrl: logoUrl ?? undefined,
        },
      });
      return matched.id;
    }
  }

  // 3) 새 Team + 매핑 동시 생성. Team.externalId unique 충돌 시 기존 row 재사용.
  let teamId: number;
  try {
    const created = await prisma.team.create({
      data: { league, externalId, name, shortName, logoUrl },
    });
    teamId = created.id;
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code !== "P2002") throw e;
    const fallback = await prisma.team.findUnique({
      where: { league_externalId: { league, externalId } },
      select: { id: true },
    });
    if (!fallback) throw e;
    teamId = fallback.id;
    // 이름이 달라졌을 수 있으므로 metadata refresh
    await prisma.team.update({
      where: { id: teamId },
      data: {
        name,
        shortName: shortName ?? undefined,
        logoUrl: logoUrl ?? undefined,
      },
    });
  }

  await prisma.teamSourceId
    .create({
      data: { league, source, externalId, teamId },
    })
    .catch((e: unknown) => {
      const code = (e as { code?: string })?.code;
      if (code !== "P2002") throw e;
    });

  return teamId;
}
