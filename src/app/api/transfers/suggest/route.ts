// /api/transfers/suggest — 이적시장 선수·팀 검색 자동완성.
// PlayerMarketValue 전 리그(빅5 + K리그1·사우디·MLS)를 1시간 메모리 캐시로 인덱싱 후
// 한글 자모 분해 매칭("소" → 손흥민) + 초성 검색("ㅅㅎㅁ" → 손흥민) + 영문명 부분일치.
// 팀 추천은 빅5 팀만 (?view=team 스쿼드 뷰가 빅5 전용) + 축약 별칭(맨시티·맨유·돌문 등).
// 선수 노출 규칙(18개월 활성·이름 미상 제외·동명+팀 dedup)은 /transfers 랭킹과 동일.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import rawOverrides from "../../../../../data/player-overrides.json";
import rawPhotos from "../../../../../data/player-photos.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OVERRIDES = rawOverrides as Record<string, { nameKo?: string; country?: string; flag?: string; pos?: string }>;
const PHOTOS = rawPhotos as Record<string, string>;

const FIVE = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
const FIVE_SET = new Set(FIVE);
// 팀명 미매핑 시 리그 라벨 폴백, 확장 리그는 팀명 옆 병기 (빅5는 클럽명으로 충분)
const LEAGUE_LABEL: Record<string, string> = {
  EPL: "EPL", LALIGA: "라리가", BUNDESLIGA: "분데스리가", SERIE_A: "세리에 A", LIGUE_1: "리그 1",
  K_LEAGUE_1: "K리그1", SAUDI_PL: "사우디", MLS: "MLS",
};

// 자주 쓰는 클럽 축약어 — 풀네임 부분일치로 안 잡히는 것만 (한글명은 team-names.ts 표기 기준)
const TEAM_ALIASES: Record<string, string[]> = {
  "맨체스터 시티": ["맨시티"],
  "맨체스터 유나이티드": ["맨유"],
  "바르셀로나": ["바르샤", "FC 바르셀로나"],
  "도르트문트": ["돌문", "보루시아 도르트문트"],
  "파리 생제르맹": ["PSG"],
  "아스널": ["아스날"],
  "아틀레티코 마드리드": ["알레티", "AT 마드리드"],
};

const EUR_KRW = 1791.5;
function krw(eurM: number): string {
  const eok = (eurM * 1e6 * EUR_KRW) / 1e8;
  if (eok >= 10000) return (eok / 10000).toFixed(2) + "조";
  return Math.round(eok).toLocaleString() + "억";
}

// ── 한글 자모 분해 — "손" → "ㅅㅗㄴ". 음절 중간 입력("소")도 prefix 매칭되게 ──
const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const JUNG = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
const JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

function decomp(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) {
      const i = c - 0xac00;
      out += CHO[(i / 588) | 0] + JUNG[((i % 588) / 28) | 0] + JONG[i % 28];
    } else out += ch;
  }
  return out;
}

function chosung(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) out += CHO[((c - 0xac00) / 588) | 0];
    else if (ch !== " ") out += ch;
  }
  return out;
}

interface PlayerEntry {
  id: string;
  name: string;
  team: string;
  photo: string | null;
  value: string; // "1,523억"
  v: number; // 정렬용 €
  nd: string; // 표시명 자모 분해 (lower)
  ndW: string[]; // 표시명 어절별 자모 분해 — "해리 케인"의 "케인" prefix 매칭
  ed: string; // 영문명 lower ("" = 없음)
  edW: string[];
  nc: string; // 표시명 초성
}
interface TeamEntry {
  id: number;
  name: string;
  logo: string | null;
  count: number;
  nds: string[]; // 이름+별칭 자모 분해
  ncs: string[]; // 이름+별칭 초성
}
// 모듈 메모리 캐시 (warm 인스턴스당 1시간) — unstable_cache 직렬화 한도 회피
let IDX: { players: PlayerEntry[]; teams: TeamEntry[] } | null = null;
let idxAt = 0;

