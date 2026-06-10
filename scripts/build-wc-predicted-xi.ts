// 월드컵 예상 라인업 빌드 → data/wc-predicted-xi.json
// 최근 국제경기(친선 + 본선) 확정 XI 가중 투표 (최근 경기 w3 → w2 → w1) 로
// 국가별 예상 선발 11명 + 신뢰도 산출. 라인업 발표(킥오프 ~1h 전) 전까지
// 매치 페이지 예정 상태에 노출 — 확정 도착 시 자동 교체.
//
// cron-wc-xi.sh (매일 07:00, 이 맥북) 에서 build-world-cup-xi 와 함께 실행.
// 조별리그 진행 중엔 직전 본선 경기 XI 가 자동으로 최고 가중치가 된다.
import { PrismaClient } from "@prisma/client";
import { WORLD_CUP_GROUPS } from "../src/lib/predict/world-cup-elos";
import * as fs from "fs";

const prisma = new PrismaClient();
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s.&·'-]/g, "");

interface LuPlayer { id?: string; first?: number; name?: string; position?: string; shirt_number?: number; rating?: string }
interface PredictedPlayer {
  id: string; name: string; nameKo?: string; position: string; shirtNumber?: number;
  /** 최근 경기 선발 횟수 / 입력 경기 수 */
  starts: number; games: number;
  /** 0~1 — 가중 투표 점유율 */
  confidence: number;
}

const POS_SLOTS: Record<string, number> = { G: 1, D: 4, M: 4, F: 2 }; // fallback 4-4-2

function slotsFromFormation(f: string | undefined): Record<string, number> {
  // "4-2-3-1" → D4 M5 F1 (중간 블록 전부 M 취급), G 1 고정
  if (!f) return POS_SLOTS;
  const parts = f.split("-").map((n) => parseInt(n, 10)).filter(Number.isFinite);
  if (parts.length < 2 || parts.reduce((a, b) => a + b, 0) !== 10) return POS_SLOTS;
  const d = parts[0];
  const fw = parts[parts.length - 1];
  const m = 10 - d - fw;
  return { G: 1, D: d, M: m, F: fw };
}

