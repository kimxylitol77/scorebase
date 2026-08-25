// 해외파 한국 선수 — 현재 시즌(2026-27) 기록 갱신. data/korea-abroad.json 의 players[].current 를 채운다.
//
// 왜 ts 인가: api-football 은 리그 전수 스캔이라 회당 ~800콜이고, 새 시즌 개막 직후엔
//   coverage.players=false 로 조용히 0건을 준다([[af-preseason-coverage-trap]]).
//   TheSports /season/recent/player/stat 은 **리그당 1콜**로 현재 시즌 선수 스탯을 주고
//   nationality(KOR)까지 함께 온다 — 23콜이면 끝나 매일 돌릴 수 있다.
//
// 지난 시즌(2025-26) 확정 기록은 건드리지 않는다. players[].totals / seasonStat 가 그대로 남고,
// 이 스크립트는 current 만 새로 쓴다 — 화면의 시즌 탭이 둘을 나눠 보여준다.
//
//   npx tsx --env-file=.env.local scripts/refresh-korea-abroad-current.ts
//   npx tsx --env-file=.env.local scripts/refresh-korea-abroad-current.ts --dry   (파일 미기록)
import "../src/lib/env";
import * as fs from "fs";
import * as path from "path";
import { LEAGUES } from "./build-korea-abroad";
import rawLeagueMap from "../src/lib/sports/thesports/league-id-mapping.json";

const OUT = path.join(__dirname, "..", "data", "korea-abroad.json");
const DRY = process.argv.includes("--dry");
const TS_BASE = "https://api.thesports.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LEAGUE_MAP = rawLeagueMap as Array<{ code: string; tsSeasonId?: string }>;

/** ts 선수 시즌 스탯 1행. rating 은 출전 경기 평점의 합×100 이라 court 로 나눠야 평균이 된다. */
interface TsPlayerStat {
  player?: { id?: string; name?: string; nationality?: string; position?: string };
  team?: { id?: string; name?: string };
  matches?: number; // 스쿼드 포함 경기
  court?: number; // 실제 출전 경기
  first?: number; // 선발
  goals?: number;
  assists?: number;
  minutes_played?: number;
  rating?: number;
  yellow_cards?: number;
  red_cards?: number;
}

type CurrentStatus = "played" | "none" | "preseason" | "uncovered";
interface CurrentStat {
  status: CurrentStatus;
  season: string;
  team: string | null;
  apps: number;
  starts: number;
  goals: number;
  assists: number;
  minutes: number;
  rating: number | null;
  yellow: number;
  red: number;
}

interface Player {
  afId: number;
  tsId: string | null;
  nameKo: string;
  nameEn: string;
  league: string;
  leagueLabel: string;
  current?: CurrentStat | null;
  [k: string]: unknown;
}

async function tsGet(seasonId: string): Promise<TsPlayerStat[] | null> {
  // THESPORTS_PROXY_URL 이 있으면 화이트리스트 IP(Vultr) 프록시 경유 — 맥미니 직통이 IP 차단으로
  // 매일 빈 결과를 받아 19명 기록을 0 으로 덮어쓰던 사고의 근본 원인 (2026-08-24~25 실측).
  const proxy = process.env.THESPORTS_PROXY_URL;
  const url = new URL((proxy || TS_BASE) + "/v1/football/season/recent/player/stat");
  if (!proxy) {
    url.searchParams.set("user", process.env.THESPORTS_USER ?? "");
    url.searchParams.set("secret", process.env.THESPORTS_SECRET ?? "");
  }
  url.searchParams.set("uuid", seasonId);
  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(30_000),
    headers: proxy ? { "x-ts-proxy-token": process.env.THESPORTS_PROXY_TOKEN ?? "" } : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as { code?: number; results?: TsPlayerStat[]; err?: string };
  // code!==0 은 오류다. 빈 배열(개막 전)과 구분해야 "미개막"을 "미출전"으로 오인하지 않는다.
  // 화이트리스트 밖 IP 는 code 없이 {err: "IP is not authorized"} 만 온다 — 이것도 오류.
  if (j.code !== 0) {
    if (j.err) console.error(`  ts 오류: ${j.err}`);
    return null;
  }
  return Array.isArray(j.results) ? j.results : [];
}

