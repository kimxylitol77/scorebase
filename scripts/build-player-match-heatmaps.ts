// TheStatsAPI 경기별 선수 히트맵(원시 터치 좌표) 수집 → data/player-match-heatmaps.json
// 선수별 시즌 경기 목록을 받아 경기당 1콜로 좌표를 쌓는다. 이미 수집된 경기는 건너뜀(멱등, 재실행 안전).
//   실행: THESTATSAPI_KEY=... npx tsx scripts/build-player-match-heatmaps.ts
// 확장: PLAYERS 배열에 선수 추가 (ourId=TheSports id, 나머지=TheStatsAPI id — players?search= 로 조회)
import { readFileSync, writeFileSync, existsSync } from "fs";
import { heatmapSeasonLabel } from "../src/lib/players/heatmap-season-label";

const KEY = process.env.THESTATSAPI_KEY;
if (!KEY) { console.error("THESTATSAPI_KEY 필요"); process.exit(1); }
const BASE = "https://api.thestatsapi.com/api";
const OUT = new URL("../data/player-match-heatmaps.json", import.meta.url).pathname;

// 선수 매핑은 discover-thestatsapi-players.ts 가 생성하는 map 파일에서 로드.
// 시즌 히트맵(analysis)이 없는 선수는 스킵 — 히트맵 미지원 리그/선수에 경기당 헛콜 38회를 막는 게이트.
const MAP_PATH = new URL("../data/thestatsapi-player-map.json", import.meta.url).pathname;
const ANALYSIS_PATH = new URL("../data/player-heatmap-analysis.json", import.meta.url).pathname;
const hasSeasonHeatmap = new Set(
  existsSync(ANALYSIS_PATH) ? Object.keys(JSON.parse(readFileSync(ANALYSIS_PATH, "utf8"))) : [],
);
const PLAYERS = Object.entries(
  JSON.parse(readFileSync(MAP_PATH, "utf8")) as Record<
    string,
    { statsId: string; teamId: string; competitionId: string; seasonId: string; seasonLabel: string; name: string }
  >,
)
  .map(([ourId, m]) => ({ ourId, ...m }))
  .filter((p) => {
    if (hasSeasonHeatmap.has(p.ourId)) return true;
    console.log(`스킵(시즌 히트맵 없음): ${p.name}`);
    return false;
  });

// 국내 컵 + 유럽 대항전 — 리그 경기만 모으면 FA컵·챔스 경기가 통째로 빠진다.
// 2026-08-28 실측: 5대 국내컵과 UCL 모두 히트맵을 준다(야말 UCL 24/25 529포인트).
// ⚠ 특정 선수가 404 인 건 커버리지 구멍이 아니라 **그 대회에 아직 안 뛴 것**이다 —
//   스타 선수로만 찔러 보면 컵 전체가 미제공인 것처럼 오판한다(실제로 한 번 오판했다).
const UEFA = ["comp_3498", "comp_7739", "comp_408698"]; // UCL · 유로파 · 컨퍼런스
const EXTRA_COMPS: Record<string, string[]> = {
  EPL: ["comp_7428", "comp_2504", ...UEFA], // FA컵 · EFL컵
  LALIGA: ["comp_7915", ...UEFA], // 코파 델 레이
  SERIE_A: ["comp_8525", ...UEFA], // 코파 이탈리아
  BUNDESLIGA: ["comp_3620", ...UEFA], // DFB 포칼
  LIGUE_1: ["comp_4750", ...UEFA], // 쿠프 드 프랑스
  // 유럽 대항전에 나가는 나머지 리그 — 국내컵은 미확인이라 대항전만 붙인다
  EREDIVISIE: UEFA, PRIMEIRA_LIGA: UEFA, SUPER_LIG: UEFA, JUPILER_PL: UEFA, SPL: UEFA,
};

interface MatchHeatmap {
  id: string;
  date: string; // YYYY-MM-DD (UTC)
  opp: string; // 상대 영문명 (표시 시 toKoreanTeamName)
  ha: "H" | "A";
  score: string; // "3-0"
  result: "W" | "D" | "L";
  points: Array<[number, number]>;
}

