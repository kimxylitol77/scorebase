// 리그 페이지(한국어 /leagues·영어 /en/standings)용 이번 시즌 포스트시즌 리더 조회 — 기록이 생기기 전엔 null.
// 원천은 /baseball/postseason/stats 와 같다(MLB statsapi gameType=P · KBO·NPB 아카이브).
import type { LeaderRow } from "@/components/LeagueLeaderBoard";
import { getMlbPostseasonStats } from "./mlb-postseason-stats";
import { getArchivePostseason } from "./postseason-archive";
import { postseasonLeaderRows } from "./postseason-leaders";
import { currentMlbSeason } from "@/lib/sports/mlb-postseason";
import { kboPhotoUrl } from "@/lib/sports/kbo-official";
import { npbPlayerPhoto } from "@/lib/sports/npb-player-ko";

export async function loadPostseasonLeaders(
  league: string,
  locale: "ko" | "en" = "ko",
): Promise<{ season: number; rows: Record<string, LeaderRow[]> } | null> {
  if (league !== "MLB" && league !== "KBO" && league !== "NPB") return null;
  const season = league === "MLB" ? currentMlbSeason() : new Date().getFullYear();
  const ps = league === "MLB" ? await getMlbPostseasonStats(season).catch(() => null) : await getArchivePostseason(league, season).catch(() => null);
  if (!ps) return null;
  const rows = postseasonLeaderRows(
    ps,
    (r) =>
      league === "MLB" && r.externalId
        ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${r.externalId}/headshot/67/current`
        : league === "KBO" && r.externalId
          ? kboPhotoUrl(r.externalId)
          : league === "NPB" && r.logId
            ? npbPlayerPhoto(r.logId) ?? null
            : null,
    (r) => (league === "NPB" ? r.logId : r.externalId),
    locale,
  );
  return Object.keys(rows).length ? { season, rows } : null;
}
