// 농구 블라인드 드래프트 선수-시즌 풀 빌드 — ESPN(NBA 1994~)·KBL 공식(1997~) → data/draft-pool-{nba,kbl}.json
//   기여도(공격/수비)는 박스스코어 선형 합을 시즌 내 표준화한 값. 원본 응답은 OS 임시 폴더에 캐시한다.
//   실행: npx tsx scripts/build-draft-pool.ts [nba|kbl]   (인자 없으면 둘 다)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { toKoreanPlayerName } from "../src/lib/player-names";
import { simulateBaseline } from "../src/lib/draft/baseline";
import type { DraftMode, PoolCard, PoolFile, PoolTeam, Pos } from "../src/lib/draft/types";

const CACHE = join(tmpdir(), "draft-pool-cache");
mkdirSync(CACHE, { recursive: true });
// 공용 사전에 없는 옛 선수 이름 — scripts/build-draft-names.ts 산출물
const DRAFT_NAMES: Record<string, string> = existsSync(resolve("data/draft-names-nba.json"))
  ? JSON.parse(readFileSync(resolve("data/draft-names-nba.json"), "utf8"))
  : {};
const koName = (en: string) => {
  const ko = toKoreanPlayerName(en);
  return /[가-힣]/.test(ko) ? ko : (DRAFT_NAMES[en] ?? en);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cachedJson<T>(key: string, url: string, headers?: Record<string, string>): Promise<T> {
  const file = join(CACHE, `${key}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as T;
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      const d = (await r.json()) as T;
      writeFileSync(file, JSON.stringify(d));
      await sleep(300);
      return d;
    } catch (e) {
      lastErr = e;
      await sleep(1500);
    }
  }
  throw lastErr;
}

/** 시즌 원시 행 — 전부 경기당 평균 */
interface RawRow {
  pid: string;
  name: string;
  season: number;
  team: string;
  teamName: string;
  pos: Pos[];
  gp: number;
  mpg: number;
  pts: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  photo: string | null;
}

const MIN_GP_SHARE = 0.4; // 시즌 최다 출전의 40% (스탯 마스터 표 규정과 동일)
const MIN_MPG = 15;
const OFF_SCALE = 2.2;
const DEF_SCALE = 1.3;
const round1 = (v: number) => Math.round(v * 10) / 10;

function toCards(rows: RawRow[]): PoolCard[] {
  const bySeason = new Map<number, RawRow[]>();
  for (const r of rows) bySeason.set(r.season, [...(bySeason.get(r.season) ?? []), r]);
  const out: PoolCard[] = [];
  for (const [, list] of bySeason) {
    const maxGp = Math.max(...list.map((r) => r.gp));
    const q = list.filter((r) => r.gp >= maxGp * MIN_GP_SHARE && r.mpg >= MIN_MPG);
    if (q.length < 30) continue;
    const off = q.map((r) => r.pts + 0.4 * r.fgm - 0.7 * r.fga - 0.4 * (r.fta - r.ftm) + 0.7 * r.ast - r.tov + 0.7 * r.orb);
    const def = q.map((r) => r.stl + 0.7 * r.blk + 0.3 * r.drb - 0.4 * r.pf);
    const z = (xs: number[]) => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1;
      return xs.map((x) => (x - m) / sd);
    };
    const zo = z(off);
    const zd = z(def);
    const mins = q.map((r) => r.gp * r.mpg);
    q.forEach((r, i) => {
      const below = mins.filter((m) => m < mins[i]).length;
      out.push({
        id: `${r.pid}-${r.season}`,
        pid: r.pid,
        name: r.name,
        season: r.season,
        team: r.team,
        teamName: r.teamName,
        pos: r.pos,
        off: round1(zo[i] * OFF_SCALE),
        def: round1(zd[i] * DEF_SCALE),
        dur: Math.round((below / (q.length - 1)) * 100) / 100,
        gp: r.gp,
        mpg: round1(r.mpg),
        pts: round1(r.pts),
        reb: round1(r.orb + r.drb),
        ast: round1(r.ast),
        stl: round1(r.stl),
        blk: round1(r.blk),
        photo: r.photo,
      });
    });
  }
  return out;
}

// ── NBA ──────────────────────────────────────────────────────────────
// [계보 키, 현재 이름, 그 계보에 속하는 ESPN 약어들, 팀 색]
const NBA_TEAMS: Array<[string, string, string[], string]> = [
  ["ATL", "애틀랜타 호크스", ["ATL"], "#E03A3E"],
  ["BOS", "보스턴 셀틱스", ["BOS"], "#007A33"],
  ["BKN", "브루클린 네츠", ["BKN", "NJ"], "#444444"],
  ["CHA", "샬럿 호네츠", ["CHA"], "#1D1160"],
  ["CHI", "시카고 불스", ["CHI"], "#CE1141"],
  ["CLE", "클리블랜드 캐벌리어스", ["CLE"], "#860038"],
  ["DAL", "댈러스 매버릭스", ["DAL"], "#00538C"],
  ["DEN", "덴버 너기츠", ["DEN"], "#0E2240"],
  ["DET", "디트로이트 피스톤스", ["DET"], "#C8102E"],
  ["GS", "골든스테이트 워리어스", ["GS"], "#1D428A"],
  ["HOU", "휴스턴 로키츠", ["HOU"], "#CE1141"],
  ["IND", "인디애나 페이서스", ["IND"], "#002D62"],
  ["LAC", "LA 클리퍼스", ["LAC"], "#C8102E"],
  ["LAL", "LA 레이커스", ["LAL"], "#552583"],
  ["MEM", "멤피스 그리즐리스", ["MEM", "VAN"], "#5D76A9"],
  ["MIA", "마이애미 히트", ["MIA"], "#98002E"],
  ["MIL", "밀워키 벅스", ["MIL"], "#00471B"],
  ["MIN", "미네소타 팀버울브스", ["MIN"], "#0C2340"],
  ["NO", "뉴올리언스 펠리컨스", ["NO", "NOK"], "#0C2340"],
  ["NY", "뉴욕 닉스", ["NY"], "#F58426"],
  ["OKC", "오클라호마시티 선더", ["OKC", "SEA"], "#007AC1"],
  ["ORL", "올랜도 매직", ["ORL"], "#0077C0"],
  ["PHI", "필라델피아 세븐티식서스", ["PHI"], "#006BB6"],
  ["PHX", "피닉스 선즈", ["PHX"], "#1D1160"],
  ["POR", "포틀랜드 트레일블레이저스", ["POR"], "#E03A3E"],
  ["SA", "샌안토니오 스퍼스", ["SA"], "#8A8D8F"],
  ["SAC", "새크라멘토 킹스", ["SAC"], "#5A2D81"],
  ["TOR", "토론토 랩터스", ["TOR"], "#CE1141"],
  ["UTAH", "유타 재즈", ["UTAH"], "#002B5C"],
  ["WSH", "워싱턴 위저즈", ["WSH"], "#002B5C"],
];
const NBA_OLD_NAMES: Record<string, string> = {
  NJ: "뉴저지 네츠",
  VAN: "밴쿠버 그리즐리스",
  SEA: "시애틀 슈퍼소닉스",
  NOK: "뉴올리언스 호네츠",
};
const ESPN_POS: Record<string, Pos[]> = {
  PG: ["G"], SG: ["G"], G: ["G"], SF: ["F"], PF: ["F"], F: ["F"], C: ["C"], GF: ["G", "F"], FC: ["F", "C"],
};

interface EspnResp {
  categories?: Array<{ name?: string; names?: string[] }>;
  athletes?: Array<{
    athlete?: {
      id?: string | number;
      displayName?: string;
      teamShortName?: string;
      position?: { abbreviation?: string };
      headshot?: { href?: string };
    };
    categories?: Array<{ name?: string; values?: number[] }>;
  }>;
}

async function buildNba(): Promise<{ teams: PoolTeam[]; rows: RawRow[]; seasons: [number, number] }> {
  const abbrToKey = new Map<string, string>();
  const keyToName = new Map<string, string>();
  for (const [key, name, abbrs] of NBA_TEAMS) {
    keyToName.set(key, name);
    for (const a of abbrs) abbrToKey.set(a, key);
  }
  const first = 1994;
  const last = new Date().getFullYear() + 1; // 아직 없는 시즌은 0명으로 와서 자연히 빠진다
  const rows: RawRow[] = [];
  const unknownAbbr = new Set<string>();
  let lastWithData = first;
  for (let s = first; s <= last; s++) {
    const d = await cachedJson<EspnResp>(
      `nba-${s}`,
      `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&limit=800&season=${s}&seasontype=2`,
    );
    const nameMap = new Map<string, string[]>();
    for (const c of d.categories ?? []) if (c.name) nameMap.set(c.name, c.names ?? []);
    let n = 0;
    for (const a of d.athletes ?? []) {
      const at = a.athlete;
      if (!at?.id || !at.displayName) continue;
      const st: Record<string, number> = {};
      for (const c of a.categories ?? []) {
        const names = c.name ? nameMap.get(c.name) : undefined;
        if (!names) continue;
        (c.values ?? []).forEach((v, i) => {
          if (names[i] != null && typeof v === "number") st[names[i]] = v;
        });
      }
      const abbr = at.teamShortName ?? "";
      const key = abbrToKey.get(abbr);
      if (!key) {
        if (abbr) unknownAbbr.add(abbr);
        continue;
      }
      const reb = st.avgRebounds ?? 0;
      rows.push({
        pid: String(at.id),
        name: koName(at.displayName),
        season: s,
        team: key,
        teamName: NBA_OLD_NAMES[abbr] ?? keyToName.get(key)!,
        pos: ESPN_POS[at.position?.abbreviation ?? ""] ?? ["F"],
        gp: st.gamesPlayed ?? 0,
        mpg: st.avgMinutes ?? 0,
        pts: st.avgPoints ?? 0,
        fgm: st.avgFieldGoalsMade ?? 0,
        fga: st.avgFieldGoalsAttempted ?? 0,
        ftm: st.avgFreeThrowsMade ?? 0,
        fta: st.avgFreeThrowsAttempted ?? 0,
        // ESPN 은 공격/수비 리바운드를 나눠 주지 않는다 — 리그 통상 비율(공격 25%)로 가른다
        orb: reb * 0.25,
        drb: reb * 0.75,
        ast: st.avgAssists ?? 0,
        stl: st.avgSteals ?? 0,
        blk: st.avgBlocks ?? 0,
        tov: st.avgTurnovers ?? 0,
        pf: st.avgFouls ?? 0,
        photo: at.headshot?.href ?? null,
      });
      n++;
    }
    if (n >= 300) lastWithData = s;
    console.log(`NBA ${s}: ${n}명`);
  }
  if (unknownAbbr.size) console.warn("계보 미등록 ESPN 약어:", [...unknownAbbr].join(", "));
  const teams: PoolTeam[] = NBA_TEAMS.map(([key, name, , color]) => ({
    key,
    name,
    logo: `https://a.espncdn.com/i/teamlogos/nba/500/${key.toLowerCase()}.png`,
    color,
  }));
  return { teams, rows, seasons: [first, lastWithData] };
}

