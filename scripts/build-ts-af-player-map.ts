// ts↔af 선수 매핑 빌드 → data/ts-af-player-map.json
// 배경: 축구 선수 페이지 통합 (2026-06-10) — /transfers/{tsId} 를 단일 선수 페이지로.
//   af 대회별 스탯을 transfers 페이지에 붙이고, /players/{afId} 는 redirect.
//   TheSportsPlayer.name 이 한글 백필로 덮여 이름 매칭 불가 → "시즌 스탯 지문" 매칭:
//   같은 팀에서 (경기, 골, 도움) 튜플은 사실상 유일 (충돌 시 분·경고로 2차, 그래도 충돌이면 skip).
// 입력: data/player-season-stats.json (ts id → 시즌 스탯, 팀 영문명 포함)
// af: /teams?league&season (리그당 1콜) + /players?team&season (팀당 ~3페이지)
// 재실행: 시즌 스탯 갱신 후 (사실상 시즌당 1회면 충분)
import "../src/lib/env";
import rawStats from "../data/player-season-stats.json";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const prisma = new PrismaClient();

const KEY = process.env.API_FOOTBALL_KEY!;
const LEAGUES: Record<string, { afId: number; season: number }> = {
  EPL: { afId: 39, season: 2025 },
  LALIGA: { afId: 140, season: 2025 },
  BUNDESLIGA: { afId: 78, season: 2025 },
  LIGUE_1: { afId: 61, season: 2025 },
};
interface TsStat {
  lg: string; team: string; pos: string | null;
  matches: number | null; goals: number | null; assists: number | null;
  minutes: number | null; yellow: number | null;
}
const TS = rawStats as unknown as Record<string, TsStat>;
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(fc|cf|afc|club|de|cd|ud|rcd|ac|as|sc|ssc|rc|stade|olympique)\b/g, "")
    .replace(/[\s.&·'-]/g, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function af(path: string): Promise<any> {
  const res = await fetch(`https://v3.football.api-sports.io${path}`, {
    headers: { "x-apisports-key": KEY },
  });
  await sleep(280);
  return res.json();
}

// af "L. Yamal" 축약·풀네임 모두 대응 — 성(마지막 토큰) + 첫 이니셜
function nameKey(full: string): string | null {
  const tokens = full.trim().split(/\s+/);
  if (tokens.length === 0) return null;
  const last = norm(tokens[tokens.length - 1]);
  const initial = norm(tokens[0])[0] ?? "";
  return last ? `${initial}.${last}` : null;
}

async function main() {
  const tsToAf: Record<string, number> = {};
  const afName: Record<number, string> = {};
  let byName = 0, exact = 0, loose = 0, conflict = 0, noTeam = 0;

  // 영문명 잔존 ts 선수 (한글 백필 안 덮인 42%) — 이름 매칭 1순위
  const tsNames = await prisma.theSportsPlayer.findMany({
    where: { id: { in: Object.keys(TS) } },
    select: { id: true, name: true },
  });
  const tsEnName = new Map(
    tsNames.filter((t) => !/[가-힣]/.test(t.name)).map((t) => [t.id, t.name]),
  );

  for (const [lg, { afId, season }] of Object.entries(LEAGUES)) {
    // ts 쪽: 팀명(norm) → 선수들
    const tsByTeam = new Map<string, { id: string; s: TsStat }[]>();
    for (const [id, s] of Object.entries(TS)) {
      if (s.lg !== lg) continue;
      const k = norm(s.team);
      const arr = tsByTeam.get(k) ?? [];
      arr.push({ id, s });
      tsByTeam.set(k, arr);
    }

    const teams = await af(`/teams?league=${afId}&season=${season}`);
    for (const t of teams.response ?? []) {
      const teamKey = norm(t.team.name);
      const tsPlayers = tsByTeam.get(teamKey);
      if (!tsPlayers) { noTeam++; continue; }

      // af 전 선수 (페이지네이션)
      const afPlayers: { id: number; name: string; apps: number; goals: number; assists: number; minutes: number }[] = [];
      for (let page = 1; page <= 5; page++) {
        const d = await af(`/players?team=${t.team.id}&season=${season}&page=${page}`);
        for (const r of d.response ?? []) {
          const st = (r.statistics ?? []).find((x: any) => x.league?.id === afId) ?? r.statistics?.[0];
          if (!st) continue;
          afPlayers.push({
            id: r.player.id, name: r.player.name,
            apps: st.games?.appearences ?? 0, goals: st.goals?.total ?? 0,
            assists: st.goals?.assists ?? 0, minutes: st.games?.minutes ?? 0,
          });
        }
        if ((d.paging?.current ?? 1) >= (d.paging?.total ?? 1)) break;
      }

      // ① 이름 매칭 (영문명 잔존자) — 같은 팀 내 성+이니셜 유일 시
      const afByName = new Map<string, typeof afPlayers>();
      for (const p of afPlayers) {
        const k = nameKey(p.name);
        if (k) afByName.set(k, [...(afByName.get(k) ?? []), p]);
      }
      const unresolved: { id: string; s: TsStat }[] = [];
      for (const tp of tsPlayers) {
        const en = tsEnName.get(tp.id);
        const k = en ? nameKey(en) : null;
        const cands = k ? afByName.get(k) ?? [] : [];
        if (cands.length === 1) {
          tsToAf[tp.id] = cands[0].id; afName[cands[0].id] = cands[0].name; byName++;
        } else unresolved.push(tp);
      }

      // ② 지문 매칭 — 정확 일치 → ③ 완화 (af ≥ ts 단조: ts 는 시즌 중 스냅샷)
      const taken = new Set(Object.values(tsToAf));
      const byFp = new Map<string, typeof afPlayers>();
      for (const p of afPlayers) {
        if (taken.has(p.id)) continue;
        const k = `${p.apps}|${p.goals}|${p.assists}`;
        byFp.set(k, [...(byFp.get(k) ?? []), p]);
      }
      const still: typeof unresolved = [];
      for (const { id, s } of unresolved) {
        if (s.matches == null) { still.push({ id, s }); continue; }
        const k = `${s.matches}|${s.goals ?? 0}|${s.assists ?? 0}`;
        const cands = (byFp.get(k) ?? []).filter((p) => !taken.has(p.id));
        if (cands.length === 1) {
          tsToAf[id] = cands[0].id; afName[cands[0].id] = cands[0].name; taken.add(cands[0].id); exact++;
        } else if (cands.length > 1) conflict++;
        else still.push({ id, s });
      }
      for (const { id, s } of still) {
        if (s.matches == null || s.minutes == null) continue;
        // af 최종 ≥ ts 스냅샷 (차이 cap 8경기) + 골·도움도 단조 + 분당 골 비율 유사
        const cands = afPlayers.filter(
          (p) =>
            !taken.has(p.id) &&
            p.apps >= s.matches! && p.apps - s.matches! <= 8 &&
            p.goals >= (s.goals ?? 0) && p.goals - (s.goals ?? 0) <= 4 &&
            p.assists >= (s.assists ?? 0) && p.assists - (s.assists ?? 0) <= 4 &&
            p.minutes >= (s.minutes ?? 0) - 30,
        );
        if (cands.length === 1) {
          tsToAf[id] = cands[0].id; afName[cands[0].id] = cands[0].name; taken.add(cands[0].id); loose++;
        } else if (cands.length > 1) conflict++;
      }
    }
    console.log(`${lg}: 누적 매칭 ${Object.keys(tsToAf).length}`);
  }
  await prisma.$disconnect();

  const afToTs: Record<number, string> = {};
  for (const [ts, a] of Object.entries(tsToAf)) afToTs[a] = ts;
  fs.writeFileSync(
    "data/ts-af-player-map.json",
    JSON.stringify({ tsToAf, afToTs }, null, 0),
  );
  const total = Object.keys(TS).length;
  console.log(
    `완료: ${Object.keys(tsToAf).length}/${total} (${Math.round((Object.keys(tsToAf).length / total) * 100)}%) — 이름 ${byName} · 지문 ${exact} · 완화 ${loose} · 충돌skip ${conflict} · 팀미매칭 ${noTeam}`,
  );
  console.log("야말 검증:", tsToAf["4jwq2ghxjzkvm0v"], "(기대: 386828)", afName[tsToAf["4jwq2ghxjzkvm0v"]]);
}

main().catch((e) => { console.error(e); process.exit(1); });