interface RawRow { id: string; currentValue: number; teamId: string | null; league: string | null; lastTime: number }

async function getIndex() {
  if (IDX && Date.now() - idxAt < 3600_000) return IDX;
  const cutoff = Math.floor(Date.now() / 1000) - 18 * 30 * 86400; // 18개월 활성 — 랭킹과 동일
  // history 는 마지막 항목의 market_time 만 필요 — JSON 전체 전송을 피해 SQL 에서 추출 (콜드 빌드 38s → 수초)
  const raw = await prisma.$queryRaw<RawRow[]>`
    SELECT id, "currentValue", "teamId", league,
      COALESCE(CASE WHEN jsonb_typeof(history::jsonb) = 'array' AND jsonb_array_length(history::jsonb) > 0
        THEN ((history::jsonb) -> (jsonb_array_length(history::jsonb) - 1) ->> 'market_time')::float8
        ELSE 0 END, 0) AS "lastTime"
    FROM "PlayerMarketValue"
    WHERE "currentValue" IS NOT NULL
    ORDER BY "currentValue" DESC
  `;
  const ps = await prisma.theSportsPlayer.findMany({
    where: { id: { in: raw.map((r) => r.id) } },
    select: { id: true, nameKo: true, name: true, photoUrl: true },
  });
  const pMap = new Map(ps.map((p) => [p.id, p]));

  // ts team id → 우리 Team. 한 ts id 가 여러 Team 매핑(UCL 중복 등) 시 mv 리그 일치 > 빅5 > 첫번째
  const tsIds = [...new Set(raw.map((r) => r.teamId).filter((x): x is string => !!x))];
  const tsLeague = new Map<string, string>();
  for (const r of raw) if (r.teamId && r.league && !tsLeague.has(r.teamId)) tsLeague.set(r.teamId, r.league);
  const links = await prisma.teamSourceId.findMany({
    where: { source: "thesports", externalId: { in: tsIds } },
    select: { externalId: true, teamId: true },
  });
  const ourRows = await prisma.team.findMany({
    where: { id: { in: [...new Set(links.map((l) => l.teamId))] } },
    select: { id: true, name: true, logoUrl: true, league: true },
  });
  const teamMeta = new Map(ourRows.map((t) => [t.id, t]));
  const candByTs = new Map<string, number[]>();
  for (const l of links) {
    const a = candByTs.get(l.externalId) || [];
    a.push(l.teamId);
    candByTs.set(l.externalId, a);
  }
  const tsToOur = new Map<string, number>();
  for (const [ext, idsArr] of candByTs) {
    const lg = tsLeague.get(ext);
    const exact = idsArr.find((id) => teamMeta.get(id)?.league === lg);
    const big5 = idsArr.find((id) => FIVE_SET.has(teamMeta.get(id)?.league || ""));
    tsToOur.set(ext, exact ?? big5 ?? idsArr[0]);
  }

  const players: PlayerEntry[] = [];
  const teamAgg = new Map<number, { name: string; logo: string | null; count: number }>();
  const dedup = new Set<string>();
  for (const r of raw) {
    if (r.lastTime < cutoff) continue;
    const tsp = pMap.get(r.id);
    const name = OVERRIDES[r.id]?.nameKo || tsp?.nameKo || tsp?.name || "선수";
    if (name === "선수") continue; // 이름 데이터 없는 선수 제외 — 랭킹과 동일
    const ourId = r.teamId ? tsToOur.get(r.teamId) : undefined;
    const tm = ourId != null ? teamMeta.get(ourId) : undefined;
    const teamName = tm ? toKoreanTeamName(tm.name) || tm.name : "";
    const k = `${name}|${teamName}`;
    if (dedup.has(k)) continue; // 가치순 desc 라 첫 등장 = 최고가
    dedup.add(k);
    const lgLabel = (r.league && LEAGUE_LABEL[r.league]) || "";
    // 빅5는 팀명만, 확장 리그는 "팀명 · 리그", 팀 미매핑은 리그 라벨만
    const team = !teamName ? lgLabel || "—" : r.league && !FIVE_SET.has(r.league) && lgLabel ? `${teamName} · ${lgLabel}` : teamName;
    const eurM = (r.currentValue || 0) / 1e6;
    const nameEn = (tsp?.name || "").toLowerCase();
    const nameLower = name.toLowerCase();
    players.push({
      id: r.id,
      name,
      team,
      photo: PHOTOS[r.id] || tsp?.photoUrl || null,
      value: eurM * 1e6 * 1791.5 >= 1e8 ? krw(eurM) : "", // 1억 미만은 미표기
      v: r.currentValue || 0,
      nd: decomp(nameLower),
      ndW: nameLower.split(/\s+/).filter(Boolean).map(decomp),
      ed: nameEn,
      edW: nameEn.split(/\s+/).filter(Boolean),
      nc: chosung(name),
    });
    if (tm && ourId != null && FIVE_SET.has(tm.league) && teamName) {
      const a = teamAgg.get(ourId) || { name: teamName, logo: tm.logoUrl, count: 0 };
      a.count++;
      teamAgg.set(ourId, a);
    }
  }
  const teams: TeamEntry[] = [...teamAgg.entries()].map(([id, t]) => {
    const names = [t.name, ...(TEAM_ALIASES[t.name] || [])];
    return {
      id,
      name: t.name,
      logo: t.logo,
      count: t.count,
      nds: names.map((n) => decomp(n.toLowerCase())),
      ncs: names.map(chosung),
    };
  });
  IDX = { players, teams };
  idxAt = Date.now();
  return IDX;
}

