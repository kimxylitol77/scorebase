// 리그 역대 우승 — 리그 페이지 "역사" 탭. data/league-champions.json (위키데이터 P3450→P1346 수집).
import championsData from "../../../data/league-champions.json";
import { fifaFlag, isNationalTeamLeague } from "@/lib/sports/fifa-rankings";

type Champ = { season: string; ko: string; en: string };
const DATA = championsData as Record<string, { champions: Champ[] }>;

export default function LeagueHistory({ league, leagueName }: { league: string; leagueName: string }) {
  const champions = DATA[league]?.champions ?? [];
  const showFlag = isNationalTeamLeague(league); // 국가대항(월드컵 등)만 국기 표시

  if (champions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center space-y-2">
        <div className="text-3xl">🏆</div>
        <h3 className="text-base font-bold">역대 우승 기록 준비 중</h3>
        <p className="text-sm text-neutral-500 max-w-md mx-auto">{leagueName} 역대 우승 기록을 수집 중입니다. 곧 추가됩니다.</p>
      </div>
    );
  }

  // 최다 우승 집계
  const counts = new Map<string, number>();
  for (const c of champions) counts.set(c.ko, (counts.get(c.ko) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <div className="space-y-6">
      <section className="space-y-2.5">
        <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">최다 우승</h2>
        <div className="flex flex-wrap gap-2">
          {top.map(([club, n], i) => (
            <div
              key={club}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                i === 0
                  ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              {i === 0 && <span className="text-sm">🏆</span>}
              {showFlag && fifaFlag(club) && <span className="text-sm">{fifaFlag(club)}</span>}
              <span className="font-bold text-sm">{club}</span>
              <span className={`text-sm tabular-nums font-black ${i === 0 ? "text-amber-600 dark:text-amber-400" : "text-neutral-500"}`}>
                {n}회
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">
          시즌별 우승 <span className="text-neutral-400 font-normal">({champions.length})</span>
        </h2>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden grid sm:grid-cols-2">
          {champions.map((c, i) => (
            <div
              key={c.season + i}
              className="flex items-center gap-3 px-3.5 py-2 text-sm border-b border-neutral-100 dark:border-neutral-800/60 sm:[&:nth-last-child(2)]:border-b-0 [&:last-child]:border-b-0 odd:sm:border-r odd:sm:border-r-neutral-100 dark:odd:sm:border-r-neutral-800/60"
            >
              <span className="w-16 shrink-0 text-xs tabular-nums text-neutral-400">{c.season}</span>
              {showFlag && fifaFlag(c.en, c.ko) && (
                <span className="shrink-0">{fifaFlag(c.en, c.ko)}</span>
              )}
              <span className="font-medium truncate">{c.ko}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="text-[11px] text-neutral-400">출처: 위키데이터 · 일부 리그·최근 시즌은 데이터 공백이 있을 수 있습니다.</p>
    </div>
  );
}
