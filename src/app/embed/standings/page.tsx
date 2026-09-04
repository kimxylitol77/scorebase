// 리그 순위표 임베드 위젯 — 외부 블로그가 iframe 으로 붙이는 화면(사이트 chrome 없음).
// URL: /embed/standings?league=EPL&rows=10&theme=light|dark
// 축구 리그만 — 야구·농구 순위는 소스 이중화 헬퍼가 따로라 범위 밖(reports/plans/embed-widgets).
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getStandingsState, type StandingsRow } from "@/lib/sports/thesports/standings-helper";
import { SOCCER_LEAGUES, LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";
import TeamBadge from "@/components/TeamBadge";

export const revalidate = 600;

const SITE_URL = process.env.SITE_URL ?? "https://www.scorebase.kr";

export const metadata: Metadata = {
  title: "리그 순위표 위젯",
  robots: { index: false, follow: true },
};

export default async function StandingsEmbed({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const leagueRaw = one("league").toUpperCase();
  const league = (SOCCER_LEAGUES as Set<string>).has(leagueRaw) ? leagueRaw : "EPL";
  const rowsMax = Math.min(Math.max(Number(one("rows")) || 10, 3), 30);
  const dark = one("theme") === "dark";
  const label = LEAGUE_DISPLAY[league] ?? league;

  let rows: StandingsRow[] = [];
  let state: string = "ok";
  const nameById = new Map<number, string>();
  const logoById = new Map<number, string | null>();
  try {
    const st = await getStandingsState(league);
    rows = st.rows.slice(0, rowsMax);
    state = st.state;
    if (rows.length) {
      const teams = await prisma.team.findMany({
        where: { id: { in: rows.map((r) => r.teamId) } },
        select: { id: true, name: true, logoUrl: true },
      });
      for (const t of teams) {
        nameById.set(t.id, toKoreanTeamName(t.name, league));
        logoById.set(t.id, t.logoUrl ?? null);
      }
    }
  } catch {
    // 빌드 프리렌더 중 Neon 연결 실패 대비 — 빈 표로 렌더, revalidate 로 다음에 채움.
  }

  const wrap = dark ? "bg-neutral-950 text-neutral-100" : "bg-white text-neutral-900";
  const sub = dark ? "text-neutral-400" : "text-neutral-500";
  const line = dark ? "border-neutral-800" : "border-neutral-200";

  return (
    <div className={`${wrap} min-h-screen px-3 py-3 font-sans text-[13px]`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h1 className="text-[15px] font-bold tracking-tight">{label} 순위</h1>
        <a
          href={`${SITE_URL}/leagues/${league}`}
          target="_blank"
          rel="noopener"
          className={`text-[11px] ${sub} hover:underline`}
        >
          제공: 스코어베이스 →
        </a>
      </div>
      {rows.length === 0 ? (
        <p className={`py-6 text-center ${sub}`}>
          {state === "PRESEASON" ? "개막 전입니다. 시즌이 시작되면 자동으로 채워집니다." : "순위 데이터를 준비 중입니다."}
        </p>
      ) : (
        <table className="w-full border-collapse tabular-nums">
          <thead>
            <tr className={`border-b ${line} text-[11px] ${sub}`}>
              <th className="py-1 pr-1 text-left font-medium">#</th>
              <th className="py-1 text-left font-medium">팀</th>
              <th className="py-1 text-right font-medium">경기</th>
              <th className="py-1 text-right font-medium">승</th>
              <th className="py-1 text-right font-medium">무</th>
              <th className="py-1 text-right font-medium">패</th>
              <th className="py-1 text-right font-medium">득실</th>
              <th className="py-1 pl-1 text-right font-semibold">승점</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.teamId} className={`border-b ${line}`}>
                <td className={`py-1.5 pr-1 ${sub}`}>{r.position}</td>
                <td className="py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <TeamBadge logoUrl={logoById.get(r.teamId)} size={16} />
                    <span className="truncate">{nameById.get(r.teamId) ?? `#${r.teamId}`}</span>
                  </span>
                </td>
                <td className="py-1.5 text-right">{r.won + r.draw + r.loss}</td>
                <td className="py-1.5 text-right">{r.won}</td>
                <td className="py-1.5 text-right">{r.draw}</td>
                <td className="py-1.5 text-right">{r.loss}</td>
                <td className="py-1.5 text-right">
                  {r.goalDiff != null ? (r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff) : "-"}
                </td>
                <td className="py-1.5 pl-1 text-right font-semibold">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
