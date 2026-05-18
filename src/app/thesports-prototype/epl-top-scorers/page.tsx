// TheSports trial 검증 prototype — EPL 득점왕 Top 50.
// dev server 에서만 작동 (우리 macOS IP 가 whitelist 되어 있어 호출 OK).
// Production 은 fixed IP worker 셋업 전엔 비활성.
//
// 검증 데이터: Erling Haaland 26골 (2025-26 시즌, 5/17 fetch 기준)

import { fetchFootballSeasonShooter } from "@/lib/sports/thesports/football-collector";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EPL_SEASON_ID = "l965mkyhjpxr1ge"; // 2025-26 시즌

export default async function EPLTopScorersPage() {
  let data;
  let error: string | null = null;
  try {
    data = await fetchFootballSeasonShooter(EPL_SEASON_ID);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-black tracking-tight">EPL 득점왕 (TheSports prototype)</h1>
        <p className="text-sm text-neutral-500 mt-1">
          데이터 소스: TheSports.com /v1/football/season/recent/shooter/stat
        </p>
        <p className="text-xs text-neutral-400 mt-1">
          ⚠️ Trial 검증용. Production 사용 시 fixed IP worker 필수.
        </p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700 text-sm">
          ❌ Error: {error}
          <p className="mt-2 text-xs">
            가능 원인: IP whitelist 미등록, API key 잘못, endpoint 권한 없음, season_id 만료
          </p>
        </div>
      )}

      {data && (
        <>
          <div className="mb-4 flex items-center justify-between text-sm">
            <span className="text-neutral-600">
              총 <strong>{data.results.length}</strong>명 득점자
            </span>
            <span className="text-xs text-neutral-400">
              season_id: <code className="bg-neutral-100 px-1.5 py-0.5 rounded">{EPL_SEASON_ID}</code>
            </span>
          </div>

          <table className="w-full text-sm border-collapse">
            <thead className="bg-neutral-50">
              <tr className="text-left text-xs uppercase text-neutral-500">
                <th className="py-2 px-3 w-12">#</th>
                <th className="py-2 px-3">선수</th>
                <th className="py-2 px-3">팀</th>
                <th className="py-2 px-3 text-right">골</th>
                <th className="py-2 px-3 text-right">PK</th>
                <th className="py-2 px-3 text-right">어시</th>
                <th className="py-2 px-3 text-right">출전시간</th>
              </tr>
            </thead>
            <tbody>
              {data.results.slice(0, 50).map((p) => {
                const minsPerGoal = p.goals > 0 ? Math.round(p.minutes_played / p.goals) : 0;
                return (
                  <tr key={p.player.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 px-3 font-bold text-neutral-400">{p.position}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        {p.player.logo && (
                          <img
                            src={p.player.logo}
                            alt={p.player.name}
                            className="w-7 h-7 rounded-full object-cover bg-neutral-100"
                          />
                        )}
                        <div>
                          <div className="font-semibold">{p.player.name}</div>
                          <div className="text-xs text-neutral-500">
                            {p.player.position} · {p.player.nationality || "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        {p.team.logo && (
                          <img src={p.team.logo} alt={p.team.name} className="w-5 h-5 object-contain" />
                        )}
                        <span className="text-xs">{p.team.name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-base">{p.goals}</td>
                    <td className="py-2 px-3 text-right text-neutral-600">{p.penalty}</td>
                    <td className="py-2 px-3 text-right text-neutral-600">{p.assists}</td>
                    <td className="py-2 px-3 text-right text-xs text-neutral-500">
                      {p.minutes_played}분
                      {minsPerGoal > 0 && (
                        <div className="text-[10px] text-neutral-400">({minsPerGoal}분/골)</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <footer className="mt-8 pt-4 border-t border-neutral-200 text-xs text-neutral-400">
        <p>
          TheSports.com 14일 trial 검증용. 정식 도입 결정 후 worker 인프라 + production 통합 예정.
        </p>
        <p className="mt-1">
          남은 검증: 매치 라인업 SVG 도식 (formation + x/y) · H2H 골 분포 시각화 · KBO 라이브 latency (화요일)
        </p>
      </footer>
    </div>
  );
}