// 같은 성(姓)의 로마자 변형 — 소스마다 갈린다(우리 "Jeong Sang-Bin" ↔ ts "Sang-bin Jung").
// 리그·국적으로 좁힌 뒤 유일할 때만 채택하므로 살짝 넓게 묶어도 오매칭으로 이어지지 않는다.
const SURNAME_VARIANTS: Record<string, string> = {
  kim: "kim", gim: "kim",
  lee: "lee", yi: "lee", rhee: "lee", ri: "lee",
  park: "park", pak: "park", bak: "park",
  choi: "choi", choe: "choi",
  jung: "jung", jeong: "jung", chung: "jung", jong: "jung",
  kang: "kang", gang: "kang",
  cho: "cho", jo: "cho",
  yoon: "yoon", yun: "yoon",
  jang: "jang", chang: "jang",
  lim: "lim", im: "lim", rim: "lim",
  seo: "seo", suh: "seo",
  shin: "shin", sin: "shin",
  kwon: "kwon", gwon: "kwon",
  ahn: "ahn", an: "ahn",
  ko: "ko", go: "ko", koh: "ko",
  baek: "baek", paik: "baek", back: "baek",
  noh: "noh", roh: "noh",
  moon: "moon", mun: "moon",
  joo: "joo", ju: "joo",
  oh: "oh", o: "oh",
};

/** 이름 토큰 집합 비교 — af 는 "Kang-In Lee", ts 는 "Lee Kang-In" 처럼 어순이 갈린다.
 *  리그 + 국적 KOR 로 이미 좁혀진 뒤에만 쓴다(전체 명단에 쓰면 홍현석↔홍석현 오매칭). */
function nameKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[\s\-_.]+/)
    .filter(Boolean)
    .map((t) => SURNAME_VARIANTS[t] ?? t)
    .sort()
    .join("");
}

