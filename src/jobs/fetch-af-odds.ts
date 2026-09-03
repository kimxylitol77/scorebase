// api-football odds 로 The Odds API 미커버 리그(7m 확장 리그)의 1X2 배당을 Match 에 저장.
// The Odds API 파이프(fetch-odds)와 동일 관례: 평균 implied(vig 제거)·in-play 가드·오프닝 1회 저장.
// v1 은 1X2(bet=1)만 — market blend 가 소비하는 필드. OU/핸디 등 부가 마켓은 승격 시 확장.

import "@/lib/env";
import { prisma } from "@/lib/db";
import { API_FOOTBALL_LEAGUE_ID } from "@/lib/sports/api-football-pro";
import { isSplitYearLeague } from "@/lib/sports/season-calendar";

// 대상 리그 — The Odds API 축구 67종에 없는 확장 리그만 (2026-08-02 전수 실측).
// RUSSIA_FNL 은 af 에도 부킹 0(제재) 실측이라 제외. The Odds API 커버 리그는 절대 넣지 말 것
// (이중 소스 → marketHome 덮어쓰기 경합).
const AF_ODDS_LEAGUES: string[] = [
  // 2026-09-03 추가 — 최근 30일 배당 0건 리그 전수 대조. 전부 ts 전용 수집이라 af fixture id 가
  // 없어 경기별 백필(api-sports-odds)이 못 닿았고, af leagues 조회로 coverage.odds=true 확인.
  // J2·FA_CUP·INDONESIA_L1·THAI_L1·VIETNAM_VL1·GHANA_PL·MOROCCO_BP·INDIA_ISL·SINGAPORE_PL·
  // PARAGUAY_PD 는 같은 조회에서 odds=false 라 제외(넣어도 0건).
  "ARG_PRIMERA_NACIONAL", "COLOMBIA_PA", "VENEZUELA_PD", "PERU_PD", "URUGUAY_PD", "BOLIVIA_PD",
  "K_LEAGUE_2", "K3_LEAGUE", "WK_LEAGUE", "EMPEROR_CUP",
  "NATIONAL_LEAGUE", "SCOT_CHAMPIONSHIP", "SCOT_LEAGUE_ONE", "SCOT_LEAGUE_TWO",
  "EREDIVISIE_2", "PRIMEIRA_LIGA_2", "CHALLENGE_LEAGUE", "POLAND_1L", "KAKKONEN_A",
  "CZECH_L", "LIGA_I", "BULGARIA_PL", "HUNGARY_NB1", "UKRAINE_PL", "LITHUANIA_AL",
  "AZERBAIJAN_PL", "ARMENIA_PL", "BOSNIA_PL", "ALBANIA_SL",
  "ISRAEL_PL", "UAE_PL", "QATAR_SL", "EGYPT_PL", "SOUTHAFRICA_PSL", "ALGERIA_L1",
  "WALES_PL", "MONTENEGRO_1L", "LUXEMBOURG_ND", "FAROE_PL",
  "PANAMA_LPF", "ELSALVADOR_PD", "NICARAGUA_PD",
  "COPA_DO_BRASIL", "PORTUGAL_SUPER_CUP",
  "ROMANIA_L2", "COSTA_RICA_PD", "GUATEMALA_LN", "HONDURAS_LN",
  "UZBEKISTAN_SL", "MEXICO_2", "CHINA_3",
  // UEFA 컵 예선 폴백 — The Odds API 는 UEL·UECL 예선 key 가 없다(2026-08-18 /sports
  // 실측). CUP_FILL_ONLY 가드가 본선 기간의 이중 소스 경합을 차단하므로 예외적으로 편입.
  // af 커버리지 실측(2026-08-19): 플레이오프 각 10경기 · 북메이커 14개.
  // AFC_CL·AFC_CL_TWO 는 af 도 0건이라 제외 — 제공 확인 후 추가.
  "UEL", "UECL",
];

// The Odds API 가 "본선"을 커버하는 대륙 컵 — 예선·플레이오프 기간(본선 key inactive,
// 예선 key 도 없음 — 2026-08-18 /sports 실측)에만 af 가 메꾼다.
// 이중 소스 경합 방지: **이미 배당이 있는 매치는 절대 덮지 않는다** (The Odds API 우선).
// 본선이 열리면 The Odds API 가 채우기 시작하고, 이 리그들은 자연히 no-op 이 된다.
const CUP_FILL_ONLY = new Set(["UEL", "UECL", "AFC_CL", "AFC_CL_TWO"]);