// ── KBL ──────────────────────────────────────────────────────────────
const KBL_H = { Origin: "https://kbl.or.kr", Referer: "https://kbl.or.kr/" };
const KBL_SITE_H = { ...KBL_H, Channel: "WEB", TeamCode: "XX", "X-Requested-With": "XMLHttpRequest", lang: "ko" };
// [계보 키(현재 팀 코드), 현재 이름, 계보에 속하는 역대 팀 코드, 팀 색] — 2026-09-27 시즌 1~47 실측
const KBL_TEAMS: Array<[string, string, string[], string]> = [
  ["55", "서울 SK", ["55"], "#DB0028"],
  ["16", "원주 DB", ["15", "16"], "#0B6E3F"],
  ["10", "울산 현대모비스", ["10"], "#C8102E"],
  ["35", "서울 삼성", ["35"], "#0E4C92"],
  ["66", "고양 소노", ["30", "73", "66"], "#00A3E0"],
  ["50", "창원 LG", ["50"], "#A50034"],
  ["70", "안양 정관장", ["40", "70"], "#C8102E"],
  ["60", "부산 KCC", ["45", "60"], "#002B5C"],
  ["06", "수원 KT", ["20", "05", "06"], "#1A1A1A"],
  ["64", "대구 한국가스공사", ["25", "37", "65", "64"], "#0054A6"],
];
const KBL_POS: Record<string, Pos[]> = { GD: ["G"], G: ["G"], FD: ["F"], F: ["F"], C: ["C"] };

