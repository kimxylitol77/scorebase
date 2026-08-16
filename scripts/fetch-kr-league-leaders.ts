// 한국 리그(KBL·WKBL·V-리그 남녀) 시즌 선수 리더보드 적재 — 공식 사이트 API/크롤.
//   npx tsx --env-file=.env.local scripts/fetch-kr-league-leaders.ts
//
// 2025-26 최종 기록 백필용(2026-08-16). 시즌 코드가 하드코딩이라 새 시즌엔 아래 상수를
// 갱신해 재실행한다 — KBL glkey(S47G01), WKBL season_gu(046), KOVO seasonCode(022).
// 저장은 LeagueLeader upsert(리그·카테고리·순위·시즌 unique) — 재실행 멱등.
import { load } from "cheerio";
import { prisma } from "@/lib/db";

const SEASON = "2025-26";
const KBL_GLKEY = "S47G01"; // 2025-2026 정규시즌
const WKBL_SEASON_GU = "046"; // 2025-2026
const KOVO_SEASON = "022"; // 진에어 2025~2026 V-리그
const TOP_N = 5;

interface Row {
  rank: number;
  playerName: string;
  teamName: string;
  value: number;
  appearances: number | null;
  unit: string | null;
  externalId?: string | null;
  photoUrl?: string | null;
}

type Bundle = Record<string, Row[]>; // category → rows

// ── KBL — api-stats.kbl.or.kr 전 선수 평균(규정 경기수 필터) 1콜 → 로컬 정렬 ──
async function fetchKbl(): Promise<Bundle> {
  const url =
    `https://api-stats.kbl.or.kr/api/records/player/general/traditional?seasonCode=${KBL_GLKEY.slice(1, 3)}` +
    `&gameCode=01&sortDataSc=SCORE&sortOrderSc=desc&listCn=120&pageNo=1&ruleCk=1&perCn=1&lastCn=0&partIfList=0&draftNo=0`;
  const res = await fetch(url, { headers: { Origin: "https://kbl.or.kr", Referer: "https://kbl.or.kr/" } });
  if (!res.ok) throw new Error(`kbl http ${res.status}`);
  const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
  const players = (body.data ?? []).map((p) => ({
    name: String(p.kname ?? ""),
    team: String(p.teamName1 ?? ""),
    games: Number(p.gameCount ?? 0),
    id: p.playerNo ? String(p.playerNo) : null,
    score: Number(p.score ?? 0),
    rb: Number(p.rb ?? 0),
    as: Number(p.aS ?? 0),
    st: Number(p.sT ?? 0),
    bs: Number(p.bS ?? 0),
  })).filter((p) => p.name);
  const top = (key: "score" | "rb" | "as" | "st" | "bs", unit: string): Row[] =>
    [...players].sort((a, b) => b[key] - a[key]).slice(0, TOP_N).map((p, i) => ({
      rank: i + 1, playerName: p.name, teamName: p.team,
      value: Math.round(p[key] * 10) / 10, appearances: p.games, unit, externalId: p.id,
    }));
  return {
    PTS: top("score", "평균 득점"),
    REB: top("rb", "평균 리바운드"),
    AST: top("as", "평균 어시스트"),
    STL: top("st", "평균 스틸"),
    BLK: top("bs", "평균 블록"),
  };
}

// ── WKBL — wkbl.or.kr 부문별 ajax HTML 표. 마지막 셀 = 평균값, 4번째 = 경기수 ──
async function fetchWkblPart(part: string): Promise<Row[]> {
  const res = await fetch("https://www.wkbl.or.kr/game/ajax/ajax_player_record.asp", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: new URLSearchParams({ season_gu: WKBL_SEASON_GU, game_type: "01", part }),
  });
  if (!res.ok) throw new Error(`wkbl ${part} http ${res.status}`);
  const $ = load(await res.text());
  const rows: Row[] = [];
  $("tr").each((_, tr) => {
    const cells = $(tr).find("td").map((__, td) => $(td).text().replace(/\s+/g, " ").trim()).get();
    if (cells.length < 6 || rows.length >= TOP_N) return;
    const rank = Number(cells[0]);
    const value = Number(cells[cells.length - 1]);
    if (!Number.isFinite(rank) || !Number.isFinite(value)) return;
    rows.push({
      rank, playerName: cells[1], teamName: cells[2],
      value, appearances: Number(cells[3]) || null, unit: null,
    });
  });
  return rows;
}

