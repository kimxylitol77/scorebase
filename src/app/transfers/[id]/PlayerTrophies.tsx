// 수상 경력 섹션 — PlayerTrophy(af /trophies 수집분)의 우승·준우승을 대회별로 묶어 표시.
import { Trophy } from "lucide-react";

// 대회명 한글 (자주 나오는 것만 — 미등록은 영문 그대로)
const TROPHY_KO: Record<string, string> = {
  "Premier League": "프리미어리그",
  "La Liga": "라리가",
  Bundesliga: "분데스리가",
  "Serie A": "세리에 A",
  "Ligue 1": "리그 1",
  "UEFA Champions League": "챔피언스리그",
  "UEFA Europa League": "유로파리그",
  "UEFA Europa Conference League": "컨퍼런스리그",
  "UEFA Super Cup": "UEFA 슈퍼컵",
  "UEFA Nations League": "네이션스리그",
  "World Cup": "월드컵",
  "FIFA Club World Cup": "클럽 월드컵",
  "Club World Cup": "클럽 월드컵",
  "Copa America": "코파 아메리카",
  "Africa Cup of Nations": "아프리카 네이션스컵",
  "Asian Cup": "아시안컵",
  "Euro Championship": "유로",
  "FA Cup": "FA컵",
  "League Cup": "EFL컵",
  "Community Shield": "커뮤니티 실드",
  "Copa del Rey": "코파 델 레이",
  "Super Cup": "수퍼컵",
  "DFB Pokal": "DFB 포칼",
  "Coppa Italia": "코파 이탈리아",
  "Coupe de France": "쿠프 드 프랑스",
  "Trophée des Champions": "트로페 데 샹피옹",
  "Supercopa de Espana": "수페르코파",
  "Supercoppa Italiana": "수페르코파 이탈리아나",
  "Olympics Men": "올림픽",
};

// "2023/2024" → "23-24", "2023" 은 그대로
const shortSeason = (s: string) => s.replace(/^20(\d\d)\/20(\d\d)$/, "$1-$2");

// 국가 한글 (동명 대회 구분 접미용 — "수퍼컵 (독일)" vs "(스페인)")
const COUNTRY_KO: Record<string, string> = {
  Germany: "독일", Spain: "스페인", England: "잉글랜드", Italy: "이탈리아", France: "프랑스",
  Portugal: "포르투갈", Netherlands: "네덜란드", Turkey: "튀르키예", "Saudi-Arabia": "사우디", "Saudi Arabia": "사우디",
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
          <Trophy className="h-4 w-4 text-amber-500" aria-hidden /> 수상 경력
        </h2>
        <span className="text-[11px] text-neutral-500">우승 {totalWins}회</span>
      </div>
      <ul className="divide-y divide-black/5 dark:divide-white/5">
        {groups.map((g) => (
          <li key={g.name} className="px-4 py-2.5 flex items-start gap-3">
            <span className="font-medium min-w-0 flex-1">{g.name}</span>
            <span className="text-right text-sm space-y-0.5 shrink-0 max-w-[55%]">
              {g.win.length > 0 && (
                <span className="block">
                  <span className="font-bold text-amber-600 dark:text-amber-400">우승 {g.win.length}회</span>
                  <span className="ml-1.5 text-xs text-neutral-400 tabular-nums break-keep">{g.win.sort().reverse().join(" · ")}</span>
                </span>
              )}
              {g.second.length > 0 && (
                <span className="block">
                  <span className="font-semibold text-neutral-500">준우승 {g.second.length}회</span>
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