// 매칭 순위: 0 prefix(전체·어절·영문 어절 동급 — 동순위 내 가치순이 스타를 위로) > 1 이름 부분일치 > 2 영문 부분일치. -1 = 미일치
function playerTier(e: PlayerEntry, qd: string, qc: string | null): number {
  if (qc) {
    if (e.nc.startsWith(qc)) return 0;
    if (e.nc.includes(qc)) return 1;
    return -1;
  }
  if (e.nd.startsWith(qd) || e.ndW.some((w) => w.startsWith(qd)) || e.edW.some((w) => w.startsWith(qd))) return 0;
  if (e.nd.includes(qd)) return 1;
  if (e.ed && e.ed.includes(qd)) return 2;
  return -1;
}

function teamTier(t: TeamEntry, qd: string, qc: string | null): number {
  if (qc) return t.ncs.some((n) => n.startsWith(qc)) ? 0 : t.ncs.some((n) => n.includes(qc)) ? 1 : -1;
  if (t.nds.some((n) => n.startsWith(qd))) return 0;
  if (t.nds.some((n) => n.includes(qd))) return 1;
  return -1;
}

const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400" };

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 40);
  if (!q) return NextResponse.json({ players: [], teams: [] }, { headers: CACHE_HEADERS });

  const idx = await getIndex();
  const qLower = q.toLowerCase();
  const qc = /^[ㄱ-ㅎ\s]+$/.test(qLower) ? qLower.replace(/\s+/g, "") : null; // 초성 전용 쿼리
  const qd = decomp(qLower);

  const players = idx.players
    .map((e) => ({ e, t: playerTier(e, qd, qc) }))
    .filter((x) => x.t >= 0)
    .sort((a, b) => a.t - b.t || b.e.v - a.e.v)
    .slice(0, 8)
    .map(({ e }) => ({ id: e.id, name: e.name, team: e.team, photo: e.photo, value: e.value }));

  const teams = idx.teams
    .map((e) => ({ e, t: teamTier(e, qd, qc) }))
    .filter((x) => x.t >= 0)
    .sort((a, b) => a.t - b.t || b.e.count - a.e.count)
    .slice(0, 3)
    .map(({ e }) => ({ id: e.id, name: e.name, logo: e.logo, count: e.count }));

  return NextResponse.json({ players, teams }, { headers: CACHE_HEADERS });
}
