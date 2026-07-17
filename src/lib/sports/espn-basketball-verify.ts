// stale-cleanup 용 ESPN 농구 scoreboard verify — api-sports 농구 quota 로 verify 불가한 WNBA(+NBA) fallback
//
// 주의: ESPN 은 state=post 가 '연기'일 수도 있음 (STATUS_POSTPONED 도 state=post, 2026-07-17 실측)
// → 반드시 status.type.name 으로 판정한다. 알 수 없는 status 는 verdict 미기록 → 호출부가 KEPT 유지.

export const ESPN_BASKETBALL_SLUG: Record<string, string> = {
  WNBA: "wnba",
  NBA: "nba",
};

export type EspnBasketballVerdict =
  | { kind: "FINISHED"; homeScore: number | null; awayScore: number | null; typeName: string }
  | { kind: "POSTPONED"; typeName: string };

type VerifyTarget = {
  id: number;
  league: string;
  startTime: Date;
  homeName: string;
  awayName: string;
};

// 팀명 매칭 — normalize(소문자 + 영숫자만) 후 substring 양방향.
// 우리 DB 는 "Dallas Wings W" 처럼 W suffix 가 붙어 ESPN "Dallas Wings" 와 substring 으로 맞는다.
const normTeam = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const teamMatches = (ours: string, espn: string) => {
  const a = normTeam(ours);
  const b = normTeam(espn);
  return a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));
};

// ESPN scoreboard 의 dates= 는 미 동부(ET) 기준 날짜라 UTC startTime 과 하루 어긋날 수 있음
// (실측: 07-17T01:00Z 매치가 20260716 보드에 실림) → 당일 + 전일 두 보드를 조회한다.
const dateKey = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
const DAY_MS = 24 * 3600 * 1000;

// 동일 대진 연전(최소 24h 간격)과는 구분하면서 시각 오차는 흡수하는 허용폭
const EVENT_TIME_TOLERANCE_MS = 12 * 3600 * 1000;

type EspnEvent = {
  date?: string;
  status?: { type?: { name?: string } };
  competitions?: Array<{
    competitors?: Array<{
      homeAway?: string;
      score?: string;
      team?: { displayName?: string };
    }>;
  }>;
};

async function fetchScoreboard(slug: string, yyyymmdd: string): Promise<EspnEvent[]> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/${slug}/scoreboard?dates=${yyyymmdd}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: EspnEvent[] };
    return data?.events ?? [];
  } catch (e) {
    console.warn(
      `[espn-basketball-verify] scoreboard fetch fail ${slug}/${yyyymmdd}:`,
      (e as Error).message,
    );
    return [];
  }
}

export async function verifyEspnBasketball(
  targets: VerifyTarget[],
): Promise<Map<number, EspnBasketballVerdict>> {
  const verdicts = new Map<number, EspnBasketballVerdict>();
  const valid = targets.filter((t) => ESPN_BASKETBALL_SLUG[t.league]);
  if (valid.length === 0) return verdicts;

  // (slug, 날짜) 조합별 1회만 조회
  const boards = new Map<string, EspnEvent[]>();
  for (const t of valid) {
    const slug = ESPN_BASKETBALL_SLUG[t.league];
    for (const ms of [t.startTime.getTime(), t.startTime.getTime() - DAY_MS]) {
      const cacheKey = `${slug}|${dateKey(ms)}`;
      if (!boards.has(cacheKey)) boards.set(cacheKey, await fetchScoreboard(slug, dateKey(ms)));
    }
  }

  for (const t of valid) {
    const slug = ESPN_BASKETBALL_SLUG[t.league];
    const events = [
      ...(boards.get(`${slug}|${dateKey(t.startTime.getTime())}`) ?? []),
      ...(boards.get(`${slug}|${dateKey(t.startTime.getTime() - DAY_MS)}`) ?? []),
    ];
    for (const e of events) {
      const eventMs = e.date ? new Date(e.date).getTime() : NaN;
      if (!Number.isFinite(eventMs) || Math.abs(eventMs - t.startTime.getTime()) > EVENT_TIME_TOLERANCE_MS)
        continue;
      const comps = e.competitions?.[0]?.competitors ?? [];
      const home = comps.find((c) => c.homeAway === "home");
      const away = comps.find((c) => c.homeAway === "away");
      if (!home?.team?.displayName || !away?.team?.displayName) continue;
      if (
        !teamMatches(t.homeName, home.team.displayName) ||
        !teamMatches(t.awayName, away.team.displayName)
      )
        continue;
      const typeName = e.status?.type?.name ?? "";
      if (typeName === "STATUS_FINAL") {
        const hs = Number.parseInt(home.score ?? "", 10);
        const as = Number.parseInt(away.score ?? "", 10);
        verdicts.set(t.id, {
          kind: "FINISHED",
          homeScore: Number.isFinite(hs) ? hs : null,
          awayScore: Number.isFinite(as) ? as : null,
          typeName,
        });
      } else if (typeName === "STATUS_POSTPONED" || typeName === "STATUS_CANCELED") {
        verdicts.set(t.id, { kind: "POSTPONED", typeName });
      }
      // 그 외 (STATUS_SCHEDULED / IN_PROGRESS 등) — verdict 미기록 → 호출부에서 KEPT
      break;
    }
  }
  return verdicts;
}
