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
  /** ISO 문자열 — unstable_cache 가 반환값을 JSON 직렬화해 Date 가 문자열이 된다.
      타입만 Date 로 두면 렌더에서 "Invalid time value" 로 터진다(실측). */
  gameDate: string;
  /** SC 축구 / BS 야구 / BK 농구 */
  itemCode: string | null;
  leagueName: string;
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  lines: BetmanLine[];
}

const ITEM_CODES = ["SC", "BS", "BK"];
/** 대표로 세울 기본형. 축구 = 승무패(3-way), 야구·농구 = 일반 승패(2-way). */
const BASE_TYPES = new Set(["승무패", "일반 승패"]);
/** 펼침 목록 정렬 — 익숙한 순서대로. 목록에 없는 유형은 뒤로. */
const LINE_ORDER = ["승N패", "일반 정수핸디캡", "일반 소수핸디캡", "일반 언더오버", "일반 홀짝"];

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
      id: true, gmTs: true, gameDate: true, itemCode: true, leagueName: true,
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
    const base = g.rows.find((r) => BASE_TYPES.has(r.betTypNm ?? "") && r.winAllot != null);
    if (!base) continue;
    const lines: BetmanLine[] = g.rows
      .filter((r) => r.id !== base.id && r.winAllot != null)
      .sort((a, b) => {
        const ia = LINE_ORDER.indexOf(a.betTypNm ?? "");
        const ib = LINE_ORDER.indexOf(b.betTypNm ?? "");
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      })
      .map((r) => ({
        id: r.id, betNm: r.betNm, betTypNm: r.betTypNm,
        handi: r.handi, winHandi: r.winHandi, loseHandi: r.loseHandi,
        winAllot: r.winAllot, drawAllot: r.drawAllot, loseAllot: r.loseAllot,
        winVotes: r.winVotes, drawVotes: r.drawVotes, loseVotes: r.loseVotes,
      }));
    out.push({
      key,
      gmTs: g.gmTs,
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
