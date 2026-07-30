// 드림팀 선수 풀 빌드 — 빅5 현역에 OVR·잠재력·몸값을 부여해 data/dream-pool.json 생성
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { toRadarAxes } from "@/lib/player-radar";

const prisma = new PrismaClient();
const BIG5 = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
const CAP: Record<string, number> = { goals: 0.8, assists: 0.6, keyPasses: 3.0, tackles: 4.5, interceptions: 2.5, shots: 3.5, sot: 1.5, saves: 4.0 };
const W: Record<string, Record<string, number>> = {
  FW: { goals: 0.34, sot: 0.16, assists: 0.14, keyPasses: 0.14, shots: 0.1, passAcc: 0.12 },
  MF: { keyPasses: 0.24, passAcc: 0.2, assists: 0.18, tackles: 0.14, goals: 0.12, interceptions: 0.12 },
  DF: { tackles: 0.3, interceptions: 0.28, passAcc: 0.22, keyPasses: 0.1, goals: 0.1 },
};
const p90 = (v: number, min: number) => (min > 0 ? (v || 0) / (min / 90) : 0);
const ax = (v: number, cap: number) => Math.min(100, (v / cap) * 100);
const grpOf = (p: string) => (p === "G" ? "GK" : p === "D" ? "DF" : p === "M" ? "MF" : "FW");

// data/player-season-stats.json 한 행 — 이 스크립트가 읽는 필드만.
interface SeasonStatRow {
  lg: string; team: string; pos: string;
  minutes?: number | null; goals?: number | null; assists?: number | null;
  shots?: number | null; sot?: number | null; keyPasses?: number | null;
  passAcc?: number | null; tackles?: number | null; interceptions?: number | null;
  saves?: number | null; cleanSheets?: number | null; matches?: number | null;
}
interface DreamPoolEntry {
  name: string; pos: string; rawPos: string; ovr: number; potential: number;
  value: number; age: number | null; team: string; league: string;
  photo: string | null; radar: unknown; saves: number;
  cleanSheets: number | null; matches: number;
}

function statRaw(s: SeasonStatRow, grp: string): number {
  const min = s.minutes || 0;
  const a: Record<string, number> = {
    goals: ax(p90(s.goals ?? 0, min), CAP.goals),
    assists: ax(p90(s.assists ?? 0, min), CAP.assists),
    keyPasses: ax(p90(s.keyPasses ?? 0, min), CAP.keyPasses),
    tackles: ax(p90(s.tackles ?? 0, min), CAP.tackles),
    interceptions: ax(p90(s.interceptions ?? 0, min), CAP.interceptions),
    shots: ax(p90(s.shots ?? 0, min), CAP.shots),
    sot: ax(p90(s.sot ?? 0, min), CAP.sot),
    passAcc: s.passAcc || 0,
  };
  const w = W[grp];
  let sum = 0;
  for (const k in w) sum += (a[k] || 0) * w[k];
  return sum;
}

// 나이 기반 성장폭 (잠재력 = ovr + 이 값, 99 상한)
function growthCap(age: number | null | undefined): number {
  if (!age) return 3;
  if (age <= 21) return 9;
  if (age <= 25) return 5;
  if (age <= 29) return 2;
  return 0;
}