// 429(rate limit)는 백오프 후 재시도, 404(무데이터)는 null — 이 구분이 없으면 한도 걸린 경기가 "무데이터"로 오기록된다
async function api(path: string): Promise<unknown | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    // 네트워크 오류(EHOSTUNREACH 등)도 재시도한다 — 감싸지 않으면 fetch 의 throw 가 이 루프를
    // 뚫고 나가 스크립트가 통째로 죽는다 (2026-08-15 맥미니 IPv6 경로 끊김으로 발굴 321건 소실).
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        headers: { Authorization: `Bearer ${KEY}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 5_000 * (attempt + 1)));
      continue;
    }
    if (res.status === 429) {
      const wait = 20_000 * (attempt + 1);
      console.log(`  429 — ${wait / 1000}s 대기 후 재시도 (${path.slice(0, 60)})`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (res.status === 404) return null;
    // 5xx 는 공급자 쪽 일시 오류다 — 429 와 같이 물러섰다 재시도한다. 안 그러면 500 한 번에
    // 스테이지가 통째로 죽는다 (2026-08-27 라리가 26/27 matches 500 으로 리그1·시즌카드 전멸).
    if (res.status >= 500) {
      if (attempt < 3) { await new Promise((r) => setTimeout(r, 10_000 * (attempt + 1))); continue; }
    }
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    return res.json();
  }
  throw new Error(`429 지속 ${path}`);
}

// 컵 대회의 같은 시즌 id 해소 (대회당 1콜, 캐시). 시즌 표기는 리그와 같은 "26/27" 형태.
const cupSeason = new Map<string, string | null>();
async function cupSeasonId(comp: string, tag: string): Promise<string | null> {
  const k = `${comp}:${tag}`;
  if (cupSeason.has(k)) return cupSeason.get(k)!;
  const res = (await api(`/football/competitions/${comp}/seasons`)) as { data: { id: string; name: string }[] } | null;
  const hit = res?.data?.find((x) => x.name.includes(tag))?.id ?? null;
  cupSeason.set(k, hit);
  return hit;
}

async function main() {
  const out: Record<string, { seasonLabel: string; matches: MatchHeatmap[] }> = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, "utf8"))
    : {};

  // 같은 팀 선수들이 경기 목록을 공유하므로 팀 단위 캐시로 콜 절약
  type ApiMatch = {
    id: string; utc_date: string; status: string;
    home_team: { id: string; name: string }; away_team: { id: string; name: string };
    score: { home: number | null; away: number | null };
  };
  const teamMatchCache = new Map<string, ApiMatch[]>();

  for (const p of PLAYERS) {
    try {
      const existing = new Set((out[p.ourId]?.matches ?? []).map((m) => m.id));
      // 리그 + 그 리그의 컵·대항전. 시즌 태그는 리그 라벨에서 뽑는다 ("2026-27 EPL" → "26/27").
      const league = p.seasonLabel.split(" ").slice(1).join(" ");
      // "2026-27 EPL" → "26/27" · "2026 K_LEAGUE_1" → "2026" (달력 시즌 리그)
      const yr = p.seasonLabel.split(" ")[0];
      const tag = /^\d{4}-\d{2}$/.test(yr) ? `${yr.slice(2, 4)}/${yr.slice(5, 7)}` : yr;
      const pairs = [{ comp: p.competitionId, season: p.seasonId }];
      for (const c of EXTRA_COMPS[league] ?? []) {
        const sid = await cupSeasonId(c, tag);
        if (sid) pairs.push({ comp: c, season: sid });
      }

      const finished: ApiMatch[] = [];
      for (const pr of pairs) {
        const ck = `${pr.comp}:${p.teamId}`;
        let matches = teamMatchCache.get(ck);
        if (!matches) {
          matches = [];
          for (let page = 1; page <= 5; page++) {
            const res = (await api(
              `/football/matches?competition_id=${pr.comp}&season_id=${pr.season}&team_id=${p.teamId}&per_page=50&page=${page}`,
            )) as { data: ApiMatch[] } | null;
            await new Promise((r) => setTimeout(r, 6000));
            if (!res) break;
            matches.push(...res.data);
            if (res.data.length < 50) break;
          }
          teamMatchCache.set(ck, matches);
        }
        finished.push(...matches.filter((m) => m.status === "finished"));
      }
      finished.sort((a, b) => b.utc_date.localeCompare(a.utc_date));
      console.log(`${p.ourId}: 종료 경기 ${finished.length}(대회 ${pairs.length}), 기수집 ${existing.size}`);

      const rows: MatchHeatmap[] = out[p.ourId]?.matches ?? [];
      let added = 0, empty = 0;
      for (const m of finished) {
        if (existing.has(m.id)) continue;
        const hm = (await api(`/football/matches/${m.id}/players/${p.statsId}/heatmap`)) as {
          data: { points: Array<{ x: number; y: number }> };
        } | null;
        await new Promise((r) => setTimeout(r, 6000)); // trial 분당 12회 — 결과와 무관하게 콜마다 간격
        const points = hm?.data?.points ?? [];
        if (points.length === 0) { empty++; continue; } // 404/빈 배열 = 미출전 또는 소스 무데이터
        const isHome = m.home_team.id === p.teamId;
        const us = isHome ? m.score.home : m.score.away;
        const them = isHome ? m.score.away : m.score.home;
        rows.push({
          id: m.id,
          date: m.utc_date.slice(0, 10),
          opp: isHome ? m.away_team.name : m.home_team.name,
          ha: isHome ? "H" : "A",
          score: `${us}-${them}`,
          result: us === them ? "D" : (us ?? 0) > (them ?? 0) ? "W" : "L",
          points: points.map((pt) => [pt.x, pt.y]),
        });
        added++;
      }
      rows.sort((a, b) => b.date.localeCompare(a.date));
      // 라벨은 매핑의 현재 시즌이 아니라 실제 경기 날짜에서 뽑는다 — 소스가 새 시즌 좌표를
      // 아직 안 주는 선수에게 새 시즌 딱지가 붙던 버그(2026-09-05 모건 로져스).
      out[p.ourId] = { seasonLabel: heatmapSeasonLabel(p.seasonLabel, rows), matches: rows };
      writeFileSync(OUT, JSON.stringify(out)); // 선수 단위 저장 — 중단돼도 진행분 보존
      console.log(`  신규 ${added}, 미출전/무데이터 ${empty}, 총 ${rows.length}경기`);
    } catch (e) {
      // 한 선수 실패로 전체가 죽지 않게 — 팀 매치 캐시는 부분 결과일 수 있으니 버린다.
      // 진행분은 선수 단위로 이미 저장됐고, 다음 회차가 멱등으로 다시 집는다.
      for (const k of [...teamMatchCache.keys()]) if (k.endsWith(`:${p.teamId}`)) teamMatchCache.delete(k);
      console.log(`  ⚠ ${p.ourId} 건너뜀 — ${(e as Error).message}`);
    }
  }

  console.log(`저장: ${OUT}`);
}
main();