interface KblRow {
  playerNo: string; kname: string; teamCode: string; teamName1: string; gameCount: number; playSec: number;
  score: number; fdg: number; fdgA: number; ft: number; ftA: number; oR: number; dR: number;
  aS: number; sT: number; bS: number; tO: number; foulTot: number;
}

async function buildKbl(): Promise<{ teams: PoolTeam[]; rows: RawRow[]; seasons: [number, number] }> {
  const codeToKey = new Map<string, string>();
  for (const [key, , codes] of KBL_TEAMS) for (const c of codes) codeToKey.set(c, key);
  const seasonList = await cachedJson<Array<{ seasonCode: number; seasonName: string }>>(
    "kbl-seasons",
    "https://api.kbl.or.kr/season/list?seasonCategory=R&gameCode=01&seasonGrade=1",
    KBL_SITE_H,
  );
  const raw: Array<{ r: KblRow; season: number }> = [];
  const years: number[] = [];
  for (const s of [...seasonList].sort((a, b) => a.seasonCode - b.seasonCode)) {
    // "1997" → 1997, "1997-1998" → 1998
    const year = Number(s.seasonName.split("-").pop());
    let count = 0;
    for (let page = 1; page <= 4; page++) {
      const d = await cachedJson<{ data?: KblRow[] }>(
        `kbl-${s.seasonCode}-${page}`,
        `https://api-stats.kbl.or.kr/api/records/player/general/traditional?seasonCode=${s.seasonCode}&gameCode=01&sortDataSc=SCORE&sortOrderSc=desc&listCn=120&pageNo=${page}&ruleCk=0&perCn=1&lastCn=0&partIfList=0&draftNo=0`,
        KBL_H,
      );
      const list = (d.data ?? []).filter((x) => x.kname);
      for (const r of list) raw.push({ r, season: year });
      count += list.length;
      if (list.length < 120) break;
    }
    if (count) years.push(year);
    console.log(`KBL ${s.seasonName}: ${count}명`);
  }
  // 포지션은 시즌 표에 없다 — 규정을 채운 선수만 프로필 1콜
  const maxGp = new Map<number, number>();
  for (const { r, season } of raw) maxGp.set(season, Math.max(maxGp.get(season) ?? 0, r.gameCount));
  const need = new Set(
    raw
      .filter(({ r, season }) => r.gameCount >= (maxGp.get(season) ?? 0) * MIN_GP_SHARE && r.playSec / 60 >= MIN_MPG)
      .map(({ r }) => r.playerNo),
  );
  console.log(`KBL 프로필 조회 대상 ${need.size}명`);
  const posOf = new Map<string, Pos[]>();
  let done = 0;
  for (const no of need) {
    const d = await cachedJson<{ playerInfo?: Array<{ pos?: string }> }>(
      `kbl-profile-${no}`,
      `https://kbl-api.sports2i.com/api/v1/players/profile/0/${no}`,
      KBL_H,
    );
    const p = KBL_POS[(d.playerInfo?.[0]?.pos ?? "").trim()];
    if (p) posOf.set(no, p);
    if (++done % 100 === 0) console.log(`  프로필 ${done}/${need.size}`);
  }
  const rows: RawRow[] = [];
  const unknownCode = new Set<string>();
  let noPos = 0;
  for (const { r, season } of raw) {
    const key = codeToKey.get(r.teamCode);
    if (!key) {
      unknownCode.add(`${r.teamCode}(${r.teamName1})`);
      continue;
    }
    const pos = posOf.get(r.playerNo);
    if (!pos) {
      if (need.has(r.playerNo)) noPos++;
      continue;
    }
    rows.push({
      pid: r.playerNo,
      name: r.kname.trim(),
      season,
      team: key,
      teamName: r.teamName1,
      pos,
      gp: r.gameCount,
      mpg: r.playSec / 60,
      pts: r.score,
      fgm: r.fdg,
      fga: r.fdgA,
      ftm: r.ft,
      fta: r.ftA,
      orb: r.oR,
      drb: r.dR,
      ast: r.aS,
      stl: r.sT,
      blk: r.bS,
      tov: r.tO,
      pf: r.foulTot,
      photo: `https://kbl.or.kr/files/kbl/players-photo/${r.playerNo}.png`,
    });
  }
  if (unknownCode.size) console.warn("계보 미등록 KBL 팀 코드:", [...unknownCode].join(", "));
  if (noPos) console.warn(`포지션 없는 규정 충족 행 ${noPos}건 제외`);
  const teams: PoolTeam[] = KBL_TEAMS.map(([key, name, , color]) => ({ key, name, logo: null, color }));
  return { teams, rows, seasons: [Math.min(...years), Math.max(...years)] };
}

