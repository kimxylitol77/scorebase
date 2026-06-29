// EWC(이스포츠 월드컵) LoL — 그룹 스테이지 순위·결과 server 컴포넌트.
//   순위표를 TheSports 가 안 줘서(table/list 0건) DB 매치(league="EWC")에서 직접 계산.
//   녹아웃은 전부 TBD(미정)+대진연결 정보 없음이라 미구현 — 그룹 결과 + 예정/완료 경기만.
//   매치 들어오면(KC-TL 등) 자동 갱신(정적 JSON 아님).
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";

interface TeamAgg {
  teamId: number;
  name: string;
  logo: string;
  seriesW: number;
  seriesL: number;
  setsW: number;
  setsL: number;
}

const fmtDate = (d: Date) =>
  `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
const fmtTime = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export default async function EwcStandings({ name }: { name: string }) {
  const matches = await prisma.match.findMany({
    where: { league: "EWC" },
    include: {
      homeTeam: { select: { id: true, name: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, logoUrl: true } },
    },
    orderBy: { startTime: "asc" },
  });

  // 그룹 순위 — FINISHED 시리즈(BO5)에서 승패·세트 집계
  const agg = new Map<number, TeamAgg>();
  const ensure = (t: { id: number; name: string; logoUrl: string | null }): TeamAgg => {
    let a = agg.get(t.id);
    if (!a) {
      a = { teamId: t.id, name: toKoreanTeamName(t.name) || t.name, logo: t.logoUrl ?? "", seriesW: 0, seriesL: 0, setsW: 0, setsL: 0 };
      agg.set(t.id, a);
    }
    return a;
  };

  for (const m of matches) {
    if (m.status !== "FINISHED" || m.homeScore == null || m.awayScore == null) continue;
    const h = ensure(m.homeTeam);
    const a = ensure(m.awayTeam);
    h.setsW += m.homeScore; h.setsL += m.awayScore;
    a.setsW += m.awayScore; a.setsL += m.homeScore;
    if (m.homeScore > m.awayScore) { h.seriesW++; a.seriesL++; }
    else if (m.awayScore > m.homeScore) { a.seriesW++; h.seriesL++; }
  }

  const standings = [...agg.values()].sort(
    (x, y) => y.seriesW - x.seriesW || (y.setsW - y.setsL) - (x.setsW - x.setsL) || y.setsW - x.setsW,
  );

  const finished = matches.filter((m) => m.status === "FINISHED");
  const upcoming = matches.filter((m) => m.status !== "FINISHED");

  const card =
    "overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none";
  const headRow = "text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-white/10";

  const TeamCell = ({ logo, label }: { logo: string; label: string }) => (
    <span className="flex items-center gap-2 min-w-0">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
      ) : (
        <span className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
      )}
      <span className="font-semibold truncate">{label}</span>
    </span>
  );

  return (
    <div className="relative max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-5">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores?sport=esports" className="hover:underline">
          e스포츠 라이브
        </Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">{name} 그룹 순위</span>
      </nav>

      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 이스포츠 월드컵
        </span>
        <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name} LoL 그룹 순위</h1>
        <p className="text-sm text-neutral-500 mt-2 break-keep">
          League of Legends · 그룹 스테이지(BO5) · 2026 · TheSports
        </p>
      </header>

      {/* 리그 스위처 */}
      <div className="flex gap-1.5 flex-wrap">
        {[
          ["LOL", "LCK"],
          ["LEC", "LEC"],
          ["LCS", "LCS"],
          ["LPL", "LPL"],
          ["EWC", "이스포츠 월드컵"],
        ].map(([code, lbl]) => (
          <Link
            key={code}
            href={`/standings/${code}`}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition ${
              code === "EWC"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "bg-neutral-100 dark:bg-white/[0.06] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {lbl}
          </Link>
        ))}
      </div>

      {/* 그룹 순위 */}
      {standings.length > 0 && (
        <div className={card}>
          <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-white/10 text-sm font-bold text-neutral-700 dark:text-neutral-200">
            그룹 순위
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={headRow}>
                  <th className="text-left py-2.5 px-3 font-semibold w-10">#</th>
                  <th className="text-left py-2.5 px-2 font-semibold">팀</th>
                  <th className="text-center py-2.5 px-2 font-semibold w-12">승</th>
                  <th className="text-center py-2.5 px-2 font-semibold w-12">패</th>
                  <th className="text-center py-2.5 px-3 font-semibold w-20">세트</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((r, i) => (
                  <tr key={r.teamId} className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="text-left py-2.5 px-3 tabular-nums text-neutral-500 font-bold">{i + 1}</td>
                    <td className="py-2.5 px-2">
                      <Link href={`/teams/${r.teamId}`} className="hover:underline">
                        <TeamCell logo={r.logo} label={r.name} />
                      </Link>
                    </td>
                    <td className="text-center py-2.5 px-2 tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">{r.seriesW}</td>
                    <td className="text-center py-2.5 px-2 tabular-nums text-rose-500">{r.seriesL}</td>
                    <td className="text-center py-2.5 px-3 tabular-nums text-neutral-500">{r.setsW}-{r.setsL}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 경기 결과 */}
      {finished.length > 0 && (
        <div className={card}>
          <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-white/10 text-sm font-bold text-neutral-700 dark:text-neutral-200">
            경기 결과
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-white/5">
            {finished.map((m) => {
              const homeWin = (m.homeScore ?? 0) > (m.awayScore ?? 0);
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="text-xs text-neutral-400 tabular-nums w-12 shrink-0">{fmtDate(m.startTime)}</span>
                  <span className={`flex-1 text-right truncate ${homeWin ? "font-bold" : "text-neutral-500"}`}>{toKoreanTeamName(m.homeTeam.name) || m.homeTeam.name}</span>
                  <span className="tabular-nums font-black px-2 shrink-0">{m.homeScore} : {m.awayScore}</span>
                  <span className={`flex-1 truncate ${!homeWin ? "font-bold" : "text-neutral-500"}`}>{toKoreanTeamName(m.awayTeam.name) || m.awayTeam.name}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 예정 경기 */}
      {upcoming.length > 0 && (
        <div className={card}>
          <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-white/10 text-sm font-bold text-neutral-700 dark:text-neutral-200">
            예정 경기
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-white/5">
            {upcoming.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="text-xs text-neutral-400 tabular-nums w-20 shrink-0">{fmtDate(m.startTime)} {fmtTime(m.startTime)}</span>
                <span className="flex-1 text-right truncate font-semibold">{toKoreanTeamName(m.homeTeam.name) || m.homeTeam.name}</span>
                <span className="text-neutral-400 px-2 shrink-0">vs</span>
                <span className="flex-1 truncate font-semibold">{toKoreanTeamName(m.awayTeam.name) || m.awayTeam.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-neutral-400 text-center pt-1">
        ⓘ 이스포츠 월드컵은 그룹 스테이지 후 녹아웃으로 진행됩니다 · 녹아웃 대진은 확정 시 반영 · 시간 KST
      </p>
    </div>
  );
}
