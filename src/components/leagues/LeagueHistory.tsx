// 리그 역대 우승 — 리그 페이지 "역사" 탭. data/league-champions.json (위키데이터 P3450→P1346 수집).
import championsData from "../../../data/league-champions.json";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { fifaFlag, isNationalTeamLeague } from "@/lib/sports/fifa-rankings";
import TeamBadge from "@/components/TeamBadge";

type Champ = { season: string; ko: string; en: string };
const DATA = championsData as Record<string, { champions: Champ[] }>;

// 우승팀(위키데이터 풀네임) → DB 팀 매칭용 정규화. 영문=분음부호·축약(F.C. 등)·구두점 제거, 한글=공백 제거.
const FOOTBALL_TOKENS = new Set(["fc", "afc", "cf", "sc", "ac", "cd", "ud", "as", "rcd", "sd", "ssc", "ss", "uc", "acf", "cfc", "fbc", "vfl", "vfb", "sv", "club"]);
// 독·불 이름 번역차 보정(위키데이터 München ↔ DB Munich 등). 양쪽 normEn 을 같은 형태로 수렴.
const NAME_ALIAS: [RegExp, string][] = [[/munchen/g, "munich"], [/koln/g, "cologne"], [/nurnberg/g, "nuremberg"], [/monchengladbach/g, "gladbach"]];
const normEn = (s: string) => {
  let r = s.toLowerCase().normalize("NFD").replace(/\./g, "").split(/[^a-z0-9]+/).filter((w) => w && !FOOTBALL_TOKENS.has(w) && !/^\d+$/.test(w)).join("");
  for (const [re, to] of NAME_ALIAS) r = r.replace(re, to);
  return r;
};
const normKo = (s: string) => s.replace(/[a-zA-Z0-9.()]+/g, " ").replace(/\s+/g, "").trim(); // 한글만(위키데이터 ko 의 라틴 접두 "FC·SSC" strip)

export default async function LeagueHistory({ league, leagueName }: { league: string; leagueName: string }) {
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

  // 클럽 리그면 우승팀 → logoUrl 매처. 한글명 정확일치(EPL·라리가) → 영문 정확/부분일치(세리에·분데스, 풀네임 vs 짧은 DB명) 순.
  // 매칭 안 되는 우승팀(강등·해체)은 DB 로고 자체가 없어 자연히 로고 없이 표시(graceful).
  let logoOf: (ko: string, en: string) => string | null = () => null;
  if (!showFlag) {
    // 컵 대회(UCL/UEL 등) 우승팀은 여러 도메스틱 리그 소속(토트넘=EPL·아탈란타=세리에)이라 팀 풀을 빅리그까지 확장.
    const CUP = new Set(["UCL", "UEL", "UECL"]);
    const where = CUP.has(league)
      ? { league: { in: [league, "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "MLS"] } }
      : { league };
    const teams = await prisma.team.findMany({ where, select: { name: true, logoUrl: true, league: true } });
    const koMap = new Map<string, string>();
    const enList: { norm: string; logo: string }[] = [];
    for (const t of teams) {
      if (!t.logoUrl) continue;
      const ko = normKo(toKoreanTeamName(t.name, t.league));
      if (ko && !koMap.has(ko)) koMap.set(ko, t.logoUrl);
      enList.push({ norm: normEn(t.name), logo: t.logoUrl });
    }
    logoOf = (ko, en) => {
      const k = koMap.get(normKo(ko));
      if (k) return k;
      const q = normEn(en);
      if (!q) return null;
      const exact = enList.find((t) => t.norm === q);
      if (exact) return exact.logo;
      let best: { norm: string; logo: string } | null = null;
      for (const t of enList) {
        if (t.norm.length >= 4 && (q.includes(t.norm) || t.norm.includes(q)) && (!best || t.norm.length > best.norm.length)) best = t;
      }
      return best?.logo ?? null;
    };
  }

  // 최다 우승 집계 (+ ko→en, 로고 조회용)
  const counts = new Map<string, number>();
  const enByKo = new Map<string, string>();
  for (const c of champions) {
    counts.set(c.ko, (counts.get(c.ko) ?? 0) + 1);
    if (!enByKo.has(c.ko)) enByKo.set(c.ko, c.en);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <div className="space-y-6">
      <section className="space-y-2.5">
        <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">최다 우승</h2>
        <div className="flex flex-wrap gap-2">
          {top.map(([club, n], i) => {
            const flag = showFlag ? fifaFlag(club) : "";
            const logo = logoOf(club, enByKo.get(club) ?? club);
            return (
            <div
              key={club}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                i === 0
                  ? "bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-500/10 dark:ring-amber-500/40"
                  : "bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10"
              }`}
            >
              {i === 0 && <span className="text-sm">🏆</span>}
              {flag && <span className="text-sm" aria-hidden>{flag}</span>}
              <TeamBadge logoUrl={logo} size={18} className="bg-white rounded-sm" />
              <span className="font-bold text-sm">{club}</span>
              <span className={`text-sm tabular-nums font-black ${i === 0 ? "text-amber-600 dark:text-amber-400" : "text-neutral-500"}`}>
                {n}회
              </span>
            </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">
          시즌별 우승 <span className="text-neutral-400 font-normal">({champions.length})</span>
        </h2>
        <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] overflow-hidden grid sm:grid-cols-2 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          {champions.map((c, i) => {
            const flag = showFlag ? fifaFlag(c.en, c.ko) : "";
            const logo = logoOf(c.ko, c.en);
            return (
            <div
              key={c.season + i}
              className="flex items-center gap-3 px-3.5 py-2 text-sm border-b border-neutral-100 dark:border-neutral-800/60 sm:[&:nth-last-child(2)]:border-b-0 [&:last-child]:border-b-0 odd:sm:border-r odd:sm:border-r-neutral-100 dark:odd:sm:border-r-neutral-800/60"
            >
              <span className="w-16 shrink-0 text-xs tabular-nums text-neutral-400">{c.season}</span>
              {flag && <span className="shrink-0" aria-hidden>{flag}</span>}
              <TeamBadge logoUrl={logo} size={18} className="bg-white rounded-sm" />
              <span className="font-medium truncate">{c.ko}</span>
            </div>
            );
          })}
        </div>
      </section>

      <p className="text-[11px] text-neutral-400">출처: 위키데이터 · 일부 리그·최근 시즌은 데이터 공백이 있을 수 있습니다.</p>
    </div>
  );
}
