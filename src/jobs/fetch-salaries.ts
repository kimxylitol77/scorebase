// 선수 연봉 수집 잡 — NBA(basketball-reference)·MLB(spotrac)·GOLF(ESPN) 스크래핑 + KBO·테니스·F1(큐레이션) → PlayerSalary replace.
// /api/cron/fetch-salaries 호출 + 수동: npm run job:salaries
//
// "현재 시즌 스냅샷" → league 전체 deleteMany 후 createMany (rank 변동·은퇴 자동 정리).
// ⚠️ 파싱 0건이면 해당 league replace 안 함 — 스크래핑 실패(봇차단·구조변경) 시 빈 테이블 덮어쓰기 방지.
// ⚠️ KBO 는 정적 JSON(만원 단위) — 연봉이 연 1회 발표 후 불변이라 수집은 scripts/collect-kbo-salaries.ts
//    로 연 1회 수동 실행하고 커밋한다. 여기서는 그 JSON 을 cron 마다 멱등 replace 할 뿐이다.
// ⚠️ 테니스(ATP/WTA 시즌 상금)·F1(연봉 추정)도 정적 JSON 멱등 replace — 갱신 방법은 각 lib 헤더 참고.
//    사진은 replace 시점에 ESPN 랭킹/스탠딩 이름 매칭 → headshot URL 실존 검증(HEAD) 후 photoUrl 로 저장.

import { prisma } from "@/lib/db";
import { fetchNbaSalaries, currentSeasonLabel } from "@/lib/sports/nba-salaries";
import { fetchMlbSalaries, mlbSeasonLabel } from "@/lib/sports/mlb-salaries";
import { fetchNhlSalaries, nhlSeasonLabel } from "@/lib/sports/nhl-salaries";
import { getKboSalaries, KBO_SALARY_SEASON } from "@/lib/sports/kbo-salaries";
import { fetchGolfSalaries, golfSeasonLabel } from "@/lib/sports/golf-salaries";
import { getTennisPrizeMoney, TENNIS_PRIZE_SEASON } from "@/lib/sports/tennis-prize-money";
import { getF1Salaries, F1_SALARY_SEASON } from "@/lib/sports/f1-salaries";
import nhlSeed from "../../data/nhl-salaries-seed.json";
import mlbSeed from "../../data/mlb-salaries-seed.json";
import nbaSeed from "../../data/nba-salaries-seed.json";
import golfSeed from "../../data/golf-salaries-seed.json";

interface LeagueResult {
  league: string;
  fetched: number;
  replaced: boolean;
  fromSeed?: boolean;
}

// 스크래핑 실패(0건) 시 커밋된 seed 로 대체. 연봉은 거의 불변 → seed 고정도 실용적.
// Spotrac 하드차단(MLB) · Vercel 데이터센터 IP 차단(NBA basketball-ref) 대비 안전망.
const SEEDS: Record<string, NormalizedRow[]> = {
  NHL: nhlSeed as NormalizedRow[],
  MLB: mlbSeed as NormalizedRow[],
  NBA: nbaSeed as NormalizedRow[],
  GOLF: golfSeed as NormalizedRow[],
};

/** 한 리그 연봉 replace — 파싱 0건이면 seed fallback, seed 도 비면 기존 유지. */
async function replaceLeague(
  league: string,
  rows: NormalizedRow[],
  season: string,
): Promise<LeagueResult> {
  let fromSeed = false;
  if (rows.length === 0) {
    const seed = SEEDS[league] ?? [];
    if (seed.length === 0) {
      console.warn(`[fetch-salaries] ${league}: 파싱 0건 + seed 없음 — 기존 데이터 유지(replace skip)`);
      return { league, fetched: 0, replaced: false };
    }
    console.warn(`[fetch-salaries] ${league}: 파싱 0건 — 스크래핑 실패, seed ${seed.length}명으로 대체`);
    rows = seed;
    fromSeed = true;
  }
  await prisma.$transaction([
    prisma.playerSalary.deleteMany({ where: { league } }),
    prisma.playerSalary.createMany({
      data: rows.map((r) => ({
        league,
        season,
        rank: r.rank,
        playerName: r.playerName,
        position: r.position ?? null,
        teamName: r.teamName,
        salary: r.salary,
        photoUrl: r.photoUrl ?? null,
      })),
    }),
  ]);
  console.log(`[fetch-salaries] ${league}: ${rows.length}명 replace (시즌 ${season})${fromSeed ? " [seed]" : ""}`);
  return { league, fetched: rows.length, replaced: true, fromSeed };
}

interface NormalizedRow {
  rank: number;
  playerName: string;
  teamName: string;
  position?: string | null; // KBO 포지션(포수·투수·내야수·외야수). NBA/MLB 는 미사용.
  salary: number;
  photoUrl?: string;
}

/** 이름 매칭 키 — 소문자 + 분음부호 제거 (상금 PDF 표기와 ESPN 표기 흡수, /salaries/tennis 와 동일 규칙). */
function nameKey(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

/** headshot URL 실존 검증 — 무명 선수는 절반가량 404 라 200 + image 만 채택 (서버 컴포넌트라 onError fallback 불가). */
async function verifyImage(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(6000) });
    return r.ok && (r.headers.get("content-type") ?? "").includes("image");
  } catch {
    return false;
  }
}

