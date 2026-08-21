// 예상 라인업 아래 "부상·결장 명단" 조립 — /live 상세와 PREVIEW 글이 같은 결과를 내도록 한 곳에.
//
// 소스 우선순위는 /injuries 페이지와 동일하게 맞춘다(injury-source-priority 규칙):
//   ① TheSports lineup.injury 가 정본. Map 에 key 가 있으면 그 팀은 추적 중이라 0명도 신뢰한다.
//   ② key 가 없는(=lineup 캐시가 없는) 팀만 InjurySnapshot(af 일별 수집분)으로 보강.
// 예전에는 두 화면이 af 스냅샷만 봐서 /injuries 와 명단이 서로 달랐고, 이름도 af 축약형
// ("W. Saliba")이 그대로 나갔다. 이름 해석도 /injuries 와 같은 resolvePlayerNames 를 쓴다.
import { prisma } from "@/lib/db";
import { getTheSportsInjuriesByTeam, type TSInjuryRaw } from "@/lib/sports/thesports/injuries";
import { resolvePlayerNames } from "@/lib/players/resolvePlayerName";
import { translateReason, classifySeverity, type Severity } from "@/lib/sports/injury-format";
import { teamNameMatches } from "@/lib/predict/club-xi-leagues";

export interface InjuryLineOut {
  name: string;
  reason: string;
  sev: Severity;
  inXi?: boolean;
}
interface XiPlayer { id?: string; name: string; nameKo?: string }
interface SideIn { teamId: number; teamName: string; xi: XiPlayer[] }

/** af 축약형("A. Gonzalez") ↔ 풀네임 매칭 키 — 성(마지막 토큰) + 첫 이니셜 */
function nameKey(s: string): string {
  const tokens = s.trim().split(/\s+/);
  const n = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s.&·'-]/g, "");
  return `${n(tokens[tokens.length - 1] ?? "")}|${n(tokens[0] ?? "")[0] ?? ""}`;
}

const SEV_RANK = { long: 0, short: 1, returning: 2, non_injury: 3, unknown: 4 } as const;

export async function buildInjuryLines(
  league: string,
  home: SideIn,
  away: SideIn,
): Promise<{ injuriesHome: InjuryLineOut[]; injuriesAway: InjuryLineOut[]; injuredXiIds: string[] }> {
  const empty = { injuriesHome: [], injuriesAway: [], injuredXiIds: [] };
  try {
    // ① ts 정본 — 양 팀만 조회
    const tsByTeam = await getTheSportsInjuriesByTeam([home.teamId, away.teamId]).catch(
      () => new Map<number, TSInjuryRaw[]>(),
    );

    // ② ts 가 못 읽은 팀만 af 스냅샷. 3일 내 스냅샷이 없으면 그 팀은 명단 없음.
    const needAf = [home, away].filter((s) => !tsByTeam.has(s.teamId));
    let snaps: { teamName: string; playerAfId: number | null; playerName: string; reason: string | null }[] = [];
    if (needAf.length) {
      const latest = await prisma.injurySnapshot.findFirst({
        where: { league, capturedAt: { gte: new Date(Date.now() - 3 * 86400e3) } },
        orderBy: { capturedAt: "desc" },
        select: { capturedOn: true },
      });
      if (latest) {
        snaps = await prisma.injurySnapshot.findMany({
          where: { league, capturedOn: latest.capturedOn },
          select: { teamName: true, playerAfId: true, playerName: true, reason: true },
        });
      }
    }

    // 이름 해석은 두 소스를 합쳐 한 번에 — /injuries 와 같은 해석기.
    const forResolve = [
      ...[...tsByTeam.values()].flat().map((r) => ({ apiFootballId: r.playerId, nameEn: r.playerName })),
      ...snaps.map((s) => ({ apiFootballId: s.playerAfId, nameEn: s.playerName })),
    ];
    const resolved = await resolvePlayerNames(forResolve, "soccer", league).catch(() => new Map());
    const koOf = (afId: number | null | undefined, en: string) => resolved.get(afId ?? en)?.ko;

    const injuredXiIds: string[] = [];
    const linesFor = (side: SideIn): InjuryLineOut[] => {
      const xiHit = (en: string) => {
        const hit = side.xi.find((p) => nameKey(p.name) === nameKey(en));
        if (hit?.id) injuredXiIds.push(hit.id);
        return hit;
      };
      const ts = tsByTeam.get(side.teamId);
      const rows: InjuryLineOut[] = ts
        ? ts.slice(0, 12).map((r) => {
            const hit = xiHit(r.playerName);
            return {
              name: hit?.nameKo || koOf(r.playerId, r.playerName) || hit?.name || r.playerName,
              reason: r.overrideKo || translateReason(r.reason ?? ""),
              sev: r.overrideSev ?? classifySeverity(r.reason ?? ""),
              inXi: !!hit,
            };
          })
        : snaps
            .filter((s) => teamNameMatches(s.teamName, side.teamName))
            .slice(0, 12)
            .map((s) => {
              const hit = xiHit(s.playerName);
              return {
                name: hit?.nameKo || koOf(s.playerAfId, s.playerName) || hit?.name || s.playerName,
                reason: translateReason(s.reason ?? ""),
                sev: classifySeverity(s.reason ?? ""),
                inXi: !!hit,
              };
            });
      return rows.sort((a, b) => {
        if (a.inXi !== b.inXi) return a.inXi ? -1 : 1;
        return SEV_RANK[a.sev] - SEV_RANK[b.sev];
      });
    };

    return { injuriesHome: linesFor(home), injuriesAway: linesFor(away), injuredXiIds };
  } catch {
    return empty; // 부상 조회 실패 — 명단 없이 예상 라인업만 표시
  }
}
