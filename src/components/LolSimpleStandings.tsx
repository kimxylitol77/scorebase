// 해외 LoL 리그(LEC/LCS) 순위표 + 팀별 로스터 — 매치 미수집이라 KDA·통계 없이 순위·프로필만.
// 데이터: data/lol-standings-{LEAGUE}.json (build-lol-standings.ts --league=). LCK 풍부 탭(LolStandings)과 별개.
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import lecData from "../../data/lol-standings-LEC.json";
import lcsData from "../../data/lol-standings-LCS.json";

interface RosterPlayer {
  playerId: string;
  name: string;
  realName: string;
  photo: string;
  position: number | null;
}
interface Row {
  rank: number;
  teamId: string;
  name: string;
  short: string;
  logo: string;
  win: number;
  lose: number;
  roster: RosterPlayer[];
}
interface Data {
  league: string;
  name: string;
  updatedAt: string;
  standings: Row[];
}

const DATA: Record<string, Data> = {
  LEC: lecData as Data,
  LCS: lcsData as Data,
};

// TheSports position 코드 → 역할 (1원딜·2미드·3탑·4정글·5서포터, T1 로스터로 검증).
const POS_LABEL: Record<number, string> = { 1: "원딜", 2: "미드", 3: "탑", 4: "정글", 5: "서포터" };

const REGION_SUB: Record<string, string> = {
  LEC: "유럽 · League of Legends EMEA Championship",
  LCS: "북미 · League of Legends Championship Series",
};

export default function LolSimpleStandings({ league, name }: { league: string; name: string }) {
  const data = DATA[league];
  if (!data) return null;

  return (
    <div className="relative max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-5">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores?sport=esports" className="hover:underline">
          e스포츠 라이브
        </Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">{name} 순위표</span>
      </nav>

      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 리그 순위
        </span>
        <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name} 순위표</h1>
        <p className="text-sm text-neutral-500 mt-2 break-keep">
          {REGION_SUB[league] ?? "League of Legends"} · 2026 시즌 · TheSports
        </p>
      </header>

      {/* 리그 스위처 — LCK ↔ LEC ↔ LCS */}
      <div className="flex gap-1.5">
        {[
          ["LOL", "LCK"],
          ["LEC", "LEC"],
          ["LCS", "LCS"],
        ].map(([code, lbl]) => (
          <Link
            key={code}
            href={`/standings/${code}`}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition ${
              code === league
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "bg-neutral-100 dark:bg-white/[0.06] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {lbl}
          </Link>
        ))}
      </div>

      {/* 순위표 */}
      <div className="overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-white/10">
                <th className="text-right py-2.5 pl-4 pr-2 font-semibold">#</th>
                <th className="text-left py-2.5 px-2 font-semibold">팀</th>
                <th className="text-center py-2.5 px-2 font-semibold w-12">승</th>
                <th className="text-center py-2.5 px-2 font-semibold w-12">패</th>
                <th className="text-right py-2.5 pr-4 pl-2 font-semibold w-16">승률</th>
              </tr>
            </thead>
            <tbody>
              {data.standings.map((r) => {
                const played = r.win + r.lose;
                const wr = played ? Math.round((r.win / played) * 100) : 0;
                return (
                  <tr
                    key={r.teamId}
                    className="border-b border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  >
                    <td className="text-right py-2.5 pl-4 pr-2 tabular-nums text-neutral-500 font-bold">{r.rank}</td>
                    <td className="py-2.5 px-2">
                      <span className="flex items-center gap-2.5">
                        {r.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.logo} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
                        ) : (
                          <span className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                        )}
                        <span className="font-semibold truncate max-w-[180px] sm:max-w-none">{r.name}</span>
                        {r.short && <span className="text-[11px] text-neutral-400 hidden sm:inline">{r.short}</span>}
                      </span>
                    </td>
                    <td className="text-center py-2.5 px-2 tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">{r.win}</td>
                    <td className="text-center py-2.5 px-2 tabular-nums text-rose-500">{r.lose}</td>
                    <td className="text-right py-2.5 pr-4 pl-2 tabular-nums font-black">{wr}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 팀별 로스터 */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold tracking-tight">팀 로스터</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {data.standings.map((r) => (
            <div
              key={r.teamId}
              className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                {r.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.logo} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                )}
                <span className="font-bold text-sm">{r.name}</span>
                <span className="text-xs text-neutral-400 tabular-nums ml-auto">{r.win}승 {r.lose}패</span>
              </div>
              {r.roster.length === 0 ? (
                <p className="text-xs text-neutral-400">로스터 정보 없음</p>
              ) : (
                <ul className="space-y-1.5">
                  {r.roster.map((p) => (
                    <li key={p.playerId} className="flex items-center gap-2.5">
                      {p.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photo} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 bg-neutral-100 dark:bg-neutral-800" loading="lazy" />
                      ) : (
                        <span className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 flex items-center justify-center text-[11px] font-bold text-neutral-500">
                          {p.name.slice(0, 1)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold text-sm">{p.name}</span>
                        {p.realName && <span className="text-xs text-neutral-400 ml-1.5 truncate">{p.realName}</span>}
                      </span>
                      {p.position != null && POS_LABEL[p.position] && (
                        <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 rounded px-1.5 py-0.5 shrink-0">
                          {POS_LABEL[p.position]}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <p className="text-[11px] text-neutral-400 text-center pt-1">
        ⓘ 정규 스플릿 순위 · 로스터는 TheSports 선수 DB 기준 · 경기 종료 후 갱신
      </p>
    </div>
  );
}
