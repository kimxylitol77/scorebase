// 베트맨 프로토 배당 조회 — /odds?sport=betman 용. 적재는 betman-odds-cron.
// 상세·함정은 reports/plans/betman-odds/context-notes.md.

import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import rawTeamMap from "../../../data/betman-team-map.json";

/** 한 베팅 라인 (승무패·핸디캡·언더오버·홀짝 각각 한 줄) */
export interface BetmanLine {
  id: string;
  betNm: string | null;
  betTypNm: string | null;
  handi: number | null;
  winHandi: number | null;
  loseHandi: number | null;
  winAllot: number | null;
  drawAllot: number | null;
  loseAllot: number | null;
  winVotes: number | null;
  drawVotes: number | null;
  loseVotes: number | null;
}

/** 경기 한 건 — 기본형(승무패/승패)을 대표로 세우고, 나머지 유형은 lines 로 접어 둔다. */
export interface BetmanMatch extends BetmanLine {
  key: string;
  gmTs: number;
  /** 회차 내 프로토 경기번호 — 한국 구매자는 팀명이 아니라 이 번호로 경기를 지목한다. */
  matchSeq: number;
  /** ISO 문자열 — unstable_cache 가 반환값을 JSON 직렬화해 Date 가 문자열이 된다.
      타입만 Date 로 두면 렌더에서 "Invalid time value" 로 터진다(실측). */
  gameDate: string;
  /** SC 축구 / BS 야구 / BK 농구 / VL 배구 */
  itemCode: string | null;
  leagueName: string;
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  lines: BetmanLine[];
}

// VL(배구) — 2026-09-03 추가. 워커는 전 종목을 쌓지만 이 필터에 걸려 화면에 안 나오고 있었다.
const ITEM_CODES = ["SC", "BS", "BK", "VL"];
/** 대표로 세울 기본형. 축구 = 승무패(3-way), 야구·농구·배구 = 일반 승패(2-way). */
const BASE_TYPES = new Set(["승무패", "일반 승패"]);
/** 펼침 목록 정렬 — 익숙한 순서대로. 목록에 없는 유형은 뒤로. */
const LINE_ORDER = ["승N패", "일반 정수핸디캡", "일반 소수핸디캡", "일반 세트핸디캡", "일반 언더오버", "일반 홀짝"];
/** 펼침 정렬 키 — 전반 라인은 같은 유형이라도 뒤로(풀타임 먼저). */
const lineRank = (r: { betTypNm: string | null; betNm: string | null }) => {
  const i = LINE_ORDER.indexOf(r.betTypNm ?? "");
  return (i < 0 ? 99 : i) + ((r.betNm ?? "").includes("전반") ? 100 : 0);
};

const norm = (s: string) => s.replace(/[\s·.()]/g, "").toLowerCase();

function koKey(name: string, league: string): string | null {
  try {
    return toKoreanTeamName(name, league) || null;
  } catch {
    return null;
  }
}

/**
 * 베트맨 팀명 → 우리 Team.id 사전 (scripts/build-betman-team-map.ts 생성).
 * 킥오프 시각으로 우리 경기와 대조해 만든 것이라 이름 표기 차이("한신 타이거즈" vs
 * "타이거스")에 영향받지 않는다. 새 리그가 발매에 들어오면 스크립트를 재실행한다.
 */
const TEAM_MAP = rawTeamMap as Record<string, number>;

/**
 * 베트맨 한글 팀명 → 우리 Team.logoUrl.
 *
 * ① 사전(TEAM_MAP) 우선 — 경기 대조로 만든 정본.
 * ② 사전에 없는 새 팀은 이름 유사 매칭으로 임시 처리하되, **로고가 유일하게 결정될 때만**
 *    채택한다. "시카고" 처럼 컵스·화이트삭스 둘 다에 걸리는 이름은 버린다 —
 *    틀린 로고보다 이니셜 폴백이 낫다.
 */