async function main() {
  const countries = Object.values(WORLD_CUP_GROUPS).flat();
  const byNorm = new Map(countries.map((c) => [norm(c), c]));

  // 본선국 팀 row (INTL_FRIENDLY/WORLD_CUP 소속 국가대표 팀)
  const teams = await prisma.team.findMany({
    where: { league: { in: ["INTL_FRIENDLY", "WORLD_CUP"] } },
    select: { id: true, name: true },
  });
  const teamIdToCountry = new Map<number, string>();
  for (const t of teams) {
    const c = byNorm.get(norm(t.name));
    if (c) teamIdToCountry.set(t.id, c);
  }

  // 국가별 최근 확정 XI 수집 (최신순) — 친선 + 본선
  const rows = await prisma.theSportsMatchCache.findMany({
    where: {
      match: {
        league: { in: ["INTL_FRIENDLY", "WORLD_CUP"] },
        status: "FINISHED",
        startTime: { gte: new Date(Date.now() - 45 * 86400e3) },
      },
    },
    orderBy: { match: { startTime: "desc" } },
    select: { lineup: true, match: { select: { homeTeamId: true, awayTeamId: true, startTime: true } } },
  });

  const xisByCountry = new Map<string, { players: LuPlayer[]; formation?: string }[]>();
  for (const r of rows) {
    const lu = r.lineup as { confirmed?: number; home_formation?: string; away_formation?: string; lineup?: { home?: LuPlayer[] | Record<string, LuPlayer>; away?: LuPlayer[] | Record<string, LuPlayer> } } | null;
    if (!lu || lu.confirmed !== 1 || !lu.lineup) continue;
    for (const side of ["home", "away"] as const) {
      const teamId = side === "home" ? r.match.homeTeamId : r.match.awayTeamId;
      const country = teamIdToCountry.get(teamId);
      if (!country) continue;
      const starters = Object.values(lu.lineup[side] ?? {}).filter((p) => p?.first === 1 && p.id && p.name);
      if (starters.length < 10) continue;
      const arr = xisByCountry.get(country) ?? [];
      if (arr.length >= 4) continue; // 최근 4경기까지
      arr.push({ players: starters, formation: side === "home" ? lu.home_formation : lu.away_formation });
      xisByCountry.set(country, arr);
    }
  }

  // 한글명 일괄 로드
  const allIds = new Set<string>();
  for (const xis of xisByCountry.values()) for (const xi of xis) for (const p of xi.players) allIds.add(p.id!);
  const koRows = await prisma.theSportsPlayer.findMany({
    where: { id: { in: [...allIds] }, nameKo: { not: null } },
    select: { id: true, nameKo: true },
  });
  const koById = new Map(koRows.map((r) => [r.id, r.nameKo!]));

  // 국가별 가중 투표 → 포메이션 슬롯별 상위 선발
  const out: Record<string, { formation: string; basedOnGames: number; updatedAt: string; xi: PredictedPlayer[] }> = {};
  for (const [country, xis] of xisByCountry) {
    const weights = [3, 2, 1, 1]; // 최신 → 과거
    const vote = new Map<string, { p: LuPlayer; score: number; starts: number }>();
    let totalW = 0;
    xis.forEach((xi, i) => {
      const w = weights[i] ?? 1;
      totalW += w;
      for (const p of xi.players) {
        const e = vote.get(p.id!) ?? { p, score: 0, starts: 0 };
        e.score += w;
        e.starts += 1;
        vote.set(p.id!, e);
      }
    });
    const formation = xis[0].formation || "4-4-2";
    const slots = slotsFromFormation(formation);
    const ranked = [...vote.values()].sort((a, b) => b.score - a.score);
    const xi: PredictedPlayer[] = [];
    for (const pos of ["G", "D", "M", "F"]) {
      const need = slots[pos];
      const picked = ranked
        .filter((e) => (e.p.position ?? "M") === pos && !xi.some((x) => x.id === e.p.id))
        .slice(0, need);
      for (const e of picked) {
        xi.push({
          id: e.p.id!, name: e.p.name!, nameKo: koById.get(e.p.id!) ?? undefined,
          position: pos, shirtNumber: e.p.shirt_number,
          starts: e.starts, games: xis.length,
          confidence: +(e.score / totalW).toFixed(2),
        });
      }
    }
    // 포지션 데이터 빈 슬롯은 전체 랭킹에서 채움 (11명 보장)
    for (const e of ranked) {
      if (xi.length >= 11) break;
      if (!xi.some((x) => x.id === e.p.id)) {
        xi.push({
          id: e.p.id!, name: e.p.name!, nameKo: koById.get(e.p.id!) ?? undefined,
          position: e.p.position ?? "M", shirtNumber: e.p.shirt_number,
          starts: e.starts, games: xis.length,
          confidence: +(e.score / totalW).toFixed(2),
        });
      }
    }
    if (xi.length === 11) {
      out[country] = { formation, basedOnGames: xis.length, updatedAt: new Date().toISOString(), xi };
    }
  }

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/wc-predicted-xi.json", JSON.stringify(out, null, 1));
  console.log(`예상 XI 생성: ${Object.keys(out).length}개국 → data/wc-predicted-xi.json`);
  const sample = out["Mexico"] ?? out[Object.keys(out)[0]];
  if (sample) {
    console.log(`샘플 (${out["Mexico"] ? "Mexico" : Object.keys(out)[0]}, ${sample.formation}, ${sample.basedOnGames}경기 기반):`);
    sample.xi.forEach((p) => console.log(`  ${p.position} ${p.nameKo ?? p.name} (선발 ${p.starts}/${p.games}, conf ${p.confidence})`));
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
