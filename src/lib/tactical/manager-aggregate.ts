// 감독 전술 연구 집계 — 백필 라인업(data/manager-lineups-*.json, af grid)·DB xG·스코어·샷맵을
// 팀/감독 축으로 묶는다. 시즌 결산(generate-manager-review)·월간 이달의 감독(generate-manager-month) 공용.
// 기간(from/to)만 바꾸면 월간 집계가 된다. 평균 포지션은 detail 끼워맞춤이 아니라 af grid 실데이터 평균.
import { readFileSync, existsSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import { afPlayerToTs } from "@/lib/players/ts-af-map";
import { parseXg } from "./data-gate";

// ============================================================
// 데이터 파일 로드
// ============================================================

export interface BackfilledPlayer { id: number; name: string; number: number; pos: string; grid: string | null }
export interface BackfilledSide { team: string; formation: string | null; coach: string | null; startXI: BackfilledPlayer[] }
export interface BackfilledLineup { matchId: number; afFixtureId: number; date: string; home: BackfilledSide; away: BackfilledSide }

interface ShotmapShot { pid: string; name: string; team: string; x: number; y: number; min: number; result: string; xg: number; sit: string; part: string }
interface ShotmapMatch { date: string; home: { id: string; name: string; score: number }; away: { id: string; name: string; score: number }; shots: ShotmapShot[] }

function dataPath(file: string): string {
  return path.join(process.cwd(), "data", file);
}

export function loadBackfilledLineups(league: string): BackfilledLineup[] {
  const p = dataPath(`manager-lineups-${league.toLowerCase()}-2526.json`);
  if (!existsSync(p)) throw new Error(`백필 라인업 없음: ${p} — scripts/backfill-af-lineups.ts 먼저 실행`);
  return JSON.parse(readFileSync(p, "utf8"));
}

function loadShotmaps(league: string): Record<string, ShotmapMatch> {
  const p = dataPath(`match-shotmaps-${league.toLowerCase().replace(/_/g, "-")}-2526.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
}

// ============================================================
// 팀명 정규화 — af·TheStatsAPI·우리 Team.name 3계 통일
// ============================================================
const TEAM_ALIAS: Record<string, string> = {
  wolves: "wolverhampton",
  wolverhamptonwanderers: "wolverhampton",
  newcastleunited: "newcastle",
  leedsunited: "leeds",
  westhamunited: "westham",
  tottenhamhotspur: "tottenham",
  brightonhovealbion: "brighton",
  afcbournemouth: "bournemouth",
  burnleyfc: "burnley",
  bayernmunich: "bayernmnchen", // af "Bayern Munich" vs 우리 "Bayern München"(ü 탈락) — 과거 시즌 아카이브 빌드
};
export function normTeam(s: string): string {
  const n = s.toLowerCase().replace(/[^a-z]/g, "");
  return TEAM_ALIAS[n] ?? n;
}

/** 감독 이름 해석 풀의 항목 — team-coaches.json(현직)·coach-photos.json(전체) 공통 형태. */
interface CoachRef { name: string; nameKo?: string | null; preferredFormation?: string | null; logo?: string | null }

function normName(s: string): string {
  // ß 는 NFD 로 분해되지 않아 그냥 두면 [^a-z] 로 날아간다 — af 가 같은 감독을 "Hoeneß"/"Hoeness"
  // 로 섞어 보내 스틴트가 갈리고 한글명 조회도 빗나갔다(2026-08-19 슈투트가르트 실측). ss 로 접는다.
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ß/g, "ss").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

// ============================================================
// af grid → 풀피치 좌표 (x 0~100 가로, y 0~100 자기 골문→상대 골문)
// row 1 = GK. 같은 row 안에서 col 은 1부터 — af 는 왼쪽부터 번호.
// ============================================================
function gridToXY(xi: BackfilledPlayer[]): Map<number, { x: number; y: number }> {
  const rows = new Map<number, BackfilledPlayer[]>();
  for (const p of xi) {
    if (!p.grid) continue;
    const r = Number(p.grid.split(":")[0]);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r)!.push(p);
  }
  const maxRow = Math.max(...rows.keys());
  const out = new Map<number, { x: number; y: number }>();
  for (const [r, players] of rows) {
    const size = players.length;
    for (const p of players) {
      const c = Number(p.grid!.split(":")[1]);
      const x = size === 1 ? 50 : ((c - 0.5) / size) * 100;
      const y = r === 1 ? 8 : 8 + ((r - 1) / (maxRow - 1)) * 80;
      out.set(p.id, { x: Math.round(x), y: Math.round(y) });
    }
  }
  return out;
}

// ============================================================
// 집계 결과 타입 (tacticalContext 로 직렬화되는 공용 계약)
// ============================================================
export interface TeamMatchRow {
  matchId: number;
  date: string; // YYYY-MM-DD
  opponent: string;
  opponentKo: string;
  homeAway: "H" | "A";
  formation: string | null;
  coach: string | null;
  gf: number;
  ga: number;
  result: "W" | "D" | "L";
  xgFor: number | null;
  xgAgainst: number | null;
}

export interface FormationUsage {
  formation: string;
  count: number;
  w: number; d: number; l: number;
  gf: number; ga: number;
  xgFor: number; xgAgainst: number; // 평균
}

export interface CoachStint {
  coach: string;
  coachKo: string;
  from: string; to: string;
  played: number; w: number; d: number; l: number;
  ppg: number;
}

export interface XiPlayer {
  afId: number;
  name: string;
  nameKo: string;
  tsPid: string | null;
  pos: string; // G | D | M | F
  x: number; y: number; // 시즌 평균 실좌표
  starts: number;
}

export interface ShotAgg {
  shots: number;
  goals: number;
  xg: number;
  insideBoxShare: number; // 0~1
  bySituation: Record<string, number>;
  topShooters: { name: string; nameKo: string; shots: number; goals: number; xg: number }[];
}

/** Article.tacticalContext 직렬화 계약 — 집계 + 렌더 전용 부가 필드(잡이 채움). */
export type TacticalManagerContext = ManagerSeasonAggregate & {
  /** /lineup?d= 전술판 빌더 프리로드 코드 (encodeBoard 산출) */
  lineupCode?: string;
  /** af 선수 id → 사진 URL (TheSportsPlayer.photoUrl) */
  photoByAf?: Record<number, string>;
  coachPhoto?: string | null;
};

export interface ManagerSeasonAggregate {
  league: string;
  seasonLabel: string;
  team: { id: number; name: string; nameKo: string; tsId: string | null };
  coach: { name: string; nameKo: string; preferredFormation: string | null; logo: string | null };
  record: { played: number; w: number; d: number; l: number; gf: number; ga: number; points: number; rank: number };
  coachStints: CoachStint[];
  formations: FormationUsage[];
  mostUsedXi: { formation: string; players: XiPlayer[] };
  topStarters: XiPlayer[]; // 선발 횟수 상위 14 (XI 밖 로테이션 포함)
  xiChanges: { avgPerMatch: number; everPresent: string[] };
  matches: TeamMatchRow[];
  monthly: { month: string; played: number; w: number; d: number; l: number; gf: number; ga: number; xgFor: number; xgAgainst: number }[];
  shotProfile: { for: ShotAgg; against: ShotAgg } | null;
  goalsFor: { x: number; y: number; min: number; name: string; nameKo: string; xg: number; sit: string }[]; // 샷맵 위젯용
}

// ============================================================
// 리그 테이블 (rank·대상 팀 선정 공용)
// ============================================================
export async function computeLeagueTable(
  league: string,
  from: Date,
  to: Date,
): Promise<{ teamId: number; points: number; gd: number; gf: number }[]> {
  const ms = await prisma.match.findMany({
    where: { league, status: "FINISHED", startTime: { gte: from, lte: to } },
    select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
  });
  const pts = new Map<number, { p: number; gd: number; gf: number }>();
  const add = (id: number, p: number, gf: number, ga: number) => {
    const cur = pts.get(id) ?? { p: 0, gd: 0, gf: 0 };
    pts.set(id, { p: cur.p + p, gd: cur.gd + gf - ga, gf: cur.gf + gf });
  };
  for (const m of ms) {
    if (m.homeScore == null || m.awayScore == null) continue;
    const hp = m.homeScore > m.awayScore ? 3 : m.homeScore === m.awayScore ? 1 : 0;
    add(m.homeTeamId, hp, m.homeScore, m.awayScore);
    add(m.awayTeamId, hp === 3 ? 0 : hp === 1 ? 1 : 3, m.awayScore, m.homeScore);
  }
  return [...pts.entries()]
    .sort((a, b) => b[1].p - a[1].p || b[1].gd - a[1].gd || b[1].gf - a[1].gf)
    .map(([teamId, v]) => ({ teamId, points: v.p, gd: v.gd, gf: v.gf }));
}

async function computeRank(league: string, from: Date, to: Date, teamId: number): Promise<number> {
  const table = await computeLeagueTable(league, from, to);
  return table.findIndex((r) => r.teamId === teamId) + 1;
}

// ============================================================
// 메인 집계
// ============================================================
export async function aggregateTeamSeason(opts: {
  league: string;
  teamId: number;
  from?: Date;
  to?: Date;
  seasonLabel?: string;
  /** 라인업 소스 주입 — 미지정 시 백필 파일(25/26 결산). 월간 잡은 af 런타임 수집분을 넘긴다. */
  lineups?: BackfilledLineup[];
  /** DB 매치가 없는 과거 시즌용 스코어 주입 (키 = lineups[].matchId, 홈/원정 원본 방향).
   *  DB 행이 있으면 DB 가 우선. 주입 스코어 경기는 xG 없음으로 집계된다. */
  scores?: Record<number, { home: number; away: number }>;
  /** DB 로 리그 테이블을 못 만드는 과거 시즌용 최종 순위 (af standings 실측값). */
  rankOverride?: number;
}): Promise<ManagerSeasonAggregate> {
  const { league, teamId } = opts;
  const from = opts.from ?? new Date("2025-08-01");
  const to = opts.to ?? new Date("2026-06-15");
  const seasonLabel = opts.seasonLabel ?? "2025-26";

  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { id: true, name: true, nameKo: true } });
  const teamNorm = normTeam(team.name);
  const teamKo = toKoreanTeamName(team.name, league) || team.nameKo || team.name;
  const tsMap = await prisma.teamSourceId.findFirst({ where: { league, teamId, source: "thesports" }, select: { externalId: true } });
  const tsId = tsMap?.externalId ?? null;

  // 1) 라인업(주입분 또는 백필 파일)에서 이 팀 경기 추출 + DB 스코어·xG 조인
  const lineups = (opts.lineups ?? loadBackfilledLineups(league)).filter((l) => {
    const d = new Date(l.date);
    return d >= from && d <= to && (normTeam(l.home.team) === teamNorm || normTeam(l.away.team) === teamNorm);
  });
  const dbRows = await prisma.match.findMany({
    where: { id: { in: lineups.map((l) => l.matchId) } },
    select: { id: true, homeScore: true, awayScore: true, fixtureStats: true },
  });
  const dbById = new Map(dbRows.map((r) => [r.id, r]));

  interface Enriched { row: TeamMatchRow; side: BackfilledSide; xy: Map<number, { x: number; y: number }> }
  const enriched: Enriched[] = [];
  for (const l of lineups.sort((a, b) => a.date.localeCompare(b.date))) {
    const isHome = normTeam(l.home.team) === teamNorm;
    const side = isHome ? l.home : l.away;
    const oppSide = isHome ? l.away : l.home;
    // 주입 스코어가 있으면 무조건 주입 우선 — 주입 모드의 matchId 는 af fixture id 라
    // DB Match id 와 우연히 겹칠 수 있다 (2017 세리에A 실측: id 충돌로 엉뚱한 매치
    // 점수가 조인돼 사리 나폴리가 19승 0무 19패로 집계). DB 조인은 백필 모드 전용.
    const inj = opts.scores?.[l.matchId];
    const db = inj ? undefined : dbById.get(l.matchId);
    const hasDb = !!db && db.homeScore != null && db.awayScore != null;
    if (!hasDb && !inj) continue;
    const hs = inj ? inj.home : db!.homeScore!;
    const as = inj ? inj.away : db!.awayScore!;
    const gf = isHome ? hs : as;
    const ga = isHome ? as : hs;
    const xg = hasDb ? parseXg(db!.fixtureStats) : { home: null, away: null };
    enriched.push({
      row: {
        matchId: l.matchId,
        date: l.date.slice(0, 10),
        opponent: oppSide.team,
        opponentKo: toKoreanTeamName(oppSide.team, league) || oppSide.team,
        homeAway: isHome ? "H" : "A",
        formation: side.formation,
        coach: side.coach,
        gf, ga,
        result: gf > ga ? "W" : gf === ga ? "D" : "L",
        xgFor: isHome ? xg.home : xg.away,
        xgAgainst: isHome ? xg.away : xg.home,
      },
      side,
      xy: gridToXY(side.startXI),
    });
  }
  if (!enriched.length) throw new Error(`집계 대상 경기 0 (${team.name}, ${from.toISOString().slice(0, 10)}~)`);

  // 2) 전적·순위
  const rec = { played: enriched.length, w: 0, d: 0, l: 0, gf: 0, ga: 0, points: 0, rank: 0 };
  for (const { row } of enriched) {
    rec.gf += row.gf; rec.ga += row.ga;
    if (row.result === "W") { rec.w++; rec.points += 3; }
    else if (row.result === "D") { rec.d++; rec.points += 1; }
    else rec.l++;
  }
  rec.rank = opts.rankOverride ?? (await computeRank(league, from, to, teamId));

  // 3) 감독 재임 구간 (연속 그룹핑 — 중도 경질 감지)
  const coaches: Record<string, CoachRef> = existsSync(dataPath("team-coaches.json"))
    ? JSON.parse(readFileSync(dataPath("team-coaches.json"), "utf8"))
    : {};
  // 지난 시즌 감독은 현직 스냅샷(team-coaches)에 없다 — 25/26 라이프치히 올레 베르너 실측.
  // 감독 사진 레지스트리가 한글 표기를 함께 들고 있어 해석 풀로 합친다(현직 우선).
  const coachPhotos: Record<string, CoachRef> = existsSync(dataPath("coach-photos.json"))
    ? JSON.parse(readFileSync(dataPath("coach-photos.json"), "utf8"))
    : {};
  const coachPool: CoachRef[] = [...Object.values(coaches), ...Object.values(coachPhotos)];
  const coachKo = (name: string | null): string => {
    if (!name) return "감독 미상";
    const n = normName(name);
    let hit = coachPool.find((c) => normName(c.name) === n);
    if (!hit) {
      // 성 유일 일치 폴백 (af 표기 차이 흡수). 두 가지 방어가 반드시 같이 가야 한다 —
      // 2026-08-16 오보: "Diego Pablo Simeone González"(시메오네 풀네임)의 **마지막 토큰이
      // 모성(González)** 이라 에스파뇰의 "Manolo González" 를 유일 후보로 잡아, 아틀레티코
      // 시즌 결산 글이 통째로 "마놀로 곤살레스"로 발행됐다.
      //   ① 스페인식 복성 — 마지막 토큰뿐 아니라 끝에서 두 번째(부성)도 성 후보로 본다.
      //   ② 이름 대조 — 후보의 이름(첫 토큰)이 입력에 없으면 동명이 아니므로 버린다.
      //      확신이 없으면 한글을 짓지 않고 원문을 남기는 게 이 코드베이스의 원칙이다.
      const tokens = n.split(" ").filter(Boolean);
      const surnameCands = [tokens[tokens.length - 1], tokens[tokens.length - 2]].filter(Boolean);
      for (const sur of surnameCands) {
        const byLast = coachPool.filter((c) => {
          const ct = normName(c.name).split(" ").filter(Boolean);
          if (ct[ct.length - 1] !== sur) return false;
          const first = ct[0];
          if (!first) return true;
          // 이름은 정확 일치까지 요구하면 애칭·축약이 죄다 탈락한다(Xabi↔Xabier, Hansi↔Hans).
          // 3자 이상 접두 호환이면 같은 사람으로 본다 — Manolo↔Diego 같은 남은 무관 조합은 걸러진다.
          return tokens.some(
            (t) => t.length >= 3 && first.length >= 3 && (t.startsWith(first) || first.startsWith(t)),
          );
        });
        if (byLast.length === 1) {
          hit = byLast[0];
          break;
        }
      }
    }
    if (hit?.nameKo) return hit.nameKo;
    const t = toKoreanPlayerName(name);
    return /[가-힣]/.test(t) ? t : name;
  };
  // 동일 인물 판정 — af 가 같은 감독을 "F. Lampard"/"Frank James Lampard Junior" 처럼 경기마다
  // 다르게 표기해 스틴트가 갈라진다(2026-08-15 코번트리 실측: 램파드 1명이 3개 스틴트 → "감독 교체"
  // 오탐 → 프롬프트가 교체 전후 비교를 요구하는 연쇄). 접미사(jr 등) 제거 후 토큰 포함관계로 병합.
  const personTokens = (s: string) =>
    s.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/)
      .filter((t) => t.length > 1 && !["jr", "junior", "sr", "senior"].includes(t));
  const samePerson = (a: string, b: string) => {
    const ta = personTokens(a), tb = personTokens(b);
    if (!ta.length || !tb.length) return a === b;
    const [sub, sup] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    if (sub.every((t) => sup.includes(t))) return true;
    // 애칭+복성 조합 — "Xabi Alonso" vs "Xabier Alonso Olano"(레알 실측)는 포함관계가 안 된다.
    // 이름(첫 토큰)이 3자 이상 접두로 같고, 성 후보(둘 다에서 첫 토큰이 아닌 공유 토큰)가 있으면 동일인.
    // 성 후보를 "둘 다 비-첫 토큰"으로 제한해 "Frank Lampard"/"Frank Sinclair" 같은 이름만 겹침을 배제.
    const firstA = ta[0], firstB = tb[0];
    const prefixOk = firstA.slice(0, 3) === firstB.slice(0, 3);
    const sharedSurname = ta.slice(1).some((t) => t.length >= 4 && tb.slice(1).includes(t));
    return prefixOk && sharedSurname;
  };
  const stints: CoachStint[] = [];
  for (const { row } of enriched) {
    const name = row.coach ?? "?";
    const last = stints[stints.length - 1];
    // 토큰 포함으로 못 잡는 별칭 변형("Hansi Flick"/"Hans-Dieter Flick", 바르사 실측)은
    // 해석된 한글명이 같으면 동일 인물로 본다 — 같은 팀 연속 재임에서 동명이인 확률은 무시 가능.
    if (!last || !(samePerson(last.coach, name) || coachKo(row.coach) === last.coachKo)) {
      stints.push({ coach: name, coachKo: coachKo(row.coach), from: row.date, to: row.date, played: 0, w: 0, d: 0, l: 0, ppg: 0 });
    }
    const s = stints[stints.length - 1];
    // 첫 등장 표기가 한글 미해석("Xabier Alonso Olano")이어도 뒤에 해석되는 표기("Xabi Alonso"→사비
    // 알론소)가 오면 표시명을 승격 — 스틴트 표에 원어가 남지 않게.
    const ko = coachKo(row.coach);
    if (!/[가-힣]/.test(s.coachKo) && /[가-힣]/.test(ko)) { s.coachKo = ko; s.coach = row.coach ?? s.coach; }
    s.to = row.date; s.played++;
    if (row.result === "W") s.w++; else if (row.result === "D") s.d++; else s.l++;
  }
  for (const s of stints) s.ppg = Number(((s.w * 3 + s.d) / s.played).toFixed(2));
  const mainStint = [...stints].sort((a, b) => b.played - a.played)[0];
  const coachProfile = coachPool.find((c) => normName(c.name) === normName(mainStint.coach));

  // 4) 포메이션 사용 분포
  const fmap = new Map<string, FormationUsage & { xgForSum: number; xgAgainstSum: number; xgN: number }>();
  for (const { row } of enriched) {
    const f = row.formation ?? "미상";
    if (!fmap.has(f)) fmap.set(f, { formation: f, count: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, xgFor: 0, xgAgainst: 0, xgForSum: 0, xgAgainstSum: 0, xgN: 0 });
    const u = fmap.get(f)!;
    u.count++; u.gf += row.gf; u.ga += row.ga;
    if (row.result === "W") u.w++; else if (row.result === "D") u.d++; else u.l++;
    if (row.xgFor != null && row.xgAgainst != null) { u.xgForSum += row.xgFor; u.xgAgainstSum += row.xgAgainst; u.xgN++; }
  }
  const formations = [...fmap.values()]
    .map((u) => ({ ...u, xgFor: u.xgN ? Number((u.xgForSum / u.xgN).toFixed(2)) : 0, xgAgainst: u.xgN ? Number((u.xgAgainstSum / u.xgN).toFixed(2)) : 0 }))
    .sort((a, b) => b.count - a.count)
    .map(({ xgForSum: _a, xgAgainstSum: _b, xgN: _c, ...rest }) => rest);
  const mainFormation = formations[0].formation;

  // 5) 선발 집계 + 좌표. 좌표·XI 멤버십은 최다 포메이션 경기만(형태 섞임 방지),
  //    선발 횟수 표시는 시즌 전체(주 포메이션만 세면 로테이션 팀 수치가 왜곡 — 아스널 실측).
  interface Acc { afId: number; name: string; pos: string; starts: number; startsMain: number; sx: number; sy: number; n: number; slots: Map<string, number> }
  const players = new Map<number, Acc>();
  for (const { row, side, xy } of enriched) {
    for (const p of side.startXI) {
      if (!players.has(p.id)) players.set(p.id, { afId: p.id, name: p.name, pos: p.pos, starts: 0, startsMain: 0, sx: 0, sy: 0, n: 0, slots: new Map() });
      const a = players.get(p.id)!;
      a.starts++;
      if (row.formation !== mainFormation) continue;
      a.startsMain++;
      if (p.grid) a.slots.set(p.grid, (a.slots.get(p.grid) ?? 0) + 1);
      const c = xy.get(p.id);
      if (c) { a.sx += c.x; a.sy += c.y; a.n++; }
    }
  }

  // ts pid + 한글명 매칭 (사진·빌더 링크용) — team-squads 이름 매칭
  const squads: Record<string, { squad: { id: string; name: string }[] }> = existsSync(dataPath("team-squads.json"))
    ? JSON.parse(readFileSync(dataPath("team-squads.json"), "utf8"))
    : {};
  const squad = tsId ? squads[tsId]?.squad ?? [] : [];
  const pidOf = (name: string): string | null => {
    const n = normName(name);
    const exact = squad.find((p) => normName(p.name) === n);
    if (exact) return exact.id;
    const parts = n.split(" ");
    const last = parts.pop()!;
    const byLast = squad.filter((p) => normName(p.name).split(" ").includes(last));
    if (byLast.length === 1) return byLast[0].id;
    if (byLast.length > 1 && parts[0]) {
      // af 축약명("B. Silva") — 이니셜로 동성이인 변별
      const initial = parts[0][0];
      const byInit = byLast.filter((p) => normName(p.name)[0] === initial);
      if (byInit.length === 1) return byInit[0].id;
    }
    const incl = squad.find((p) => { const pn = normName(p.name); return pn.includes(n) || n.includes(pn); });
    return incl?.id ?? null;
  };
  // 정본 af→ts 매핑 우선 — 스쿼드 이름 매칭은 현재 스쿼드 기준이라 과거 시즌의
  // 이적·은퇴 선수를 못 잡는다 (레버쿠젠 23-24 실측). 매핑 없을 때만 이름 매칭 폴백.
  const pids = new Map<number, string | null>();
  for (const a of players.values()) pids.set(a.afId, afPlayerToTs(a.afId) ?? pidOf(a.name));
  const koRows = await prisma.theSportsPlayer.findMany({
    where: { id: { in: [...pids.values()].filter((v): v is string => !!v) } },
    select: { id: true, nameKo: true },
  });
  const koByPid = new Map(koRows.map((r) => [r.id, r.nameKo]));
  const playerKo = (name: string, pid: string | null): string => {
    const fixed = toKoreanPlayerName(name);
    if (/[가-힣]/.test(fixed)) return fixed;
    const db = pid ? koByPid.get(pid) : null;
    return db && /[가-힣]/.test(db) ? db : name;
  };
  const toXi = (a: Acc, coord?: { x: number; y: number }): XiPlayer => {
    const pid = pids.get(a.afId) ?? null;
    return {
      afId: a.afId, name: a.name, nameKo: playerKo(a.name, pid), tsPid: pid, pos: a.pos,
      x: coord ? coord.x : a.n ? Math.round(a.sx / a.n) : 50,
      y: coord ? coord.y : a.n ? Math.round(a.sy / a.n) : 50,
      starts: a.starts,
    };
  };
  const byMain = [...players.values()].filter((a) => a.n > 0).sort((a, b) => b.startsMain - a.startsMain);

  // XI 좌표 = 최빈 그리드 슬롯을 중복 없이 배정. 평균 좌표는 로테이션 팀에서 여러 명이
  // 같은 자리에 겹친다(시티 실측 — 포든·베르나르두·레이너르스 한 점 포개짐). 선발 많은
  // 선수부터 자기 최빈 슬롯을 선점하고, 선점당하면 차순위 슬롯, 전부 뺏기면 평균 좌표 폴백.
  const rowSizes = new Map<number, number>();
  let slotMaxRow = 1;
  for (const a of players.values()) {
    for (const g of a.slots.keys()) {
      const [r, c] = g.split(":").map(Number);
      rowSizes.set(r, Math.max(rowSizes.get(r) ?? 0, c));
      slotMaxRow = Math.max(slotMaxRow, r);
    }
  }
  const slotXY = (g: string) => {
    const [r, c] = g.split(":").map(Number);
    const size = rowSizes.get(r) ?? 1;
    return {
      x: Math.round(size === 1 ? 50 : ((c - 0.5) / size) * 100),
      y: Math.round(r === 1 ? 8 : 8 + ((r - 1) / Math.max(1, slotMaxRow - 1)) * 80),
    };
  };
  const slotUniverse = new Set<string>();
  for (const a of players.values()) for (const g of a.slots.keys()) slotUniverse.add(g);
  const claimed = new Set<string>();
  const coordOf = new Map<number, { x: number; y: number }>();

  // XI 선정은 "줄(row) 단위"로 한다 — 선발 수 상위 10명을 그냥 뽑으면 포지션 구성이 포메이션과
  // 어긋난다. 2026-08-19 실측: 바이에른은 수비수 5명이 뽑혀 백4 자리를 다 채우고 남은 김민재가
  // 공격형 미드필더 자리에 섰고, 도르트문트는 공격수 벨링엄이 수비 라인에 섰다.
  // 각 선수의 주 활동 줄(최빈 슬롯의 row)을 구해, 줄마다 그 줄 자리 수만큼 선발 많은 순으로 뽑는다.
  // (슬롯 최다 점유자만 뽑으면 자리를 옮겨 다닌 주전이 통째로 빠진다 — 레버쿠젠 안드리히 29선발
  //  실측. 줄 단위로 자르면 주전은 남기면서 줄만 지켜진다.)
  const mainRowOf = (a: Acc): number | null => {
    const top = [...a.slots.entries()].sort((x, y) => y[1] - x[1])[0];
    return top ? Number(top[0].split(":")[0]) : null;
  };
  const chosen: Acc[] = [];
  const chosenIds = new Set<number>();
  for (const [row, size] of [...rowSizes.entries()].sort((x, y) => x[0] - y[0])) {
    const inRow = byMain.filter((a) => mainRowOf(a) === row).slice(0, size);
    for (const a of inRow) { chosen.push(a); chosenIds.add(a.afId); }
    // 줄 안에서 자리 배정 — 자기 최빈 슬롯을 선발 많은 순으로 선점, 뺏기면 남은 자리 중 평균 x 에 가까운 곳
    for (const a of inRow) {
      const pref = [...a.slots.entries()].sort((x, y) => y[1] - x[1])
        .map(([g]) => g).find((g) => Number(g.split(":")[0]) === row && !claimed.has(g));
      if (pref) { claimed.add(pref); coordOf.set(a.afId, slotXY(pref)); }
    }
    for (const a of inRow) {
      if (coordOf.has(a.afId)) continue;
      const ax = a.n ? a.sx / a.n : 50;
      const free = Array.from({ length: size }, (_, i) => `${row}:${i + 1}`).filter((g) => !claimed.has(g))
        .sort((g1, g2) => Math.abs(slotXY(g1).x - ax) - Math.abs(slotXY(g2).x - ax))[0];
      if (free) { claimed.add(free); coordOf.set(a.afId, slotXY(free)); }
    }
  }
  // 줄 후보가 모자라 빈 자리가 남으면 선발 많은 미선정 선수로 채운다(평균 좌표에서 가장 가까운 자리).
  for (const a of byMain) {
    if (chosen.length >= slotUniverse.size) break;
    if (chosenIds.has(a.afId)) continue;
    const ax = a.n ? a.sx / a.n : 50, ay = a.n ? a.sy / a.n : 50;
    const free = [...slotUniverse].filter((g) => !claimed.has(g))
      .sort((g1, g2) => {
        const p1 = slotXY(g1), p2 = slotXY(g2);
        return (p1.x - ax) ** 2 + (p1.y - ay) ** 2 - ((p2.x - ax) ** 2 + (p2.y - ay) ** 2);
      })[0];
    if (!free) break;
    claimed.add(free);
    chosenIds.add(a.afId);
    chosen.push(a);
    coordOf.set(a.afId, slotXY(free));
  }
  chosen.sort((a, b) => b.startsMain - a.startsMain);

  const mostUsedXi = { formation: mainFormation, players: chosen.map((a) => toXi(a, coordOf.get(a.afId))) };
  const topStarters = [...players.values()].sort((a, b) => b.starts - a.starts).slice(0, 14).map((a) => toXi(a));

  // 6) XI 고정도 — 연속 경기 간 변경 수 평균 + 전 경기 선발
  let changes = 0;
  for (let i = 1; i < enriched.length; i++) {
    const prev = new Set(enriched[i - 1].side.startXI.map((p) => p.id));
    changes += enriched[i].side.startXI.filter((p) => !prev.has(p.id)).length;
  }
  const everPresent = [...players.values()]
    .filter((a) => a.starts === enriched.length)
    .map((a) => playerKo(a.name, pids.get(a.afId) ?? null));

  // 7) 월별 (xG 추이 위젯 + 이달의 감독 선정 재사용)
  const mmap = new Map<string, { month: string; played: number; w: number; d: number; l: number; gf: number; ga: number; xgFor: number; xgAgainst: number }>();
  for (const { row } of enriched) {
    const mo = row.date.slice(0, 7);
    if (!mmap.has(mo)) mmap.set(mo, { month: mo, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, xgFor: 0, xgAgainst: 0 });
    const m = mmap.get(mo)!;
    m.played++; m.gf += row.gf; m.ga += row.ga;
    if (row.result === "W") m.w++; else if (row.result === "D") m.d++; else m.l++;
    m.xgFor += row.xgFor ?? 0; m.xgAgainst += row.xgAgainst ?? 0;
  }
  const monthly = [...mmap.values()].map((m) => ({ ...m, xgFor: Number(m.xgFor.toFixed(1)), xgAgainst: Number(m.xgAgainst.toFixed(1)) }));

  // 8) 샷 프로필 (TheStatsAPI 샷맵 — 팀명 정규화 매칭)
  const shotmaps = loadShotmaps(league);
  const matchDates = new Set(enriched.map((e) => e.row.date));
  let shotProfile: ManagerSeasonAggregate["shotProfile"] = null;
  const goalsFor: ManagerSeasonAggregate["goalsFor"] = [];
  {
    const mk = (): ShotAgg & { shooters: Map<string, { name: string; shots: number; goals: number; xg: number }> } =>
      ({ shots: 0, goals: 0, xg: 0, insideBoxShare: 0, bySituation: {}, topShooters: [], shooters: new Map() });
    const agg = { for: mk(), against: mk() };
    let inBoxFor = 0, inBoxAgainst = 0;
    for (const sm of Object.values(shotmaps)) {
      const isHome = normTeam(sm.home.name) === teamNorm;
      const isAway = normTeam(sm.away.name) === teamNorm;
      if (!isHome && !isAway) continue;
      if (!matchDates.has(sm.date)) continue; // 기간 밖(월간 모드) 제외
      const myTmId = isHome ? sm.home.id : sm.away.id;
      for (const s of sm.shots) {
        if (s.sit === "own_goal") continue;
        const mine = s.team === myTmId;
        const side = mine ? agg.for : agg.against;
        side.shots++; side.xg += s.xg;
        side.bySituation[s.sit] = (side.bySituation[s.sit] ?? 0) + 1;
        const inBox = s.x <= 16 && s.y >= 21 && s.y <= 79;
        if (inBox) { if (mine) inBoxFor++; else inBoxAgainst++; }
        const isGoal = s.result === "goal";
        if (isGoal) side.goals++;
        if (mine) {
          const sh = side.shooters.get(s.pid) ?? { name: s.name, shots: 0, goals: 0, xg: 0 };
          sh.shots++; sh.xg += s.xg; if (isGoal) sh.goals++;
          side.shooters.set(s.pid, sh);
          // 샷맵 원본에 xg null 골 실존 — 렌더 계약은 number 고정 (null 이 섹션 크래시 유발했던 사고)
          if (isGoal) goalsFor.push({ x: s.x, y: s.y, min: s.min, name: s.name, nameKo: playerKo(s.name, null), xg: typeof s.xg === "number" ? s.xg : 0, sit: s.sit });
        }
      }
    }
    if (agg.for.shots > 0) {
      const fin = (a: typeof agg.for, inBox: number): ShotAgg => ({
        shots: a.shots, goals: a.goals, xg: Number(a.xg.toFixed(1)),
        insideBoxShare: Number((inBox / a.shots).toFixed(2)),
        bySituation: a.bySituation,
        topShooters: [...a.shooters.values()].sort((x, y) => y.goals - x.goals || y.xg - x.xg).slice(0, 5)
          .map((s) => ({ ...s, nameKo: playerKo(s.name, null), xg: Number(s.xg.toFixed(1)) })),
      });
      shotProfile = { for: fin(agg.for, inBoxFor), against: fin(agg.against, inBoxAgainst) };
    }
  }

  return {
    league, seasonLabel,
    team: { id: team.id, name: team.name, nameKo: teamKo, tsId },
    coach: { name: mainStint.coach, nameKo: mainStint.coachKo, preferredFormation: coachProfile?.preferredFormation ?? null, logo: coachProfile?.logo ?? null },
    record: rec,
    coachStints: stints,
    formations,
    mostUsedXi,
    topStarters,
    xiChanges: { avgPerMatch: Number((changes / Math.max(1, enriched.length - 1)).toFixed(1)), everPresent },
    matches: enriched.map((e) => e.row),
    monthly,
    shotProfile,
    goalsFor: goalsFor.sort((a, b) => a.min - b.min),
  };
}
