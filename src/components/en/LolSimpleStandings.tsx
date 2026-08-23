// LolSimpleStandings (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import LolForeignTabs, {
  type ForeignTeamRow,
  type ForeignPlayerRow,
  type ForeignChampRow,
} from "@/components/en/LolForeignTabs";
import { aggregateLolPlayers, aggregateLolChampions } from "@/lib/sports/lol-player-stats";
import lecData from "../../../data/lol-standings-LEC.json";
import lcsData from "../../../data/lol-standings-LCS.json";
import lolHeroes from "../../../data/lol-heroes.json";

interface Data {
  league: string;
  name: string;
  updatedAt: string;
  standings: ForeignTeamRow[];
}

const DATA: Record<string, Data> = {
  LEC: lecData as Data,
  LCS: lcsData as Data,
};

const REGION_SUB: Record<string, string> = {
  LEC: "Europe · League of Legends EMEA Championship",
  LCS: "North America · League of Legends Championship Series",
};

export default async function LolSimpleStandings({ league, name }: { league: string; name: string }) {
  const data = DATA[league];
  if (!data) return null;

  const [playersAll, champsAll] = await Promise.all([
    aggregateLolPlayers(league),
    aggregateLolChampions(league),
  ]);

  // 선수 사진·팀 약자 — 순위 json roster 에서 매핑 (LEC/LCS 는 lol-players.json 없음).
  const photoByPid: Record<string, string> = {};
  const shortByTeam: Record<string, string> = {};
  const logoByTeam: Record<string, string> = {};
  for (const t of data.standings) {
    shortByTeam[t.teamId] = t.short;
    logoByTeam[t.teamId] = t.logo;
    for (const p of t.roster) photoByPid[p.playerId] = p.photo;
  }

  const players: ForeignPlayerRow[] = playersAll
    .filter((p) => p.games >= 5)
    .sort((a, b) => b.kda - a.kda)
    .slice(0, 20)
    .map((p) => ({
      playerId: p.playerId,
      name: p.name,
      teamShort: shortByTeam[p.teamId] ?? "",
      teamLogo: logoByTeam[p.teamId] ?? "",
      photo: photoByPid[p.playerId] ?? "",
      kda: p.kda,
      winRate: p.winRate,
      csPerMin: p.csPerMin,
      games: p.games,
    }));

  const heroLogos = (lolHeroes as { heroes: Record<string, string> }).heroes;
  const champs: ForeignChampRow[] = champsAll.slice(0, 20).map((c) => ({
    champ: c.champ,
    logo: heroLogos[c.champ] ?? "",
    picks: c.picks,
    winRate: c.winRate,
  }));

  return (
    <div className="relative max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-5">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores?sport=esports" className="hover:underline">
          Esports live
        </Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">{name} Standings & players</span>
      </nav>

      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> League standings
        </span>
        <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name} Standings & players</h1>
        <p className="text-sm text-neutral-500 mt-2 break-keep">
          {REGION_SUB[league] ?? "League of Legends"} · 2026 season · TheSports
        </p>
      </header>

      {/* 리그 스위처 — LCK ↔ LEC ↔ LCS ↔ LPL */}
      <div className="flex gap-1.5 flex-wrap">
        {[
          ["LOL", "LCK"],
          ["LEC", "LEC"],
          ["LCS", "LCS"],
          ["LPL", "LPL"],
          ["EWC", "EWC"],
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

      <LolForeignTabs league={league} standings={data.standings} players={players} champs={champs} />

      <p className="text-[11px] text-neutral-400 text-center pt-1">
        ⓘ Regular split standings · player and champion stats from collected games · updated after each match
      </p>
    </div>
  );
}
