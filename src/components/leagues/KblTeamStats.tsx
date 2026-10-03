// KBL 통계 탭 "팀 통계" — 공식 /league/rank 팀 시즌 누적을 경기당으로. 이번 시즌 기록이 없으면(개막 직후) 지난 시즌을 "지난 시즌"으로.
// 실점은 공식 표에 없어 우리 DB 정규시즌 경기로 계산한다(공식 표 마지막 경기일까지 — 플레이오프 제외).
import Link from "next/link";
import { prisma } from "@/lib/db";
import TeamLogoImg from "@/components/TeamLogoImg";
import { fetchKblSeasonList, fetchKblTeamRank, type KblTeamRankRow } from "@/lib/sports/kbl-api";
import { KBL_TEAM_CODE } from "@/lib/sports/kbl-game";

const ID_BY_CODE: Record<string, number> = Object.fromEntries(Object.entries(KBL_TEAM_CODE).map(([id, c]) => [c, Number(id)]));
const pct = (m: number, a: number) => (a > 0 ? `${((m / a) * 100).toFixed(1)}` : "-");
const per = (v: number, g: number) => (g > 0 ? (v / g).toFixed(1) : "-");
const ymd = (s: string) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), 15)); // 그날 한국 자정 직전

export default async function KblTeamStats() {
  const seasons = await fetchKblSeasonList();
  let label = "", rows: KblTeamRankRow[] = [], last = false, start = "";
  for (const [i, s] of seasons.slice(0, 2).entries()) {
    rows = await fetchKblTeamRank(s.glkey);
    if (rows.length) { label = s.label; last = i > 0; start = s.start; break; }
  }
  if (!rows.length) return null;

  // 실점 — 시즌 시작일 ~ 공식 표의 마지막 경기일
  const from = ymd(start), to = ymd(rows.reduce((m, r) => (r.gameDate > m ? r.gameDate : m), rows[0].gameDate));
  const ids = rows.map((r) => ID_BY_CODE[r.teamCode]).filter(Boolean);
  const [games, teams] = await Promise.all([
    prisma.match.findMany({
      where: { league: "KBL", status: "FINISHED", startTime: { gte: new Date(from.getTime() - 86400_000), lte: to }, playoffRound: null },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    }),
    prisma.team.findMany({ where: { id: { in: ids } }, select: { id: true, logoUrl: true } }),
  ]);
  const logo = new Map(teams.map((t) => [t.id, t.logoUrl]));
  const allowed = new Map<number, { pa: number; g: number }>();
  for (const m of games) {
    for (const [id, pa] of [[m.homeTeamId, m.awayScore ?? 0], [m.awayTeamId, m.homeScore ?? 0]] as const) {
      const v = allowed.get(id) ?? { pa: 0, g: 0 };
      v.pa += pa; v.g += 1; allowed.set(id, v);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
        <h2 className="text-base font-bold tracking-tight">팀 통계</h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${last ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
          {label} {last ? "지난 시즌" : "이번 시즌"}
        </span>
        <span className="text-[12px] text-neutral-500">경기당 기록 · KBL 공식</span>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
        <table className="w-full whitespace-nowrap text-[13px] tabular-nums">
          <thead className="text-[11px] text-neutral-500">
            <tr className="border-b border-neutral-100 dark:border-white/[0.06]">
              <th className="sticky left-0 bg-white px-3 py-2 text-left font-medium dark:bg-neutral-950">팀</th>
              <th className="px-2 py-2 font-medium">승-패</th>
              <th className="px-2 py-2 font-medium">득점</th>
              <th className="px-2 py-2 font-medium">실점</th>
              <th className="px-2 py-2 font-medium">득실</th>
              <th className="px-2 py-2 font-medium">야투%</th>
              <th className="px-2 py-2 font-medium">3점</th>
              <th className="px-2 py-2 font-medium">3점%</th>
              <th className="px-2 py-2 font-medium">자유투%</th>
              <th className="px-2 py-2 font-medium">리바</th>
              <th className="px-2 py-2 font-medium">어시</th>
              <th className="px-2 py-2 font-medium">스틸</th>
              <th className="px-2 py-2 font-medium">블록</th>
              <th className="px-2 py-2 font-medium">턴오버</th>
              <th className="px-2 py-2 font-medium">홈</th>
              <th className="px-2 py-2 font-medium">원정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
            {rows.map((r) => {
              const id = ID_BY_CODE[r.teamCode];
              const g = r.gameCount;
              const pa = id ? allowed.get(id) : undefined;
              const ppg = r.score / g;
              const opp = pa && pa.g > 0 ? pa.pa / pa.g : null;
              const diff = opp != null ? ppg - opp : null;
              const name = (
                <span className="flex items-center gap-2">
                  <span className="w-4 text-right text-xs text-neutral-400">{r.rank}</span>
                  <TeamLogoImg url={id ? logo.get(id) : null} name={r.teamName2} size={20} className="h-5 w-5 shrink-0 object-contain" fallbackClassName="h-5 w-5 shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-700" />
                  <span className="font-semibold">{r.teamName2}</span>
                </span>
              );
              return (
                <tr key={r.teamCode} className="text-center">
                  <td className="sticky left-0 bg-white px-3 py-2 text-left dark:bg-neutral-950">
                    {id ? <Link href={`/teams/${id}`} prefetch={false} className="hover:underline">{name}</Link> : name}
                  </td>
                  <td className="px-2 py-2 font-semibold">{r.TWin}-{r.TLoss}</td>
                  <td className="px-2 py-2">{ppg.toFixed(1)}</td>
                  <td className="px-2 py-2">{opp != null ? opp.toFixed(1) : "-"}</td>
                  <td className={`px-2 py-2 font-semibold ${diff == null ? "" : diff > 0 ? "text-emerald-600 dark:text-emerald-400" : diff < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>
                    {diff == null ? "-" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}`}
                  </td>
                  <td className="px-2 py-2">{pct(r.fg + r.threep, r.fgA + r.threepA)}</td>
                  <td className="px-2 py-2">{per(r.threep, g)}</td>
                  <td className="px-2 py-2">{pct(r.threep, r.threepA)}</td>
                  <td className="px-2 py-2">{pct(r.ft, r.ftA)}</td>
                  <td className="px-2 py-2">{per(r.OR + r.DR, g)}</td>
                  <td className="px-2 py-2">{per(r.AS, g)}</td>
                  <td className="px-2 py-2">{per(r.ST, g)}</td>
                  <td className="px-2 py-2">{per(r.BS, g)}</td>
                  <td className="px-2 py-2">{per(r.TO, g)}</td>
                  <td className="px-2 py-2 text-neutral-500">{r.hwin}-{r.hloss}</td>
                  <td className="px-2 py-2 text-neutral-500">{r.awin}-{r.aloss}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-1 text-[11px] text-neutral-400 break-keep">
        정규시즌 기준 · 야투%는 2점+3점 · 리바운드는 공격+수비 · 실점은 경기 결과로 계산 · 휴대폰에선 옆으로 밀어 보세요
        {last ? " · 이번 시즌 기록이 쌓이면 자동으로 바뀝니다" : ""}
      </p>
    </section>
  );
}