/** 테니스 상금 JSON → NormalizedRow. ESPN 랭킹 top150 이름 매칭으로 headshot 결합 (미매칭·404 는 사진 없음 → 이니셜). */
async function tennisRows(tour: "ATP" | "WTA"): Promise<NormalizedRow[]> {
  const rows: NormalizedRow[] = getTennisPrizeMoney(tour).map((r) => ({
    rank: r.rank,
    playerName: r.playerName,
    teamName: r.country ?? "",
    salary: r.salary,
  }));
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/tennis/${tour.toLowerCase()}/rankings`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return rows;
    const j = (await res.json()) as {
      rankings?: Array<{ ranks?: Array<{ athlete?: { id?: string; displayName?: string } }> }>;
    };
    // 중국 선수 등 성-이름 순서가 소스별로 달라 역순 키도 함께 (WTA "Shuai Zhang" vs ESPN "Zhang Shuai")
    const idOf = new Map<string, string>();
    for (const rk of j.rankings?.[0]?.ranks ?? []) {
      const a = rk.athlete;
      if (!a?.id || !a.displayName) continue;
      idOf.set(nameKey(a.displayName), a.id);
      const rev = nameKey(a.displayName.split(" ").reverse().join(" "));
      if (!idOf.has(rev)) idOf.set(rev, a.id);
    }
    await Promise.all(
      rows.map(async (r) => {
        const id = idOf.get(nameKey(r.playerName));
        if (!id) return;
        const url = `https://a.espncdn.com/i/headshots/tennis/players/full/${id}.png`;
        if (await verifyImage(url)) r.photoUrl = url;
      }),
    );
  } catch {
    /* ESPN 실패 시 사진 없이 진행 */
  }
  return rows;
}

/** F1 연봉 JSON → NormalizedRow. ESPN 챔피언십 스탠딩 이름 매칭으로 headshot(rpm) 결합. */
async function f1Rows(): Promise<NormalizedRow[]> {
  const rows: NormalizedRow[] = getF1Salaries().map((d) => ({
    rank: d.rank,
    playerName: d.name,
    teamName: d.team,
    salary: d.salary,
  }));
  try {
    const year = F1_SALARY_SEASON.slice(0, 4);
    const root = (await (
      await fetch(
        `https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/${year}/types/2/standings`,
        { signal: AbortSignal.timeout(8000) },
      )
    ).json()) as { items?: Array<{ $ref?: string }> };
    const grpRef = root.items?.[0]?.$ref;
    if (!grpRef) return rows;
    const grp = (await (await fetch(grpRef, { signal: AbortSignal.timeout(8000) })).json()) as {
      standings?: Array<{ athlete?: { $ref?: string } }>;
    };
    const idOf = new Map<string, string>();
    await Promise.all(
      (grp.standings ?? []).map(async (row) => {
        if (!row.athlete?.$ref) return;
        try {
          const a = (await (await fetch(row.athlete.$ref, { signal: AbortSignal.timeout(8000) })).json()) as {
            id?: string;
            displayName?: string;
          };
          if (a.id && a.displayName) idOf.set(nameKey(a.displayName), a.id);
        } catch {
          /* 개별 실패 무시 */
        }
      }),
    );
    await Promise.all(
      rows.map(async (r) => {
        const id = idOf.get(nameKey(r.playerName));
        if (!id) return;
        const url = `https://a.espncdn.com/i/headshots/rpm/players/full/${id}.png`;
        if (await verifyImage(url)) r.photoUrl = url;
      }),
    );
  } catch {
    /* ESPN 실패 시 사진 없이 진행 */
  }
  return rows;
}

export async function runFetchSalaries(): Promise<{ results: LeagueResult[] }> {
  const now = new Date();
  // NBA·MLB·NHL·GOLF 병렬 스크래핑 → 각자 replace (한쪽 실패해도 다른 쪽 진행)
  const [nba, mlb, nhl, golf] = await Promise.all([
    fetchNbaSalaries(),
    fetchMlbSalaries(),
    fetchNhlSalaries(),
    fetchGolfSalaries(now),
  ]);
  const results: LeagueResult[] = [];
  results.push(await replaceLeague("NBA", nba, currentSeasonLabel(now)));
  results.push(await replaceLeague("MLB", mlb, mlbSeasonLabel(now)));
  results.push(await replaceLeague("NHL", nhl, nhlSeasonLabel(now)));
  results.push(await replaceLeague("KBO", getKboSalaries(), KBO_SALARY_SEASON));
  results.push(await replaceLeague("GOLF", golf, golfSeasonLabel(now)));
  results.push(await replaceLeague("TENNIS_ATP", await tennisRows("ATP"), TENNIS_PRIZE_SEASON));
  results.push(await replaceLeague("TENNIS_WTA", await tennisRows("WTA"), TENNIS_PRIZE_SEASON));
  results.push(await replaceLeague("F1", await f1Rows(), F1_SALARY_SEASON));
  return { results };
}

if (process.argv[1]?.includes("fetch-salaries")) {
  runFetchSalaries()
    .then((s) => {
      console.log("done:", JSON.stringify(s));
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