async function main() {
  const data = JSON.parse(fs.readFileSync(OUT, "utf-8")) as {
    updatedAt: string;
    season: string;
    currentSeason?: string;
    currentUpdatedAt?: string;
    players: Player[];
  };
  // 전멸 가드 원료 — 갱신 전 파일의 출전 인원
  const prevPlayed = data.players.filter((p) => (p.current as CurrentStat | null | undefined)?.status === "played").length;

  // 리그별 ts 시즌 스탯 수집
  const rowsByLeague = new Map<string, TsPlayerStat[] | null>(); // null = 조회 실패
  for (const lg of LEAGUES) {
    const seasonId = LEAGUE_MAP.find((l) => l.code === lg.code)?.tsSeasonId;
    if (!seasonId) {
      console.warn(`  · ${lg.code}: tsSeasonId 없음 — 건너뜀`);
      continue;
    }
    try {
      const rows = await tsGet(seasonId);
      rowsByLeague.set(lg.code, rows);
      console.log(`  · ${lg.code.padEnd(15)} ${rows === null ? "조회 실패" : `${rows.length}행`}`);
    } catch (e) {
      rowsByLeague.set(lg.code, null);
      console.warn(`  · ${lg.code}: ${(e as Error).message}`);
    }
    await sleep(250);
  }

  // 리그별 KOR 선수 인덱스
  const korByLeague = new Map<string, TsPlayerStat[]>();
  for (const [code, rows] of rowsByLeague) {
    if (!rows) continue;
    korByLeague.set(
      code,
      rows.filter((r) => r.player?.nationality === "KOR"),
    );
  }

  const seasonLabelOf = (code: string) =>
    LEAGUES.find((l) => l.code === code)?.calendarSeason ?? "2026-27";

  let played = 0;
  let none = 0;
  let preseason = 0;
  let uncovered = 0;
  const matchedTsIds = new Set<string>();
  const noneNames: string[] = [];

  for (const p of data.players) {
    const rows = rowsByLeague.get(p.league);
    const season = seasonLabelOf(p.league);
    // 리그 코드는 남아 있는데 라벨이 다른 선수 = 대상 밖 리그로 이적한 것(조진호 SUPER_LIG → 1. Lig).
    // 그대로 두면 "미출전"으로 단정되지만 실제로는 우리가 그 리그 기록을 안 받는 것이다.
    const offTarget = !!p.leagueLabel && p.leagueLabel !== LEAGUES.find((l) => l.code === p.league)?.label;

    if (rows === undefined || rows === null || offTarget) {
      // 대상 리그 밖이거나 조회 실패 — 숫자를 지어내지 않고 "기록 없음"으로 둔다
      p.current = { status: "uncovered", season, team: null, apps: 0, starts: 0, goals: 0, assists: 0, minutes: 0, rating: null, yellow: 0, red: 0 };
      uncovered++;
      continue;
    }
    if (rows.length === 0) {
      p.current = { status: "preseason", season, team: null, apps: 0, starts: 0, goals: 0, assists: 0, minutes: 0, rating: null, yellow: 0, red: 0 };
      preseason++;
      continue;
    }

    const kor = korByLeague.get(p.league) ?? [];
    let hit = p.tsId ? kor.find((r) => r.player?.id === p.tsId) : undefined;
    if (!hit) {
      const key = nameKey(p.nameEn);
      const cands = kor.filter((r) => nameKey(r.player?.name ?? "") === key);
      // 같은 리그·같은 국적에 동명이인이 둘이면 사람이 봐야 한다 — 조용히 아무거나 붙이지 않는다
      if (cands.length === 1) hit = cands[0];
      else if (cands.length > 1) console.warn(`  ⚠ ${p.nameKo}: ${p.league} 에 동명 후보 ${cands.length}명 — 건너뜀`);
    }

    if (!hit) {
      // 리그는 개막했는데 이 선수 행이 없다 = 아직 한 경기도 안 뛰었다.
      // (이름 매칭 실패도 여기로 떨어지므로 반드시 눈으로 확인할 수 있게 남긴다)
      p.current = { status: "none", season, team: null, apps: 0, starts: 0, goals: 0, assists: 0, minutes: 0, rating: null, yellow: 0, red: 0 };
      noneNames.push(`${p.nameKo}(${p.league}, ${p.nameEn})`);
      none++;
      continue;
    }

    if (hit.player?.id) matchedTsIds.add(hit.player.id);
    const apps = hit.court ?? 0;
    p.current = {
      status: apps > 0 ? "played" : "none",
      season,
      team: hit.team?.name ?? null,
      apps,
      starts: hit.first ?? 0,
      goals: hit.goals ?? 0,
      assists: hit.assists ?? 0,
      minutes: hit.minutes_played ?? 0,
      // rating 은 출전 경기 평점의 합×100 (실측: Pavlidis 1759/2경기 = 8.80)
      rating: apps > 0 && hit.rating ? Number((hit.rating / 100 / apps).toFixed(2)) : null,
      yellow: hit.yellow_cards ?? 0,
      red: hit.red_cards ?? 0,
    };
    if (apps > 0) played++;
    else none++;
  }

  // 명단에 없는 ts KOR 선수 — 새 얼굴 후보. 명단 편입은 af 스캔(build-korea-abroad)의 몫이라 보고만 한다.
  const unknown: string[] = [];
  for (const [code, kor] of korByLeague) {
    for (const r of kor) {
      if (r.player?.id && matchedTsIds.has(r.player.id)) continue;
      const key = nameKey(r.player?.name ?? "");
      if (data.players.some((p) => p.league === code && nameKey(p.nameEn) === key)) continue;
      unknown.push(`${r.player?.name} (${code}, ${r.team?.name}, ${r.court ?? 0}출전)`);
    }
  }

  data.currentSeason = "2026-27";
  data.currentUpdatedAt = new Date().toISOString();

  console.log(
    `\n출전 ${played} · 미출전 ${none} · 개막 전 ${preseason} · 리그 미커버 ${uncovered} (명단 ${data.players.length})`,
  );
  if (noneNames.length) {
    // 진짜 미출전인지, 이름이 안 붙은 것인지는 여기 목록을 봐야 갈린다
    console.log(`개막했는데 기록 없는 선수 ${noneNames.length}명 — ${noneNames.join(" · ")}`);
  }
  if (unknown.length) {
    console.log(`명단 밖 ts 한국 선수 ${unknown.length}명 — build-korea-abroad 다음 실행에서 편입 대상`);
    for (const u of unknown.slice(0, 20)) console.log(`   ${u}`);
  }

  if (DRY) {
    console.log("\n[--dry] 파일 미기록");
    return;
  }
  // ── 전멸 가드 — 소스 실패(IP 차단·장애)로 받은 빈 결과를 좋은 데이터 위에 덮어쓰지 않는다.
  //    직전 파일에 출전 기록이 있었는데 이번 실행이 출전 0 이면 조회 실패로 보고 저장을 포기한다.
  //    (2026-08-24~25 맥미니 IP 차단이 매일 07:20 19명 기록을 0 으로 지우던 사고의 재발 방지.
  //     시즌 사이 실제 전원 0 인 시기는 preseason 상태라 played 비교에 안 걸린다.)
  if (played === 0 && prevPlayed > 0) {
    console.error(
      `\n⛔ 저장 중단 — 직전 파일 출전 ${prevPlayed}명이 이번 실행에서 0명. ts 조회 실패(IP 차단 등)로 판단, 기존 데이터 유지.`,
    );
    process.exit(2);
  }
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
  console.log(`\n✓ ${path.relative(process.cwd(), OUT)} 갱신`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