// 8~5월 시즌 리그 — af season 라벨이 시작 연도 (api-football-collector seasonFor 와 동일 규칙).
// season-calendar 의 유럽형 목록(isSplitYearLeague)에 없는 것만 여기 남긴다 — 2026-09-03 확장분은
// 전부 그 목록으로 판정된다.
const AUG_MAY = new Set([
  "WALES_PL", "MONTENEGRO_1L", "LUXEMBOURG_ND", "ROMANIA_L2", "PORTUGAL_SUPER_CUP",
  "UEL", "UECL", "AFC_CL", "AFC_CL_TWO", // 추춘제 컵
]);
function seasonFor(league: string, d: Date): number {
  const y = d.getFullYear();
  if (AUG_MAY.has(league) || isSplitYearLeague(league)) return d.getMonth() + 1 >= 7 ? y : y - 1;
  return y;
}

const AF_BASE = "https://v3.football.api-sports.io";

interface AfOddsValue { value?: string; odd?: string }
interface AfOddsResp {
  paging?: { current?: number; total?: number };
  response?: Array<{
    fixture?: { id?: number; date?: string };
    bookmakers?: Array<{ name?: string; bets?: Array<{ id?: number; values?: AfOddsValue[] }> }>;
  }>;
}
interface AfFixturesResp {
  response?: Array<{
    fixture?: { id?: number; date?: string };
    teams?: { home?: { name?: string }; away?: { name?: string } };
  }>;
}

async function afGet<T>(path: string): Promise<T> {
  const r = await fetch(`${AF_BASE}${path}`, {
    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY ?? "" },
  });
  if (!r.ok) throw new Error(`af ${path.split("?")[0]} HTTP ${r.status}`);
  return (await r.json()) as T;
}

// 발음부호 제거 — af 는 폴란드어·체코어 팀명을 발음부호까지 살려 주는데(Rakow/Hradec 등)
// ts(DB) 는 ASCII 로만 준다. 같은 팀의 이 표기차를 흡수한다. NFD 분해 후 결합 문자를 떼고, 분해되지 않는 글자(l/o/d/ss)는
// 직접 치환한다. 이 단계가 없으면 뒤의 [^a-z0-9] 제거가 발음부호 글자를 통째로 지워
// (rakow -> rakw) 유사 판정이 빗나간다 — 2026-08-20 UECL 하이두크-라쿠프 배당 누락 원인.
function deaccent(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0142\u0141]/g, "l")
    .replace(/[\u00f8\u00d8]/g, "o")
    .replace(/[\u0111\u0110\u00f0\u00d0]/g, "d")
    .replace(/\u00df/g, "ss")
    // 2026-08-22 — 두 정규화(여기 · odds-api normalizeOddsTeamName)는 별개 함수라
    // 한쪽만 고치면 다른 쪽에 같은 버그가 남는다. 문자 집합을 맞춰 둔다.
    .replace(/[\u0131]/g, "i")
    .replace(/[\u00fe\u00de]/g, "th")
    .replace(/[\u00e6\u00c6]/g, "ae");
}
// 팀명 정규화 — ts(DB) 이름과 af 이름 표기 차이 흡수용 (소문자·영숫자만).
function norm(s: string): string {
  return deaccent(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}
// 약한 유사 판정: 한쪽이 다른쪽 포함 또는 4자 이상 공통 토큰 존재.
function similar(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = deaccent(a).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  const tb = new Set(deaccent(b).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4));
  return ta.some((t) => tb.has(t));
}

/** bookmaker 별 1X2 → 평균 implied (vig 제거) + 평균 raw decimal. */
function impliedFromAfBookmakers(
  bookmakers: NonNullable<AfOddsResp["response"]>[number]["bookmakers"],
): {
  home: number; draw: number; away: number; consensus: number;
  rawHome: number; rawDraw: number; rawAway: number;
} | null {
  let hSum = 0, dSum = 0, aSum = 0, rh = 0, rd = 0, ra = 0, n = 0;
  for (const b of bookmakers ?? []) {
    const bet = (b.bets ?? []).find((x) => x.id === 1); // Match Winner
    if (!bet) continue;
    let h: number | null = null, d: number | null = null, a: number | null = null;
    for (const v of bet.values ?? []) {
      const odd = Number(v.odd);
      if (!Number.isFinite(odd) || odd <= 1) continue;
      if (v.value === "Home") h = odd;
      else if (v.value === "Draw") d = odd;
      else if (v.value === "Away") a = odd;
    }
    if (h == null || a == null || d == null) continue;
    const ih = 1 / h, id = 1 / d, ia = 1 / a;
    const sum = ih + id + ia;
    hSum += ih / sum; dSum += id / sum; aSum += ia / sum;
    rh += h; rd += d; ra += a;
    n++;
  }
  if (n === 0) return null;
  return {
    home: hSum / n, draw: dSum / n, away: aSum / n, consensus: n,
    rawHome: rh / n, rawDraw: rd / n, rawAway: ra / n,
  };
}

