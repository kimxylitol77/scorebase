// 국내 리그(KBL·WKBL·V-리그 남녀) 선수 명단 탭 — 정적 선수 사전을 팀별로 펼쳐 선수 상세로 보낸다.
// 리그 페이지 view=players 에서 쓴다. 통계는 각 선수 상세가 런타임으로 가져오므로 여기선 프로필만.
import Link from "next/link";
import { prisma } from "@/lib/db";
import TeamBadge from "@/components/TeamBadge";
import { toKoreanTeamName } from "@/lib/team-names";
import { KBL_TEAM_IDS, WKBL_TEAM_IDS } from "@/lib/sports/basketball-standings";
import { KOVO_TEAMS } from "@/lib/sports/kovo-api";
import { kblRoster, kblPosKo, kblAge } from "@/lib/sports/kbl-players";
import { wkblRoster, wkblPosKo } from "@/lib/sports/wkbl-players";
import { kovoRoster, kovoPosKo } from "@/lib/sports/kovo-players";

export type DomesticPlayerLeague = "KBL" | "WKBL" | "V_LEAGUE" | "V_LEAGUE_W";
export const DOMESTIC_PLAYER_LEAGUES = new Set<string>(["KBL", "WKBL", "V_LEAGUE", "V_LEAGUE_W"]);

interface Entry {
  id: string;
  name: string;
  no: number | null;
  posKo: string;
  height: number | null;
  birth: string | null;
  photo: string | null;
  tag: string | null; // 외국인·국적 등 짧은 배지
}

const SOURCE_LABEL: Record<DomesticPlayerLeague, string> = {
  KBL: "KBL 공식 등록 선수",
  WKBL: "WKBL 공식 등록 선수",
  V_LEAGUE: "KOVO 공식 현역 선수",
  V_LEAGUE_W: "KOVO 공식 현역 선수",
};

function teamIdsOf(league: DomesticPlayerLeague): number[] {
  if (league === "KBL") return Object.values(KBL_TEAM_IDS);
  if (league === "WKBL") return WKBL_TEAM_IDS.map(([, id]) => id);
  return Object.values(KOVO_TEAMS).filter((t) => t.league === league).map((t) => t.teamId);
}

function rosterOf(league: DomesticPlayerLeague, teamId: number): Entry[] {
  if (league === "KBL") {
    return kblRoster(teamId).map((p) => ({
      id: p.id, name: p.name, no: p.no, posKo: kblPosKo(p.pos), height: p.height, birth: p.birth, photo: p.photo,
      tag: p.country && p.country !== "대한민국" ? p.country : null,
    }));
  }
  if (league === "WKBL") {
    return wkblRoster(teamId).map((p) => ({
      id: p.id, name: p.name, no: p.no, posKo: wkblPosKo(p.pos), height: p.height, birth: p.birth, photo: p.photo, tag: null,
    }));
  }
  return kovoRoster(teamId).map((p) => ({
    id: p.id, name: p.name, no: p.no, posKo: kovoPosKo(p.pos), height: p.height, birth: p.birth, photo: p.photo,
    tag: p.foreign ? "외국인" : null,
  }));
}

export default async function DomesticLeaguePlayers({ league }: { league: DomesticPlayerLeague }) {
  const ids = teamIdsOf(league);
  const teams = await prisma.team.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, nameKo: true, logoUrl: true },
  });
  const sections = teams
    .map((t) => ({
      id: t.id,
      name: toKoreanTeamName(t.name, league) || t.nameKo || t.name,
      logoUrl: t.logoUrl,
      players: rosterOf(league, t.id),
    }))
    .filter((s) => s.players.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const total = sections.reduce((s, t) => s + t.players.length, 0);

  if (total === 0) {
    return (
      <p className="text-sm text-neutral-500">아직 등록 선수 명단이 없습니다. 공식 등록이 올라오면 주간 갱신으로 채워집니다.</p>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold">선수 명단</h2>
        <p className="text-xs text-neutral-500 mt-1">
          {sections.length}개 팀 · {total}명 · {SOURCE_LABEL[league]} · 선수를 누르면 프로필과 시즌별 기록으로 갑니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sections.map((t) => (
            <a
              key={t.id}
              href={`#team-${t.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
            >
              <TeamBadge logoUrl={t.logoUrl} size={14} />
              {t.name}
              <span className="text-neutral-400 tabular-nums">{t.players.length}</span>
            </a>
          ))}
        </div>
      </div>

      {sections.map((t) => (
        <section key={t.id} id={`team-${t.id}`} className="scroll-mt-32">
          <div className="flex items-center justify-between mb-3">
            <Link href={`/teams/${t.id}`} className="flex items-center gap-2 font-bold hover:underline">
              <TeamBadge logoUrl={t.logoUrl} size={24} />
              {t.name}
              <span className="text-xs font-normal text-neutral-500 tabular-nums">{t.players.length}명</span>
            </Link>
            <Link href={`/teams/${t.id}`} className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
              팀 페이지
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {t.players.map((p) => {
              const age = kblAge(p.birth);
              const meta = [p.no != null ? `#${p.no}` : null, p.posKo || null, p.height ? `${p.height}cm` : null, age != null ? `${age}세` : null]
                .filter(Boolean)
                .join(" · ");
              return (
                <Link
                  key={p.id}
                  href={`/players/${p.id}?league=${league}`}
                  className="flex items-center gap-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
                >
                  <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                    {p.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo} alt={p.name} className="w-full h-full object-cover object-top" loading="lazy" />
                    ) : (
                      <span className="text-xs font-bold text-neutral-500">{p.name.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-semibold text-sm truncate">{p.name}</span>
                      {p.tag && (
                        <span className="shrink-0 rounded px-1 py-px text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                          {p.tag}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-neutral-500 tabular-nums truncate">{meta}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