async function build(mode: DraftMode) {
  const { teams, rows, seasons } = mode === "nba" ? await buildNba() : await buildKbl();
  const cards = toCards(rows);
  const base = simulateBaseline({ teams, cards }, 10_000);
  const file: PoolFile = {
    meta: {
      mode,
      updatedAt: new Date().toISOString().slice(0, 10),
      seasons,
      cards: cards.length,
      lockdown: base.lockdown,
      quantiles: base.quantiles,
    },
    teams,
    cards,
  };
  const out = resolve(`data/draft-pool-${mode}.json`);
  writeFileSync(out, JSON.stringify(file));
  console.log(`\n${mode.toUpperCase()} → ${out}  카드 ${cards.length}장, 철벽 기준 ${base.lockdown}, 점수 중앙값 ${base.quantiles[50]}`);
  const top = (k: "off" | "def") => [...cards].sort((a, b) => b[k] - a[k]).slice(0, 8).map((c) => `${c.name} '${String(c.season).slice(2)} ${c[k]}`).join(" · ");
  console.log("공격 상위:", top("off"));
  console.log("수비 상위:", top("def"));
  for (const t of teams) {
    const n = cards.filter((c) => c.team === t.key);
    console.log(`  ${t.name}: 카드 ${n.length}, 선수 ${new Set(n.map((c) => c.pid)).size}`);
  }
}

async function main() {
  const arg = process.argv[2] as DraftMode | undefined;
  for (const m of arg ? [arg] : (["nba", "kbl"] as DraftMode[])) await build(m);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