export async function runFetchAfOdds(opts?: { leagues?: string[] }) {
  const leagues = opts?.leagues ?? AF_ODDS_LEAGUES;
  const now = new Date();
  const tally: Record<string, number> = {};
  console.log(`[af-odds] 시작 — leagues=${leagues.length}`);

  for (const league of leagues) {
    const afId = API_FOOTBALL_LEAGUE_ID[league];
    if (!afId) continue;
    const season = seasonFor(league, now);
    try {
      // 1) odds (bet=1) — 페이지 순회
      const oddsByFixture = new Map<number, NonNullable<AfOddsResp["response"]>[number]>();
      for (let page = 1; page <= 5; page++) {
        const j = await afGet<AfOddsResp>(`/odds?league=${afId}&season=${season}&bet=1&page=${page}`);
        for (const row of j.response ?? []) {
          if (row.fixture?.id != null) oddsByFixture.set(row.fixture.id, row);
        }
        if (!j.paging?.total || page >= j.paging.total) break;
      }
      if (oddsByFixture.size === 0) { tally[league] = 0; continue; }

      // 2) 향후 10일 fixture 팀명 (af fixture id → 이름·시각)
      const from = now.toISOString().slice(0, 10);
      const to = new Date(now.getTime() + 10 * 86400_000).toISOString().slice(0, 10);
      const fx = await afGet<AfFixturesResp>(`/fixtures?league=${afId}&season=${season}&from=${from}&to=${to}`);
      const fixtures = (fx.response ?? [])
        .filter((f) => f.fixture?.id != null && f.fixture.date && oddsByFixture.has(f.fixture.id!))
        .map((f) => ({
          id: f.fixture!.id!,
          time: new Date(f.fixture!.date!).getTime(),
          home: f.teams?.home?.name ?? "",
          away: f.teams?.away?.name ?? "",
        }));

      // 3) DB SCHEDULED 매치 매칭 — 킥오프 시각 우선(±30분), 동시 킥오프는 팀명 유사로 판별
      const dbMatches = await prisma.match.findMany({
        where: {
          league,
          status: "SCHEDULED",
          startTime: { gte: now, lte: new Date(now.getTime() + 10 * 86400_000) },
        },
        include: { homeTeam: true, awayTeam: true },
      });

      let matched = 0;
      for (const m of dbMatches) {
        // 컵 폴백 리그 — The Odds API 가 이미 채운 매치는 건드리지 않는다 (경합 차단)
        if (CUP_FILL_ONLY.has(league) && m.marketHome != null) continue;
        const t = m.startTime.getTime();
        const window = fixtures.filter((f) => Math.abs(f.time - t) <= 30 * 60_000);
        let pick: (typeof fixtures)[number] | null = null;
        if (window.length === 1 && Math.abs(window[0].time - t) <= 5 * 60_000) {
          // 단독 후보 + 킥오프 일치 — ts/af 팀명 표기가 아예 달라도 수용
          pick = window[0];
        }
        if (!pick) {
          // 복수 후보(라운드 동시 킥오프) — 팀명 유사 필수, 홈·원정 양쪽 신호로 단일화
          const named = window.filter(
            (f) => similar(f.home, m.homeTeam.name) && similar(f.away, m.awayTeam.name),
          );
          if (named.length === 1) pick = named[0];
        }
        if (!pick) continue;

        const implied = impliedFromAfBookmakers(oddsByFixture.get(pick.id)?.bookmakers);
        if (!implied) continue;
        // in-play/정지 마켓 가드 — fetch-odds 와 동일 (정상 프리게임 최대 ~0.90)
        if (Math.max(implied.home, implied.away) > 0.97) continue;

        const openingPatch =
          m.openingMarketHome == null
            ? {
                openingMarketHome: implied.home,
                openingMarketDraw: implied.draw,
                openingMarketAway: implied.away,
                openingCapturedAt: new Date(),
              }
            : {};
        await prisma.match.update({
          where: { id: m.id },
          data: {
            marketHome: implied.home,
            marketDraw: implied.draw,
            marketAway: implied.away,
            marketBookmakers: implied.consensus,
            marketUpdatedAt: new Date(),
            oddsHome: implied.rawHome,
            oddsDraw: implied.rawDraw,
            oddsAway: implied.rawAway,
            ...openingPatch,
          },
        });
        matched++;
      }
      tally[league] = matched;
      console.log(`[af-odds/${league}] odds ${oddsByFixture.size}건 → 매칭 ${matched}/${dbMatches.length}`);
    } catch (e) {
      console.error(`[af-odds/${league}] 실패:`, (e as Error).message);
    }
  }
  console.log(`[af-odds] 완료 —`, JSON.stringify(tally));
  return tally;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFetchAfOdds()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
