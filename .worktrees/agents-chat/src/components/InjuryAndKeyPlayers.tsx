// 글 상세 페이지에 표시되는 부상자 + 핵심 선수 카드.
// api-football Pro 데이터를 한글 UI 로 보여줌.

import {
  fetchSeasonInjuries,
  fetchSeasonTopScorers,
  getApiFootballSeason,
  getTeamInjuries,
  getTeamKeyPlayers,
  API_FOOTBALL_LEAGUE_ID,
} from "@/lib/sports/api-football-pro";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import { resolvePlayerNames } from "@/lib/players/resolvePlayerName";
import { getSportFromLeague } from "@/lib/players/types";

interface Props {
  league: string;
  homeTeamName: string;
  awayTeamName: string;
  matchStartTime: Date;
}

// api-football reason(영문) → 한글 매핑
const REASON_KO: Record<string, string> = {
  "Hamstring": "햄스트링",
  "Knee": "무릎",
  "Ankle": "발목",
  "Foot": "발",
  "Calf": "종아리",
  "Thigh": "허벅지",
  "Groin": "사타구니",
  "Back": "허리",
  "Shoulder": "어깨",
  "Wrist": "손목",
  "Hand": "손",
  "Hip": "고관절",
  "Concussion": "뇌진탕",
  "Achilles": "아킬레스",
  "Illness": "질병",
  "Suspended": "출장 정지",
  "Fitness": "컨디션",
  "Muscle": "근육",
  "Broken Bone": "골절",
  "Cardiac problems": "심장 문제",
  "Toe": "발가락",
};

