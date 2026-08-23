// 선수 수상 경력 (영어판). scripts/en-mirror 로 자동 생성.
import { Trophy } from "lucide-react";

// 대회명 한글 (자주 나오는 것만 — 미등록은 영문 그대로)
const TROPHY_KO: Record<string, string> = {
  "Premier League": "Premier League",
  "La Liga": "LaLiga",
  Bundesliga: "Bundesliga",
  "Serie A": "Serie A",
  "Ligue 1": "Ligue 1",
  "UEFA Champions League": "Champions League",
  "UEFA Europa League": "Europa League",
  "UEFA Europa Conference League": "Conference League",
  "UEFA Super Cup": "UEFA Super Cup",
  "UEFA Nations League": "Nations League",
  "World Cup": "World Cup",
  "FIFA Club World Cup": "Club World Cup",
  "Club World Cup": "Club World Cup",
  "Copa America": "Copa América",
  "Africa Cup of Nations": "Africa Cup of Nations",
  "Asian Cup": "Asian Cup",
  "Euro Championship": "European Championship",
  "FA Cup": "FA Cup",
  "League Cup": "EFL Cup",
  "Community Shield": "Community Shield",
  "Copa del Rey": "Copa del Rey",
  "Super Cup": "Super Cup",
  "DFB Pokal": "DFB-Pokal",
  "Coppa Italia": "Coppa Italia",
  "Coupe de France": "Coupe de France",
  "Trophée des Champions": "Trophée des Champions",
  "Supercopa de Espana": "Supercopa",
  "Supercoppa Italiana": "Supercoppa Italiana",
  "Olympics Men": "Olympics",
};

// "2023/2024" → "23-24", "2023" 은 그대로
const shortSeason = (s: string) => s.replace(/^20(\d\d)\/20(\d\d)$/, "$1-$2");

// 국가 한글 (동명 대회 구분 접미용 — "수퍼컵 (독일)" vs "(스페인)")
const COUNTRY_KO: Record<string, string> = {
  Germany: "Germany", Spain: "Spain", England: "England", Italy: "Italy", France: "France",
  Portugal: "Portugal", Netherlands: "Netherlands", Turkey: "Türkiye", "Saudi-Arabia": "Saudi Arabia", "Saudi Arabia": "Saudi Arabia",
};

export interface TrophyRow { league: string; country: string | null; season: string; place: string }

export default function PlayerTrophies({ rows }: { rows: TrophyRow[] }) {
  if (!rows.length) return null;
  interface Grp { name: string; country: string | null; win: string[]; second: string[] }
  // "Super Cup" 처럼 나라만 다른 동명 대회가 합쳐지지 않게 (대회명, 국가) 로 그룹
  const byComp = new Map<string, Grp>();
  for (const r of rows) {
    const name = TROPHY_KO[r.league] ?? r.league;
    const key = `${name}|${r.country ?? ""}`;
    let g = byComp.get(key);
    if (!g) { g = { name, country: r.country, win: [], second: [] }; byComp.set(key, g); }
    (r.place === "Winner" ? g.win : g.second).push(shortSeason(r.season));
  }
  // 같은 표시명이 여러 국가에 있으면 "(국가)" 접미로 구분
  const nameCount = new Map<string, number>();
  for (const g of byComp.values()) nameCount.set(g.name, (nameCount.get(g.name) ?? 0) + 1);
  for (const g of byComp.values()) {
    if ((nameCount.get(g.name) ?? 0) > 1 && g.country) g.name = `${g.name} (${COUNTRY_KO[g.country] ?? g.country})`;
  }
  const groups = [...byComp.values()].sort(
    (a, b) => b.win.length - a.win.length || b.second.length - a.second.length,
  );
  const totalWins = rows.filter((r) => r.place === "Winner").length;

  return (
    <section className="rounded-xl bg-white ring-1 ring-black/5 overflow-hidden dark:bg-white/[0.04] dark:ring-white/10">
      <div className="px-4 pt-3 pb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-bold flex items-center gap-1.5">
          <Trophy className="h-4 w-4 text-amber-500" aria-hidden /> Honours
        </h2>
        <span className="text-[11px] text-neutral-500">won {totalWins}</span>
      </div>
      <ul className="divide-y divide-black/5 dark:divide-white/5">
        {groups.map((g) => (
          <li key={g.name} className="px-4 py-2.5 flex items-start gap-3">
            <span className="font-medium min-w-0 flex-1">{g.name}</span>
            <span className="text-right text-sm space-y-0.5 shrink-0 max-w-[55%]">
              {g.win.length > 0 && (
                <span className="block">
                  <span className="font-bold text-amber-600 dark:text-amber-400">won {g.win.length}</span>
                  <span className="ml-1.5 text-xs text-neutral-400 tabular-nums break-keep">{g.win.sort().reverse().join(" · ")}</span>
                </span>
              )}
              {g.second.length > 0 && (
                <span className="block">
                  <span className="font-semibold text-neutral-500">runner-up {g.second.length}</span>
                  <span className="ml-1.5 text-xs text-neutral-400 tabular-nums break-keep">{g.second.sort().reverse().join(" · ")}</span>
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