async function buildLogoLookup(): Promise<(name: string) => string | null> {
  const teams = await prisma.team.findMany({
    where: { logoUrl: { not: null } },
    select: { id: true, name: true, nameKo: true, logoUrl: true, league: true },
  });
  const byId = new Map(teams.map((t) => [t.id, t.logoUrl!]));
  const byKey = new Map<string, Set<string>>();
  const add = (k: string | null | undefined, logo: string) => {
    if (!k) return;
    const key = norm(k);
    if (key.length < 2) return;
    const s = byKey.get(key) ?? new Set<string>();
    s.add(logo);
    byKey.set(key, s);
  };
  for (const t of teams) {
    add(t.nameKo, t.logoUrl!);
    add(t.name, t.logoUrl!);
    add(koKey(t.name, t.league), t.logoUrl!);
  }
  const entries = [...byKey.entries()];

  return (name: string) => {
    const mapped = TEAM_MAP[name];
    if (mapped != null) {
      const logo = byId.get(mapped);
      if (logo) return logo;
    }
    const k = norm(name);
    const exact = byKey.get(k);
    if (exact) return exact.size === 1 ? [...exact][0] : null;
    const logos = new Set<string>();
    for (const [key, set] of entries) {
      if (key.includes(k) || k.includes(key)) for (const l of set) logos.add(l);
      if (logos.size > 1) return null; // 모호 — 조기 종료
    }
    return logos.size === 1 ? [...logos][0] : null;
  };
}

/**
 * 발매 중인 경기를 시각순으로. 각 경기에 기본형 배당을 세우고 나머지 유형은 lines 에 담는다.
 * 같은 경기가 발매중·직전 회차에 중복 편성되므로 회차 내림차순으로 받아 최신 것만 남긴다.
 */
export async function getBetmanMatches(take = 60): Promise<BetmanMatch[]> {
  const rows = await prisma.betmanOdds.findMany({
    where: {
      itemCode: { in: ITEM_CODES },
      // 이미 끝난 경기는 뺀다. 진행 중(3h 이내 시작)은 남겨 배당을 볼 수 있게.
      gameDate: { gt: new Date(Date.now() - 3 * 3600 * 1000) },
    },
    orderBy: [{ gameDate: "asc" }, { gmTs: "desc" }],
    select: {
      id: true, gmTs: true, matchSeq: true, gameDate: true, itemCode: true, leagueName: true,
      homeName: true, awayName: true,
      betNm: true, betTypNm: true, handi: true, winHandi: true, loseHandi: true,
      winAllot: true, drawAllot: true, loseAllot: true,
      winVotes: true, drawVotes: true, loseVotes: true,
    },
    take: 3000,
  });

  // 경기 단위로 묶는다. 먼저 오는 회차(=최신)만 채택 — 마감 회차 중복 편성 제거.
  const groups = new Map<string, { gmTs: number; rows: typeof rows }>();
  for (const r of rows) {
    const key = `${r.gameDate.getTime()}|${r.homeName}|${r.awayName}`;
    const g = groups.get(key);
    if (!g) { groups.set(key, { gmTs: r.gmTs, rows: [r] }); continue; }
    if (r.gmTs !== g.gmTs) continue;
    g.rows.push(r);
  }

  const logoOf = await buildLogoLookup();
  const out: BetmanMatch[] = [];
  for (const [key, g] of groups) {
    // 대표 = 기본형 중 배당이 매겨진 것. 없으면 이 경기는 보여줄 게 없다.
    // 전반 승무패/승패는 betTypNm 이 같아 대표로 뽑히면 풀타임 배당처럼 보인다(2026-09-12 실측 김천 vs 강원) — 대표에서 제외.
    const base = g.rows.find((r) => BASE_TYPES.has(r.betTypNm ?? "") && r.winAllot != null && !(r.betNm ?? "").includes("전반"));
    if (!base) continue;
    const lines: BetmanLine[] = g.rows
      .filter((r) => r.id !== base.id && r.winAllot != null)
      .sort((a, b) => lineRank(a) - lineRank(b))
      .map((r) => ({
        id: r.id, betNm: r.betNm, betTypNm: r.betTypNm,
        handi: r.handi, winHandi: r.winHandi, loseHandi: r.loseHandi,
        winAllot: r.winAllot, drawAllot: r.drawAllot, loseAllot: r.loseAllot,
        winVotes: r.winVotes, drawVotes: r.drawVotes, loseVotes: r.loseVotes,
      }));
    out.push({
      key,
      gmTs: g.gmTs,
      matchSeq: base.matchSeq,
      gameDate: base.gameDate.toISOString(),
      itemCode: base.itemCode,
      leagueName: base.leagueName,
      homeName: base.homeName,
      awayName: base.awayName,
      homeLogo: logoOf(base.homeName),
      awayLogo: logoOf(base.awayName),
      id: base.id,
      betNm: base.betNm, betTypNm: base.betTypNm,
      handi: base.handi, winHandi: base.winHandi, loseHandi: base.loseHandi,
      winAllot: base.winAllot, drawAllot: base.drawAllot, loseAllot: base.loseAllot,
      winVotes: base.winVotes, drawVotes: base.drawVotes, loseVotes: base.loseVotes,
      lines,
    });
    if (out.length >= take) break;
  }
  return out;
}

