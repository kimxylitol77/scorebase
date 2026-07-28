// 해외파 한국 선수 로스터 — api-football 리그 전수 스캔 후 국적 South Korea 필터 → data/korea-abroad.json
//
// 왜 af 인가: TheSports /season/recent/player/stat 은 현재 시즌만 응답(과거 시즌 uuid = code 405).
//   7~8월 유럽 비수기엔 현재 시즌 행이 0이라 지난 시즌(2025-26) 성적을 못 채운다. af 는 season=2025 로 조회 가능.
//   시즌 개막 후 현재 시즌 갱신은 ts 리그당 1콜로 대체 가능 → refresh-korea-abroad 로 분리(후속).
//
// 비용: 리그당 /players?league&season 페이지 수만큼(20명/페이지, 25~50페이지). 전체 ~800콜.
//   af Pro 일한도 내이지만 매일 돌릴 성격은 아니다 — 주 1회(weekly-static-refresh) 권장.
//
//   npx tsx --env-file=.env.local scripts/build-korea-abroad.ts
//   npx tsx --env-file=.env.local scripts/build-korea-abroad.ts --league=CHAMPIONSHIP   (단일 리그 테스트)
import "../src/lib/env";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { toKoreanPlayerName } from "../src/lib/player-names";
import rawOverrides from "../data/player-overrides.json";

const OVERRIDES = rawOverrides as Record<string, { country?: string }>;
const prisma = new PrismaClient();
const KEY = process.env.API_FOOTBALL_KEY!;
const OUT = path.join(__dirname, "..", "data", "korea-abroad.json");
const MAP = path.join(__dirname, "..", "data", "ts-af-player-map.json");
// 자동 매칭이 못 푼 한글명을 사람이 확정해 두는 파일. { "af 영문명": "한글명" }
const MANUAL = path.join(__dirname, "..", "data", "korea-abroad-names.json");

// 대상 = 한국 선수가 뛰는(뛸 수 있는) 해외 리그. K리그는 해외파 정의상 제외.
// season: 유럽 시즌제 = 2025(25-26) / 캘린더제(MLS·J리그) = 2026
export const LEAGUES: Array<{ code: string; afId: number; season: number; label: string; country: string; calendarSeason?: string }> = [
  { code: "EPL", afId: 39, season: 2025, label: "프리미어리그", country: "잉글랜드" },
  { code: "CHAMPIONSHIP", afId: 40, season: 2025, label: "챔피언십", country: "잉글랜드" },
  { code: "LEAGUE_ONE", afId: 41, season: 2025, label: "리그 원", country: "잉글랜드" },
  { code: "LALIGA", afId: 140, season: 2025, label: "라리가", country: "스페인" },
  { code: "LALIGA_2", afId: 141, season: 2025, label: "라리가 2", country: "스페인" },
  { code: "SERIE_A", afId: 135, season: 2025, label: "세리에 A", country: "이탈리아" },
  { code: "SERIE_B", afId: 136, season: 2025, label: "세리에 B", country: "이탈리아" },
  { code: "BUNDESLIGA", afId: 78, season: 2025, label: "분데스리가", country: "독일" },
  { code: "BUNDESLIGA_2", afId: 79, season: 2025, label: "2. 분데스리가", country: "독일" },
  { code: "LIGUE_1", afId: 61, season: 2025, label: "리그 1", country: "프랑스" },
  { code: "LIGUE_2", afId: 62, season: 2025, label: "리그 2", country: "프랑스" },
  { code: "EREDIVISIE", afId: 88, season: 2025, label: "에레디비시", country: "네덜란드" },
  { code: "EREDIVISIE_2", afId: 89, season: 2025, label: "에이르스터 디비시", country: "네덜란드" },
  { code: "PRIMEIRA_LIGA", afId: 94, season: 2025, label: "프리메이라 리가", country: "포르투갈" },
  { code: "SUPER_LIG", afId: 203, season: 2025, label: "쉬페르리그", country: "튀르키예" },
  { code: "SPL", afId: 179, season: 2025, label: "스코티시 프리미어십", country: "스코틀랜드" },
  { code: "DENMARK_SL", afId: 119, season: 2025, label: "덴마크 수페르리가", country: "덴마크" },
  { code: "SERBIA_SL", afId: 286, season: 2025, label: "세르비아 수페르리가", country: "세르비아" },
  { code: "AUSTRIA_BL", afId: 218, season: 2025, label: "오스트리아 분데스리가", country: "오스트리아" },
  { code: "SWISS_SL", afId: 207, season: 2025, label: "스위스 슈퍼리그", country: "스위스" },
  { code: "JUPILER_PL", afId: 144, season: 2025, label: "주필러 프로리그", country: "벨기에" },
  { code: "MLS", afId: 253, season: 2026, label: "MLS", country: "미국", calendarSeason: "2026" },
  { code: "SAUDI_PL", afId: 307, season: 2025, label: "사우디 프로리그", country: "사우디아라비아" },
  // J리그는 제외(2026-07-28 사용자 결정 — "해외파"를 유럽·MLS 축으로 본다). 되살리려면 아래 한 줄 주석 해제.
  // { code: "J1_LEAGUE", afId: 98, season: 2026, label: "J1리그", country: "일본" },
];

