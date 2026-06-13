// ESPN 비공식 트랜잭션 API — 북미 종목(NBA/MLB/NHL) 트레이드·FA·방출·단기계약·감독 인사.
// 무료·무인증·Vercel 직접 호출 가능(IP whitelist 불필요). 세 종목 응답 형태 동일.
//
// 엔드포인트: site.api.espn.com/apis/site/v2/sports/{sport}/{league}/transactions
//   ?limit=N (페이지당) — pageCount 만큼 page 파라미터로 순회.
//
// ESPN 응답엔 안정적 고유 id 가 없어 우리가 합성(league:date:desc 해시) → 멱등 upsert.

import crypto from "crypto";

export type TxLeague = "NBA" | "MLB" | "NHL";

const SPORT_PATH: Record<TxLeague, string> = {
  NBA: "basketball/nba",
  MLB: "baseball/mlb",
  NHL: "hockey/nhl",
};

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

interface EspnTxTeam {
  id?: string;
  displayName?: string;
  abbreviation?: string;
  logos?: Array<{ href?: string; rel?: string[] }>;
}
interface EspnTx {
  date?: string; // ISO
  description?: string;
  team?: EspnTxTeam;
}
interface EspnTxResp {
  count?: number;
  pageCount?: number;
  pageIndex?: number;
  transactions?: EspnTx[];
}

/** 트랜잭션 분류 — 한국어 라벨/필터는 페이지에서 매핑. */
export type TxCategory =
  | "trade" // 트레이드
  | "signing" // 계약(신규·재계약·전환·투웨이)
  | "waive" // 방출/웨이버
  | "short_term" // 단기(10일 등)
  | "staff" // 감독·프런트 인사
  | "other";

/** 밝은(라이트) 로고 우선 — 카드 배경이 보통 밝음. */
function pickLogo(team?: EspnTxTeam): string | undefined {
  const logos = team?.logos ?? [];
  if (logos.length === 0) return undefined;
  const dflt = logos.find((l) => l.rel?.includes("default") && !l.rel?.includes("dark"));
  return (dflt ?? logos[0]).href;
}

/** description 텍스트 → 카테고리 분류. 순서 중요(트레이드·단기 먼저). */
export function classifyTransaction(desc: string): TxCategory {
  const d = desc.toLowerCase();
  if (/\btraded?\b|acquired|in a trade/.test(d)) return "trade";
  // 감독·프런트: 코치/단장/사장/부사장 직함 또는 hire/fire/resign + 직함
  if (
    /head coach|general manager|president|executive|vice president|director of|assistant coach|coaching staff|resignation|stepped down|relieved/.test(
      d,
    )
  ) {
    return "staff";
  }
  if (/10-day|two-way|rest-of-season|hardship|exhibit 10/.test(d)) return "short_term";
  if (/waived|released|placed .* on waivers/.test(d)) return "waive";
  if (/signed|re-signed|converted|claimed|extension|exercised|re-acquired/.test(d)) return "signing";
  return "other";
}

/** "Signed G Nick Smith Jr. to a contract." → {position:"G", playerName:"Nick Smith Jr."} (best-effort).
 *  단일 선수 트랜잭션(계약/방출)용 표시 sugar. 트레이드(다중 선수)는 description 전체를 보여주므로 파싱 생략 가능.
 *  포지션 약자(NBA G/F/C/PG.. · MLB RHP/1B.. · NHL D/LW/RW) 뒤 대문자 이름을 잡고 꼬리 불용어 제거. */
const POS_TOKENS = "PG|SG|SF|PF|LW|RW|RHP|LHP|1B|2B|3B|SS|DH|OF|IF|G|F|C|D|P";
const PLAYER_RE = new RegExp(
  `\\b(${POS_TOKENS})\\s+([A-Z][A-Za-z.'’-]+(?:\\s+[A-Z][A-Za-z.'’-]+){0,3})`,
);
export function parsePlayer(desc: string): { playerName?: string; position?: string } {
  const m = desc.match(PLAYER_RE);
  if (m) {
    const name = m[2]
      .replace(/\s+(to|from|and|for|off|on|in)$/i, "")
      .replace(/[.,]+$/, "") // 문장 끝 마침표/쉼표 ("Tyreke Key." → "Tyreke Key")
      .trim();
    if (name.length >= 2) return { position: m[1], playerName: name };
  }
  return {};
}

/** 합성 id — 같은 트랜잭션 재수집 시 동일 id 보장(멱등). */
function synthId(league: TxLeague, dateIso: string, desc: string): string {
  const day = dateIso.slice(0, 10);
  const hash = crypto.createHash("sha1").update(`${desc}`).digest("hex").slice(0, 10);
  return `${league}:${day}:${hash}`;
}

export interface NormalizedTransaction {
  id: string;
  league: TxLeague;
  date: Date;
  teamId: string | null;
  teamName: string | null;
  teamAbbr: string | null;
  teamLogo: string | null;
  description: string;
  category: TxCategory;
  playerName: string | null;
  position: string | null;
}

/** 한 리그의 트랜잭션 전 페이지 fetch → 정규화 배열. 실패 시 빈 배열. */
export async function fetchEspnTransactions(
  league: TxLeague,
  opts?: { maxPages?: number },
): Promise<NormalizedTransaction[]> {
  const sport = SPORT_PATH[league];
  const maxPages = opts?.maxPages ?? 12;
  const out: NormalizedTransaction[] = [];
  const seen = new Set<string>();

  let page = 1;
  let pageCount = 1;
  do {
    let resp: EspnTxResp;
    try {
      const res = await fetch(`${BASE}/${sport}/transactions?limit=50&page=${page}`, {
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      });
      if (!res.ok) break;
      resp = (await res.json()) as EspnTxResp;
    } catch {
      break;
    }
    pageCount = resp.pageCount ?? 1;
    for (const t of resp.transactions ?? []) {
      if (!t.description || !t.date) continue;
      const id = synthId(league, t.date, t.description);
      if (seen.has(id)) continue;
      seen.add(id);
      const { playerName, position } = parsePlayer(t.description);
      out.push({
        id,
        league,
        date: new Date(t.date),
        teamId: t.team?.id ?? null,
        teamName: t.team?.displayName ?? null,
        teamAbbr: t.team?.abbreviation ?? null,
        teamLogo: pickLogo(t.team) ?? null,
        description: t.description.trim(),
        category: classifyTransaction(t.description),
        playerName: playerName ?? null,
        position: position ?? null,
      });
    }
    page++;
    await new Promise((r) => setTimeout(r, 200));
  } while (page <= pageCount && page <= maxPages);

  return out;
}