/** 경기 상세용 — 우리 경기에 해당하는 베트맨 승무패(야구·농구·배구는 승패) 한 줄. 없으면 null. */
export interface BetmanMatchLine {
  winAllot: number;
  drawAllot: number | null;
  loseAllot: number;
  /** 국내 구매자 투표 비율(%) — 투표 합이 0 이면 null */
  votePct: { win: number; draw: number | null; lose: number } | null;
  gameDate: string;
  gmTs: number;
  /** 회차 내 프로토 경기번호 */
  matchSeq: number;
}

const LINE_SELECT = {
  gmTs: true, matchSeq: true, gameDate: true, winAllot: true, drawAllot: true, loseAllot: true,
  winVotes: true, drawVotes: true, loseVotes: true,
} as const;

function toLine(r: {
  gmTs: number; matchSeq: number; gameDate: Date; winAllot: number | null; drawAllot: number | null; loseAllot: number | null;
  winVotes: number | null; drawVotes: number | null; loseVotes: number | null;
}): BetmanMatchLine | null {
  if (r.winAllot == null || r.loseAllot == null) return null;
  const w = r.winVotes ?? 0, d = r.drawVotes ?? 0, l = r.loseVotes ?? 0;
  const tot = w + d + l;
  return {
    winAllot: r.winAllot,
    drawAllot: r.drawAllot,
    loseAllot: r.loseAllot,
    votePct: tot > 0 ? { win: (w / tot) * 100, draw: r.drawVotes != null ? (d / tot) * 100 : null, lose: (l / tot) * 100 } : null,
    gameDate: r.gameDate.toISOString(),
    gmTs: r.gmTs,
    matchSeq: r.matchSeq,
  };
}

/**
 * 1순위 = link-betman-matches 가 채운 matchId. 2순위 = 사전 이름 + 킥오프 ±3h(배치가 아직 안 돈 최신 회차).
 * 종목 필터를 두지 않는다 — 예전엔 itemCode:"SC" 로 고정돼 야구는 사전이 전부 있는데도 카드가 안 떴다(2026-09-11).
 */
export async function getBetmanLineForMatch(
  homeTeamId: number,
  awayTeamId: number,
  startTime: Date,
  matchId?: number,
): Promise<BetmanMatchLine | null> {
  const base = { betTypNm: { in: [...BASE_TYPES] }, winAllot: { not: null } };
  if (matchId != null) {
    const r = await prisma.betmanOdds.findFirst({ where: { matchId, ...base }, orderBy: { gmTs: "desc" }, select: LINE_SELECT });
    if (r) return toLine(r);
  }
  // 사전 역인덱스: Team.id → 베트맨 표기들 (한 팀이 여러 표기를 가질 수 있다)
  const homeNames = new Set<string>();
  const awayNames = new Set<string>();
  for (const [name, id] of Object.entries(TEAM_MAP)) {
    if (id === homeTeamId) homeNames.add(name);
    if (id === awayTeamId) awayNames.add(name);
  }
  if (homeNames.size === 0 || awayNames.size === 0) return null;
  const r = await prisma.betmanOdds.findFirst({
    where: {
      ...base,
      homeName: { in: [...homeNames] },
      awayName: { in: [...awayNames] },
      gameDate: {
        gte: new Date(startTime.getTime() - 3 * 3600 * 1000),
        lte: new Date(startTime.getTime() + 3 * 3600 * 1000),
      },
    },
    orderBy: { gmTs: "desc" },
    select: LINE_SELECT,
  });
  return r ? toLine(r) : null;
}