// af 국적 표기 — /players 응답은 "Korea Republic" 을 쓴다(/countries 의 "South-Korea" 와 다름, 2026-07-28 실측).
//   표기가 바뀌어도 놓치지 않도록 변형을 모두 받는다.
const KOREA = new Set(["Korea Republic", "South Korea", "South-Korea", "Korea, Republic of"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// af 호출 — 일시적 네트워크 에러는 백오프 재시도. 800콜 중 1회 끊김에 전체가 죽으면 안 된다.
async function af(pathname: string, retry = 3): Promise<any> {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(`https://v3.football.api-sports.io${pathname}`, {
        headers: { "x-apisports-key": KEY },
      });
      const json = await res.json();
      await sleep(280);
      return json;
    } catch (e) {
      if (i >= retry) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

export interface KoreaAbroadPlayer {
  afId: number;
  tsId: string | null;
  nameKo: string;
  nameEn: string;
  fullName: string | null;
  age: number | null;
  birth: string | null;
  photo: string | null;
  height: string | null;
  injured: boolean;
  league: string;
  leagueLabel: string;
  country: string;
  pos: string | null;
  team: { afId: number; name: string; logo: string | null };
  stats: {
    apps: number;
    starts: number;
    minutes: number;
    goals: number;
    assists: number;
    rating: number | null;
    shots: number | null;
    sot: number | null;
    yellow: number;
    red: number;
    saves: number | null;
    conceded: number | null;
  };
  /** 선수 페이지(/transfers/[id]) 가 쓰는 SeasonStat 원형 — apply-korea-abroad-stats 가 병합한다. */
  seasonStat: SeasonStat;
}

/** data/player-season-stats.json 의 항목 형태. 레이더 7축·90분당·상세 스탯·백분위가 전부 이걸 먹는다. */
export interface SeasonStat {
  lg: string;
  season: string;
  team: string;
  pos: string | null;
  matches: number; starts: number; goals: number; assists: number; minutes: number;
  shots: number | null; sot: number | null; keyPasses: number | null; passAcc: number | null;
  tackles: number | null; interceptions: number | null; blocks: number | null;
  dribbles: number | null; dribbleAtt: number | null; dribbledPast: number | null;
  duelsWon: number | null; duelsTotal: number | null;
  foulsDrawn: number | null; foulsCommitted: number | null;
  penScored: number | null; penWon: number | null; penMissed: number | null;
  rating: number | null; yellow: number; red: number;
  saves: number | null; cleanSheets: number | null; conceded: number | null;
}

// af games.position → 기존 시즌스탯의 coarse 1글자 표기
const POS_CODE: Record<string, string> = { Goalkeeper: "G", Defender: "D", Midfielder: "M", Attacker: "A" };

function toks(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[\s\-.'·]+/)
    .map((t) => t.replace(/[^a-z]/g, ""))
    .filter((t) => t.length >= 1);
}

// 로마자 이름 → 순서를 지킨 토큰키 + 성을 뒤로 돌린 변형.
//   순서를 무시하면 홍현석(Hong Hyun-Seok)이 홍석현(Hong Seok-hyun)에 붙는다(2026-07-28 실측 오매칭).
//   그래서 정렬키는 쓰지 않고, "성 먼저"/"성 나중" 두 배열만 허용한다.
function orderedKeys(name: string): string[] {
  const t = toks(name);
  if (t.length < 2) return t.length ? [t.join("")] : [];
  const surnameFirst = t.join("");
  const surnameLast = [...t.slice(1), t[0]].join("");
  return [...new Set([surnameFirst, surnameLast])];
}

// 로마자 성 → 한글 성. 매칭 결과 검증 전용 — 여기 없는 성은 검증을 건너뛴다(오탈락 방지).
const SURNAME_KO: Record<string, string> = {
  kim: "김", lee: "이", yi: "이", park: "박", pak: "박", choi: "최", choe: "최", jung: "정", jeong: "정",
  chung: "정", kang: "강", cho: "조", jo: "조", yoon: "윤", yun: "윤", jang: "장", chang: "장", lim: "임",
  im: "임", han: "한", oh: "오", seo: "서", suh: "서", shin: "신", sin: "신", kwon: "권", gwon: "권",
  hwang: "황", ahn: "안", an: "안", song: "송", ryu: "류", yoo: "유", yu: "유", hong: "홍", jeon: "전",
  jun: "전", ko: "고", go: "고", moon: "문", mun: "문", son: "손", baek: "백", paik: "백", heo: "허",
  nam: "남", noh: "노", no: "노", ha: "하", kwak: "곽", sung: "성", seong: "성", cha: "차", joo: "주",
  ju: "주", woo: "우", koo: "구", gu: "구", min: "민", bae: "배", eom: "엄", um: "엄", yang: "양",
  na: "나", ma: "마", chu: "추", pyo: "표",
};

// 매칭된 한글명이 로마자 성과 맞는지 검사. ts 사전에 "기희 김"(김기희)·"강희 이"(이강희) 같은
//   어순 깨진 값이 실제로 들어 있어(2026-07-28 실측) 이 검사 없이는 그대로 노출된다.
function surnameOk(nameKo: string, nameEn: string): boolean {
  const t = toks(nameEn);
  if (t.length < 2) return true;
  const ko = SURNAME_KO[t[0]] ?? SURNAME_KO[t[t.length - 1]];
  if (!ko) return true; // 사전에 없는 성 — 검증 불가, 통과
  return nameKo.startsWith(ko);
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// 한글명 확정 — ① 수동 사전 ② af↔ts id ③ 어순 지킨 로마자 매칭 ④ 코드 사전.
//   ②~④ 는 성(姓) 검증을 통과해야 채택하고, 전부 실패하면 영문을 그대로 둔다(짐작 금지).
//   반환값 = 미확정 인원 수.
async function resolveKoreanNames(items: Array<{ nameEn: string; tsId: string | null; nameKo: string }>): Promise<number> {
  const korTsIds = Object.keys(OVERRIDES).filter((id) => OVERRIDES[id].country === "대한민국");
  const korTsp = await prisma.theSportsPlayer.findMany({
    where: { id: { in: korTsIds }, nameKo: { not: null } },
    select: { id: true, name: true, nameKo: true },
  });
  const koById = new Map(korTsp.map((t) => [t.id, t.nameKo!]));
  const byToken = new Map<string, string>();
  for (const t of korTsp) {
    for (const k of orderedKeys(t.name)) if (!byToken.has(k)) byToken.set(k, t.nameKo!);
  }

  const manual: Record<string, string> = fs.existsSync(MANUAL) ? JSON.parse(fs.readFileSync(MANUAL, "utf8")) : {};
  delete manual._note; // 파일 상단 설명 키 — 선수명이 아니다
  const unresolved: string[] = [];
  for (const f of items) {
    const fixed = manual[f.nameEn];
    if (fixed) {
      f.nameKo = fixed;
      continue;
    }
    const cands = [
      f.tsId ? koById.get(f.tsId) : null,
      ...orderedKeys(f.nameEn).map((k) => byToken.get(k) ?? null),
      toKoreanPlayerName(f.nameEn),
    ];
    const ok = cands.find((c) => c && /[가-힣]/.test(c) && surnameOk(c, f.nameEn));
    if (ok) f.nameKo = ok;
    else {
      f.nameKo = f.nameEn;
      unresolved.push(f.nameEn);
    }
  }
  const miss = new Set(unresolved);
  if (miss.size) {
    console.log(`\n한글명 미확정 ${miss.size}명 — data/${path.basename(MANUAL)} 에 채우면 --names-only 로 반영된다.`);
    for (const n of miss) console.log(`  "${n}": "",`);
  }
  return miss.size;
}

async function main() {
  const only = process.argv.find((a) => a.startsWith("--league="))?.split("=")[1];
  const namesOnly = process.argv.includes("--names-only");
  const targets = only ? LEAGUES.filter((l) => l.code === only) : LEAGUES;
  if (targets.length === 0) throw new Error(`--league=${only} 은 대상 리그에 없다`);

  // 한글명만 다시 푼다 — af 재호출 없음. 수동 사전을 채운 뒤 반영할 때 쓴다.
  if (namesOnly) {
    const cur = JSON.parse(fs.readFileSync(OUT, "utf8"));
    await resolveKoreanNames(cur.players);
    fs.writeFileSync(OUT, JSON.stringify(cur, null, 2));
    console.log(`\n한글명 갱신 저장 — ${cur.players.length}명`);
    return;
  }

  // af id → ts id (한글명 매칭용)
  const rawMap = JSON.parse(fs.readFileSync(MAP, "utf8")) as { afToTs?: Record<string, string> };
  const afToTs = rawMap.afToTs ?? {};

  const found: KoreaAbroadPlayer[] = [];
  let calls = 0;

  for (const lg of targets) {
    let page = 1;
    let total = 1;
    let hits = 0;
    while (page <= total) {
      const res = await af(`/players?league=${lg.afId}&season=${lg.season}&page=${page}`);
      calls++;
      total = res?.paging?.total ?? 1;
      const rows: any[] = res?.response ?? [];
      if (rows.length === 0 && page === 1) break;
      for (const row of rows) {
        const p = row.player;
        if (!p?.nationality || !KOREA.has(p.nationality)) continue;
        // 해당 리그 통계행만 (컵대회·대표팀 행 제외)
        const st = (row.statistics ?? []).find((s: any) => s?.league?.id === lg.afId) ?? row.statistics?.[0];
        if (!st) continue;
        const tsId = afToTs[String(p.id)] ?? null;
        found.push({
          afId: p.id,
          tsId,
          nameKo: "", // 아래에서 채움
          nameEn: p.name,
          fullName: [p.firstname, p.lastname].filter(Boolean).join(" ") || null,
          age: numOrNull(p.age),
          birth: p.birth?.date ?? null,
          photo: p.photo ?? null,
          height: p.height ?? null,
          injured: Boolean(p.injured),
          league: lg.code,
          leagueLabel: lg.label,
          country: lg.country,
          pos: st.games?.position ?? null,
          team: { afId: st.team?.id, name: st.team?.name, logo: st.team?.logo ?? null },
          stats: {
            apps: num(st.games?.appearences),
            starts: num(st.games?.lineups),
            minutes: num(st.games?.minutes),
            goals: num(st.goals?.total),
            assists: num(st.goals?.assists),
            rating: st.games?.rating ? Number(Number(st.games.rating).toFixed(2)) : null,
            shots: numOrNull(st.shots?.total),
            sot: numOrNull(st.shots?.on),
            yellow: num(st.cards?.yellow),
            red: num(st.cards?.red),
            saves: numOrNull(st.goals?.saves),
            conceded: numOrNull(st.goals?.conceded),
          },
          seasonStat: {
            lg: lg.code,
            season: lg.calendarSeason ?? "2025-26",
            team: st.team?.name ?? "",
            pos: POS_CODE[st.games?.position ?? ""] ?? null,
            matches: num(st.games?.appearences),
            starts: num(st.games?.lineups),
            goals: num(st.goals?.total),
            assists: num(st.goals?.assists),
            minutes: num(st.games?.minutes),
            shots: numOrNull(st.shots?.total),
            sot: numOrNull(st.shots?.on),
            keyPasses: numOrNull(st.passes?.key),
            passAcc: numOrNull(st.passes?.accuracy),
            tackles: numOrNull(st.tackles?.total),
            interceptions: numOrNull(st.tackles?.interceptions),
            blocks: numOrNull(st.tackles?.blocks),
            dribbles: numOrNull(st.dribbles?.success),
            dribbleAtt: numOrNull(st.dribbles?.attempts),
            dribbledPast: numOrNull(st.dribbles?.past),
            duelsWon: numOrNull(st.duels?.won),
            duelsTotal: numOrNull(st.duels?.total),
            foulsDrawn: numOrNull(st.fouls?.drawn),
            foulsCommitted: numOrNull(st.fouls?.committed),
            penScored: numOrNull(st.penalty?.scored),
            penWon: numOrNull(st.penalty?.won),
            penMissed: numOrNull(st.penalty?.missed),
            rating: st.games?.rating ? Number(Number(st.games.rating).toFixed(2)) : null,
            yellow: num(st.cards?.yellow),
            red: num(st.cards?.red),
            saves: numOrNull(st.goals?.saves),
            cleanSheets: null,
            conceded: numOrNull(st.goals?.conceded),
          },
        });
        hits++;
      }
      page++;
    }
    console.log(`${lg.code.padEnd(16)} ${String(total).padStart(3)}페이지  한국인 ${hits}명`);
  }

  const dictMiss = await resolveKoreanNames(found);

  // 선수 단위로 합산 — 시즌 중 임대·이적하면 리그별로 행이 나뉜다(예: 양민혁 EPL + 챔피언십).
  //   main = 출전 시간이 가장 많은 소속, totals = 전 리그 합산(평점은 출전 시간 가중).
  const byPlayer = new Map<number, KoreaAbroadPlayer[]>();
  for (const f of found) {
    const arr = byPlayer.get(f.afId) ?? [];
    arr.push(f);
    byPlayer.set(f.afId, arr);
  }
  const players = [...byPlayer.values()].map((spells) => {
    spells.sort((a, b) => b.stats.minutes - a.stats.minutes);
    const m = spells[0];
    const sum = (pick: (s: KoreaAbroadPlayer) => number) => spells.reduce((a, s) => a + pick(s), 0);
    const rated = spells.filter((s) => s.stats.rating != null && s.stats.minutes > 0);
    const ratingMin = rated.reduce((a, s) => a + s.stats.minutes, 0);
    return {
      afId: m.afId,
      tsId: m.tsId,
      nameKo: m.nameKo,
      nameEn: m.nameEn,
      age: m.age,
      birth: m.birth,
      photo: m.photo,
      height: m.height,
      injured: m.injured,
      pos: m.pos,
      league: m.league,
      leagueLabel: m.leagueLabel,
      country: m.country,
      team: m.team,
      seasonStat: m.seasonStat,
      totals: {
        apps: sum((s) => s.stats.apps),
        starts: sum((s) => s.stats.starts),
        minutes: sum((s) => s.stats.minutes),
        goals: sum((s) => s.stats.goals),
        assists: sum((s) => s.stats.assists),
        rating: ratingMin
          ? Number((rated.reduce((a, s) => a + s.stats.rating! * s.stats.minutes, 0) / ratingMin).toFixed(2))
          : null,
        yellow: sum((s) => s.stats.yellow),
        red: sum((s) => s.stats.red),
        saves: sum((s) => s.stats.saves ?? 0) || null,
        conceded: sum((s) => s.stats.conceded ?? 0) || null,
      },
      // 리그가 둘 이상일 때만 남긴다 — 단일 소속은 team/league 로 충분
      spells: spells.length > 1 ? spells.map((s) => ({ league: s.league, leagueLabel: s.leagueLabel, country: s.country, team: s.team, stats: s.stats })) : null,
    };
  });
  players.sort((a, b) => b.totals.minutes - a.totals.minutes);

  const out = {
    updatedAt: new Date().toISOString(),
    season: "2025-26",
    players,
  };
  // 단일 리그 테스트 실행은 기존 파일을 덮지 않는다
  if (only) {
    console.log(`\n--league=${only} 테스트 — 파일 미저장. ${players.length}명`);
    for (const p of players) console.log(`  ${p.nameKo} (${p.nameEn}) ${p.team.name} ${p.totals.apps}경기 ${p.totals.goals}골 ${p.totals.assists}도움 ${p.totals.minutes}분`);
  } else {
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log(`\n저장 ${OUT} — ${players.length}명(리그행 ${found.length}), af 호출 ${calls}회, 한글명 미해결 ${dictMiss}명`);
  }
}

// 다른 스크립트가 LEAGUES 만 import 할 수 있게 직접 실행일 때만 돈다
//  (가드 없으면 import 만으로 af 800여 콜이 도는 사고가 난다)
if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