function translateReason(en: string): string {
  if (!en) return "사유 미공개";
  // 부분 일치 (예: "Hamstring Injury")
  for (const [k, v] of Object.entries(REASON_KO)) {
    if (en.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return en; // 못 찾으면 원문
}

export default async function InjuryAndKeyPlayers({
  league,
  homeTeamName,
  awayTeamName,
  matchStartTime,
}: Props) {
  if (!process.env.API_FOOTBALL_KEY) return null;
  if (!API_FOOTBALL_LEAGUE_ID[league]) return null;

  const season = getApiFootballSeason(matchStartTime, league);

  let allInjuries: Awaited<ReturnType<typeof fetchSeasonInjuries>> = [];
  let allScorers: Awaited<ReturnType<typeof fetchSeasonTopScorers>> = [];
  try {
    [allInjuries, allScorers] = await Promise.all([
      fetchSeasonInjuries(league, season),
      fetchSeasonTopScorers(league, season),
    ]);
  } catch {
    return null;
  }

  const beforeIso = matchStartTime.toISOString();
  const homeInj = getTeamInjuries(allInjuries, homeTeamName, beforeIso, 6);
  const awayInj = getTeamInjuries(allInjuries, awayTeamName, beforeIso, 6);
  const homeKey = getTeamKeyPlayers(allScorers, homeTeamName, 3);
  const awayKey = getTeamKeyPlayers(allScorers, awayTeamName, 3);

  // Supabase + 코드 fallback 한 번에 batch 조회
  const sport = (() => {
    try { return getSportFromLeague(league); } catch { return "soccer" as const; }
  })();
  const resolved = await resolvePlayerNames(
    [
      ...homeInj.map((i) => ({ apiFootballId: i.playerId, nameEn: i.playerName })),
      ...awayInj.map((i) => ({ apiFootballId: i.playerId, nameEn: i.playerName })),
      ...homeKey.map((p) => ({ apiFootballId: p.playerId, nameEn: p.playerName })),
      ...awayKey.map((p) => ({ apiFootballId: p.playerId, nameEn: p.playerName })),
    ],
    sport,
    league,
  );
  const ko = (id: number, en: string) =>
    resolved.get(id)?.ko ?? toKoreanPlayerName(en);

  // 데이터 전혀 없으면 섹션 자체 숨김
  const hasAny =
    homeInj.length > 0 ||
    awayInj.length > 0 ||
    homeKey.length > 0 ||
    awayKey.length > 0;
  if (!hasAny) return null;

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 p-6 my-10 space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-base">🏥</span>
        <h3 className="font-bold tracking-tight">선수 정보</h3>
        <span className="ml-auto text-xs text-neutral-500">
          api-football Pro 기준
        </span>
      </div>

      {/* 핵심 선수 (시즌 득점왕) */}
      {(homeKey.length > 0 || awayKey.length > 0) && (
        <div>
          <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
            ⭐ 시즌 핵심 선수
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <KeyPlayerCard
              teamName={toKoreanTeamName(homeTeamName)}
              players={homeKey.map((p) => ({
                name: ko(p.playerId, p.playerName),
                goals: p.goals,
                assists: p.assists,
                appearances: p.appearances,
              }))}
              variant="home"
            />
            <KeyPlayerCard
              teamName={toKoreanTeamName(awayTeamName)}
              players={awayKey.map((p) => ({
                name: ko(p.playerId, p.playerName),
                goals: p.goals,
                assists: p.assists,
                appearances: p.appearances,
              }))}
              variant="away"
            />
          </div>
        </div>
      )}

      {/* 부상자 */}
      {(homeInj.length > 0 || awayInj.length > 0) && (
        <div>
          <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
            🩹 부상·결장 명단
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <InjuryCard
              teamName={homeTeamName}
              players={homeInj.map((i) => ({
                name: ko(i.playerId, i.playerName),
                reasonKo: translateReason(i.reason),
                reasonRaw: i.reason,
                fixtureDate: i.fixtureDate,
              }))}
              variant="home"
            />
            <InjuryCard
              teamName={awayTeamName}
              players={awayInj.map((i) => ({
                name: ko(i.playerId, i.playerName),
                reasonKo: translateReason(i.reason),
                reasonRaw: i.reason,
                fixtureDate: i.fixtureDate,
              }))}
              variant="away"
            />
          </div>
        </div>
      )}

      <p className="text-[11px] text-neutral-500 leading-relaxed pt-2 border-t border-neutral-200 dark:border-neutral-800">
        ⓘ 부상·결장 정보는 시즌 누적 기록이며, 실제 결장 여부는 경기 시점 팀
        공식 발표를 따릅니다.
      </p>
    </section>
  );
}

const VARIANT_BG = {
  home: "border-blue-200 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-900/10",
  away: "border-rose-200 dark:border-rose-900/30 bg-rose-50/40 dark:bg-rose-900/10",
};

const VARIANT_COLOR = {
  home: "text-blue-600 dark:text-blue-400",
  away: "text-rose-600 dark:text-rose-400",
};

function KeyPlayerCard({
  teamName,
  players,
  variant,
}: {
  teamName: string;
  players: Array<{
    name: string;
    goals: number;
    assists: number;
    appearances: number;
  }>;
  variant: "home" | "away";
}) {
  return (
    <div className={`rounded-lg border ${VARIANT_BG[variant]} p-3.5`}>
      <div
        className={`text-xs font-semibold mb-2 truncate ${VARIANT_COLOR[variant]}`}
      >
        {teamName}
      </div>
      {players.length === 0 ? (
        <div className="text-xs text-neutral-500">데이터 없음</div>
      ) : (
        <ul className="space-y-1.5">
          {players.map((p) => (
            <li
              key={p.name}
              className="flex items-baseline justify-between gap-2 text-sm"
            >
              <span className="font-medium truncate">{p.name}</span>
              <span className="text-xs text-neutral-500 tabular-nums shrink-0">
                ⚽{p.goals}
                {p.assists > 0 && (
                  <span className="ml-1.5">🎯{p.assists}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InjuryCard({
  teamName,
  players,
  variant,
}: {
  teamName: string;
  players: Array<{
    name: string;
    reasonKo: string;
    reasonRaw: string;
    fixtureDate?: string;
  }>;
  variant: "home" | "away";
}) {
  return (
    <div className={`rounded-lg border ${VARIANT_BG[variant]} p-3.5`}>
      <div
        className={`text-xs font-semibold mb-2 truncate flex items-center justify-between gap-2 ${VARIANT_COLOR[variant]}`}
      >
        <span className="truncate">{teamName}</span>
        <span className="text-[10px] text-neutral-500 tabular-nums shrink-0">
          {players.length}명
        </span>
      </div>
      {players.length === 0 ? (
        <div className="text-xs text-neutral-500">최근 부상자 없음</div>
      ) : (
        <ul className="space-y-1.5">
          {players.map((p) => (
            <li
              key={p.name}
              className="flex items-baseline justify-between gap-2 text-sm"
              title={p.reasonRaw}
            >
              <span className="font-medium truncate">{p.name}</span>
              <span className="text-[11px] text-neutral-500 shrink-0">
                {p.reasonKo}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