async function fetchWkbl(): Promise<Bundle> {
  const withUnit = (rows: Row[], unit: string) => rows.map((r) => ({ ...r, unit }));
  return {
    PTS: withUnit(await fetchWkblPart("point"), "평균 득점"),
    REB: withUnit(await fetchWkblPart("rebound"), "평균 리바운드"),
    AST: withUnit(await fetchWkblPart("assist"), "평균 어시스트"),
    STL: withUnit(await fetchWkblPart("steal"), "평균 스틸"),
    BLK: withUnit(await fetchWkblPart("block"), "평균 블록"),
  };
}

// ── V-리그 — user-api.kovo.co.kr 부문별 rank API. sup = 표시값, pname/tsname 한글 ──
const KOVO_PARTS: Array<{ category: string; rpart: string; unit: string }> = [
  { category: "VB_POINTS", rpart: "point", unit: "득점" },
  { category: "VB_ATTACK", rpart: "at", unit: "성공률 %" },
  { category: "VB_BLOCK", rpart: "b", unit: "세트당" },
  { category: "VB_SERVE", rpart: "s", unit: "세트당" },
  { category: "VB_SET", rpart: "set", unit: "세트당" },
  { category: "VB_RECEIVE", rpart: "r", unit: "효율 %" },
];

async function fetchKovo(gender: 1 | 2): Promise<Bundle> {
  const out: Bundle = {};
  for (const { category, rpart, unit } of KOVO_PARTS) {
    const url =
      `https://user-api.kovo.co.kr/stat/league/player-rank?seasonCode=${KOVO_SEASON}` +
      `&gender=${gender}&leagueCode=201&round=0&rpart=${rpart}&sort=rank,asc&page=0&size=${TOP_N}`;
    const res = await fetch(url, {
      headers: { Origin: "https://kovo.co.kr", Referer: "https://kovo.co.kr/", "Accept-Language": "ko" },
    });
    if (!res.ok) throw new Error(`kovo ${rpart} http ${res.status}`);
    const body = (await res.json()) as {
      payload?: Array<Record<string, unknown>> | { content?: Array<Record<string, unknown>> };
    };
    // rpart 에 따라 payload 가 배열 또는 {content: 배열} 페이지 응답으로 갈린다 (실측)
    const list = Array.isArray(body.payload) ? body.payload : body.payload?.content ?? [];
    out[category] = list.slice(0, TOP_N).map((p) => ({
      rank: Number(p.rank ?? 0),
      playerName: String(p.pname ?? ""),
      teamName: String(p.tsname ?? ""),
      value: Number(p.sup ?? 0),
      appearances: Number(p.g_count ?? 0) || null,
      unit,
      externalId: p.pcode ? String(p.pcode) : null,
      photoUrl: p.image ? String(p.image) : null,
    })).filter((r) => r.playerName && r.rank > 0);
    await new Promise((r) => setTimeout(r, 200));
  }
  return out;
}

async function save(league: string, bundle: Bundle) {
  const ops = [];
  for (const [category, rows] of Object.entries(bundle)) {
    for (const r of rows) {
      ops.push(prisma.leagueLeader.upsert({
        where: { league_category_rank_season: { league, category, rank: r.rank, season: SEASON } },
        create: {
          league, category, rank: r.rank, season: SEASON,
          playerName: r.playerName, teamName: r.teamName,
          value: r.value, unit: r.unit, appearances: r.appearances,
          externalId: r.externalId ?? null, photoUrl: r.photoUrl ?? null,
        },
        update: {
          playerName: r.playerName, teamName: r.teamName,
          value: r.value, unit: r.unit, appearances: r.appearances,
          externalId: r.externalId ?? null, photoUrl: r.photoUrl ?? null,
        },
      }));
    }
  }
  await prisma.$transaction(ops);
  const counts = Object.entries(bundle).map(([c, rows]) => `${c}:${rows.length}`).join(" ");
  console.log(`${league} → ${counts}`);
}

async function main() {
  await save("KBL", await fetchKbl());
  await save("WKBL", await fetchWkbl());
  await save("V_LEAGUE", await fetchKovo(1));
  await save("V_LEAGUE_W", await fetchKovo(2));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
