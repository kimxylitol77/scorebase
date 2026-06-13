// ESPN 비공식 트랜잭션 API — 북미 종목(NBA/MLB/NHL) 트레이드·FA·방출·단기계약·감독 인사.
// 무료·무인증·Vercel 직접 호출 가능(IP whitelist 불필요). 세 종목 응답 형태 동일.
//
// 엔드포인트: site.api.espn.com/apis/site/v2/sports/{sport}/{league}/transactions
//   ?limit=N (페이지당) — pageCount 만큼 page 파라미터로 순회.
//
// ESPN 응답엔 안정적 고유 id 가 없어 우리가 합성(league:date:desc 해시) → 멱등 upsert.

import crypto from "crypto";
import { generate } from "@/lib/ai/claude";

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

/** 트랜잭션 영문 설명 배열 → 한글 번역 배열 (Haiku 배치). 선수명 한국 표기·팀명 한글·간결.
 *  입력과 같은 길이/순서로 반환, 실패분은 빈 문자열 → caller 가 영문 fallback. */
export async function translateDescriptions(descriptions: string[]): Promise<string[]> {
  const out: string[] = new Array(descriptions.length).fill("");
  const BATCH = 30;
  for (let i = 0; i < descriptions.length; i += BATCH) {
    const chunk = descriptions.slice(i, i + BATCH);
    const numbered = chunk.map((d, j) => `${j + 1}. ${d}`).join("\n");
    const prompt = `다음 NBA 트랜잭션 영문 문장을 자연스러운 한국어로 번역해줘.
규칙:
- 선수·감독 이름은 한국 스포츠 미디어 통용 표기로 음역 (예: Jamahl Mosley→자말 모슬리, Stephen Curry→스테판 커리)
- 포지션 약자(G/F/C)는 생략, 팀명은 한국어
- 간결한 뉴스체 (예: "Hired Jamahl Mosley as head coach."→"자말 모슬리 감독 선임", "Signed F Trevon Scott to a 10-day contract."→"트레본 스콧과 10일 단기계약", "Waived G Tyreke Key."→"타이리크 키 방출")
- 트레이드 등 복합 문장은 핵심을 한 문장으로

입력(번호별):
${numbered}

반드시 아래 JSON 배열만 출력 (번호 순서대로, 다른 텍스트 금지):
["번역1","번역2",...]`;
    try {
      const res = await generate(prompt, { maxTokens: 4096, temperature: 0 });
      const m = res.match(/\[[\s\S]*\]/);
      if (m) {
        const arr = JSON.parse(m[0]) as string[];
        for (let j = 0; j < chunk.length && j < arr.length; j++) {
          if (typeof arr[j] === "string") out[i + j] = arr[j].trim();
        }
      }
    } catch {
      // 배치 실패 → 해당 구간 빈 문자열 유지 (영문 fallback)
    }
  }
  return out;
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
