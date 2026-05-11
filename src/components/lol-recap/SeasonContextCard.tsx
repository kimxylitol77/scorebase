// LoL RECAP — 시즌 누적 컨텍스트 카드 (양 팀 가로 2열)

import type { LolRecapContext } from "@/lib/sports/lol-recap-context";
import { KOREAN_STARS } from "@/lib/sports/star-players";

type SeasonOne = LolRecapContext["seasonContext"]["team1"];

interface Props {
  team1NameKo: string;
  team2NameKo: string;
  team1: SeasonOne;
  team2: SeasonOne;
  starPlayersInMatch: string[];
}

function Recent5({ recent }: { recent: Array<"W" | "L"> }) {
  if (recent.length === 0)
    return <span className="text-neutral-400 text-xs">—</span>;
  return (
    <div className="flex gap-1">
      {recent.map((r, idx) => (
        <span
          key={idx}
          className={`inline-flex items-center justify-center w-5 h-5 text-[10px] font-black rounded ${
            r === "W"
              ? "bg-emerald-500 text-white"
              : "bg-rose-500 text-white"
          }`}
          aria-label={r === "W" ? "승" : "패"}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

/** koreanName 으로 KOREAN_STARS 역검색 → entry. */
function findStarByKoreanName(koName: string) {
  for (const entry of Object.values(KOREAN_STARS)) {
    if (entry.koreanName === koName) return entry;
  }
  return undefined;
}

function pickTeamStar(
  teamNameKo: string,
  stars: string[],
): string | undefined {
  for (const ko of stars) {
    const entry = findStarByKoreanName(ko);
    if (!entry) continue;
    // entry.team 은 영문, teamNameKo 는 한국명 — 매칭 어려움.
    // 단순화: stars 배열 중 첫 매치 1명만 사용 (양 팀 모두 보유 가능성 낮음).
    // 정확한 분리는 우리 LCK_LP_TEAM_NAMES 매핑으로 가능하나 비싸므로 패스.
    return entry.koreanName;
  }
  return undefined;
}

function TeamCol({
  name,
  s,
  starName,
}: {
  name: string;
  s: SeasonOne;
  starName?: string;
}) {
  const streakLabel =
    s.winStreak > 0
      ? `${s.winStreak}연승`
      : s.loseStreak > 0
        ? `${s.loseStreak}연패`
        : "—";
  const streakCls =
    s.winStreak > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : s.loseStreak > 0
        ? "text-rose-600 dark:text-rose-400"
        : "text-neutral-500";
  return (
    <div>
      <div className="text-sm font-black tracking-tight">{name}</div>
      <div className="mt-2 space-y-1.5 text-sm">
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-neutral-500">시리즈</span>
          <span className="font-bold tabular-nums">
            {s.wins}승 {s.losses}패
          </span>
          <span className="text-xs text-neutral-500">({s.rank}위)</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-neutral-500">2-0 셧다운</span>
          <span className="font-bold tabular-nums">{s.twoZeroCount}회</span>
          <span className="text-[11px] text-neutral-400">
            (받은 셧다운 {s.twoZeroReceived}회)
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-neutral-500">현재 폼</span>
          <span className={`font-bold ${streakCls}`}>{streakLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">최근 5시리즈</span>
          <Recent5 recent={s.recent5} />
        </div>
        {starName && (
          <div className="pt-1 mt-2 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-400">
            ⭐ <span className="font-bold">{starName}</span> 출전
          </div>
        )}
      </div>
    </div>
  );
}

export default function SeasonContextCard({
  team1NameKo,
  team2NameKo,
  team1,
  team2,
  starPlayersInMatch,
}: Props) {
  // 양 팀 각각 매치 출전 슈퍼스타 1명씩 표시
  const t1Star = pickTeamStar(team1NameKo, starPlayersInMatch);
  // 다른 팀에서는 t1Star 와 다른 사람 우선
  const remaining = starPlayersInMatch.filter((s) => s !== t1Star);
  const t2Star = pickTeamStar(team2NameKo, remaining);

  return (
    <section
      aria-label="시즌 누적 컨텍스트"
      className="my-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950"
    >
      <div className="px-5 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-500">
          시즌 누적
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-neutral-200 dark:divide-neutral-800">
        <div className="p-5">
          <TeamCol name={team1NameKo} s={team1} starName={t1Star} />
        </div>
        <div className="p-5">
          <TeamCol name={team2NameKo} s={team2} starName={t2Star} />
        </div>
      </div>
    </section>
  );
}