async function main() {
  const stats = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/player-season-stats.json"), "utf8")) as Record<string, SeasonStatRow>;
  const mvs = await prisma.playerMarketValue.findMany({ where: { league: { in: BIG5 } }, select: { id: true, currentValue: true, age: true } });
  const mvMap = new Map(mvs.map((m) => [m.id, m]));

  // 팀 강함 = 팀 평균 몸값 퍼센타일
  const teamVals: Record<string, number[]> = {};
  for (const id in stats) {
    if (!BIG5.includes(stats[id].lg)) continue;
    const v = mvMap.get(id)?.currentValue;
    const t = stats[id].team;
    if (v && t) (teamVals[t] = teamVals[t] || []).push(v);
  }
  const teamAvg: Record<string, number> = {};
  for (const t in teamVals) teamAvg[t] = teamVals[t].reduce((a, b) => a + b, 0) / teamVals[t].length;
  const avgSorted = Object.values(teamAvg).sort((a, b) => a - b);
  const teamStrength = (t: string) => {
    const v = teamAvg[t];
    if (!v) return 50;
    return (avgSorted.filter((x) => x <= v).length / avgSorted.length) * 100;
  };

  const pool = Object.keys(stats).filter((id) => BIG5.includes(stats[id].lg) && mvMap.get(id)?.currentValue && (stats[id].minutes || 0) >= 900);

  // 1차 raw (포지션별)
  const groups: Record<string, { id: string; raw: number }[]> = { FW: [], MF: [], DF: [], GK: [] };
  for (const id of pool) {
    const g = grpOf(stats[id].pos);
    const ts = teamStrength(stats[id].team);
    let r: number;
    if (g === "GK") r = ax(p90(stats[id].saves || 0, stats[id].minutes || 0), CAP.saves) * 0.35 + ts * 0.65;
    else if (g === "DF") r = statRaw(stats[id], "DF") * 0.55 + ts * 0.45;
    else r = statRaw(stats[id], g);
    groups[g].push({ id, raw: r });
  }

  // 출전 가중 shrinkage (적게 뛴 선수는 포지션 평균쪽으로) → 퍼센타일 OVR
  const ovr = new Map<string, number>();
  for (const g in groups) {
    const arr = groups[g];
    const mean = arr.reduce((s, x) => s + x.raw, 0) / Math.max(1, arr.length);
    for (const x of arr) {
      const w = Math.min(1, (stats[x.id].minutes || 0) / 2000);
      x.raw = x.raw * w + mean * (1 - w);
    }
    const sorted = arr.map((x) => x.raw).sort((a, b) => a - b);
    for (const x of arr) {
      const rank = sorted.filter((v) => v <= x.raw).length / sorted.length;
      ovr.set(x.id, Math.round(50 + rank * 49));
    }
  }

  // 이름·사진
  const players = await prisma.theSportsPlayer.findMany({ where: { id: { in: pool } }, select: { id: true, nameKo: true, name: true, photoUrl: true } });
  const pm = new Map(players.map((p) => [p.id, p]));

  const out: Record<string, DreamPoolEntry> = {};
  for (const id of pool) {
    const s = stats[id];
    const mv = mvMap.get(id)!;
    const o = ovr.get(id)!;
    const p = pm.get(id);
    out[id] = {
      name: p?.nameKo || p?.name || s.team,
      pos: grpOf(s.pos),
      rawPos: s.pos,
      ovr: o,
      potential: Math.min(99, o + growthCap(mv.age)),
      value: mv.currentValue ? Math.max(1, Math.round(mv.currentValue / 1e6)) : 0,
      age: mv.age || null,
      team: s.team,
      league: s.lg,
      photo: p?.photoUrl || null,
      radar: toRadarAxes({ minutes: s.minutes ?? null, goals: s.goals ?? null, assists: s.assists ?? null, shots: s.shots ?? null, sot: s.sot ?? null, keyPasses: s.keyPasses ?? null, passAcc: s.passAcc ?? null, tackles: s.tackles ?? null, interceptions: s.interceptions ?? null }),
      saves: s.saves ?? 0,
      cleanSheets: s.cleanSheets ?? null,
      matches: s.matches ?? 0,
    };
  }

  const outPath = path.join(process.cwd(), "data/dream-pool.json");
  fs.writeFileSync(outPath, JSON.stringify(out));

  // 검증 로그
  const posCount: Record<string, number> = {};
  for (const id in out) posCount[out[id].pos] = (posCount[out[id].pos] || 0) + 1;
  console.log(`\n드림풀 빌드 완료: ${Object.keys(out).length}명 → data/dream-pool.json`);
  console.log("포지션 분포:", JSON.stringify(posCount));
  const prospects = Object.values(out).filter((v) => v.age && v.age <= 21).sort((a, b) => b.potential - a.potential).slice(0, 8);
  console.log("\n유망주 샘플 (성장 여지 큰 순):");
  for (const v of prospects) console.log(`   ${String(v.name).padEnd(16)} ${v.pos} ${v.age}세  OVR ${v.ovr}→${v.potential}  €${v.value}M`);
}
main().catch((e) => console.error("ERR:", e)).finally(() => prisma.$disconnect());
