// LCK 리그순위 — data/lol-standings.json (build-lol-standings.ts) 정적 렌더. ts table/list IP whitelist 라 JSON 백필 경유.
import rawStandings from "../../data/lol-standings.json";

interface Row {
  rank: number;
  teamId: string;
  name: string;
  short: string;
  logo: string;
  win: number;
  lose: number;
}
interface Data {
  league: string;
  name: string;
  updatedAt: string;
  standings: Row[];
}

export default function LolStandings({ name }: { name: string }) {
  const data = rawStandings as Data;
  const rows = data.standings;

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-1">{name} 순위</h1>
      <p className="text-sm text-neutral-500 mb-5">2026 정규시즌 · TheSports</p>
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900/60 text-xs text-neutral-500">
            <tr>
              <th className="py-2.5 px-3 text-left w-10">#</th>
              <th className="py-2.5 px-2 text-left">팀</th>
              <th className="py-2.5 px-3 text-center w-12">승</th>
              <th className="py-2.5 px-3 text-center w-12">패</th>
              <th className="py-2.5 px-3 text-center w-16">승률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const played = r.win + r.lose;
              const wr = played ? Math.round((r.win / played) * 100) : 0;
              return (
                <tr
                  key={r.teamId}
                  className="border-t border-neutral-100 dark:border-neutral-800"
                >
                  <td className="py-2.5 px-3 font-bold tabular-nums">{r.rank}</td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2">
                      {r.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.logo}
                          alt=""
                          className="w-6 h-6 object-contain shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-6 h-6 shrink-0" />
                      )}
                      <span className="font-semibold truncate">{r.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center tabular-nums">{r.win}</td>
                  <td className="py-2.5 px-3 text-center tabular-nums text-neutral-500">
                    {r.lose}
                  </td>
                  <td className="py-2.5 px-3 text-center tabular-nums">{wr}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-400 mt-3">
        업데이트 {data.updatedAt.slice(0, 10)}
      </p>
    </div>
  );
}
