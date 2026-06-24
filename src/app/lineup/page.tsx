// 라인업 전술판 — 포메이션 보드에 선수를 배치해 베스트 11/맞대결을 만들고 이미지 카드로 공유 (공개 도구).
import type { Metadata } from "next";
import { readFileSync } from "fs";
import path from "path";
import { allDreamPlayers } from "@/lib/dream-team/pool";
import { decodeBoard } from "@/lib/lineup/lineup-state";
import { prisma } from "@/lib/db";
import { toKoreanPlayerName } from "@/lib/player-names";
import { toKoreanTeamName } from "@/lib/team-names";
import LineupBuilder from "./LineupBuilder";
import type { ClubMeta, PoolPlayer } from "./types";
import AmbientGlow from "@/components/AmbientGlow";

export const metadata: Metadata = {
  title: "라인업 전술판 | Scorebase",
  description: "포메이션 보드에 빅5 현역 선수를 배치해 나만의 베스트 11과 맞대결 라인업을 만들고 이미지 카드로 공유하세요.",
};

// 클럽 표기 정규화 — "Barcelona"와 "FC Barcelona"를 한 그룹으로 묶기 위한 키.
function normClub(t: string): string {
  return t
    .toLowerCase()
    .replace(/\b(fc|cf|afc|cd|ac|ssc|as|rc|sc|ud|rcd|sd|ca)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

// 월드컵 국가별 예상 XI — data/wc-predicted-xi.json (48개국, formation+11명·한글명·사진·평점). 모듈 1회 로드.
const WC_POS: Record<string, "GK" | "DF" | "MF" | "FW"> = { G: "GK", D: "DF", M: "MF", F: "FW" };
interface WcXiPlayer { id: string; name: string; nameKo?: string; position: string; photo?: string | null; avgRating?: number; shirtNumber?: number }
const WC_XI: Record<string, { formation: string; xi: WcXiPlayer[] }> = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/wc-predicted-xi.json"), "utf-8"),
);

// 공식 스쿼드(team-squads) — 등번호 + 동일인 중복 제거 기준. dream-pool 에 같은 선수가 ts id 2개로
// (풀네임/약식명) 들어온 케이스가 있어, 공식 스쿼드에 있는 정본을 우선해 1명만 남긴다.
const T_SQUADS_RAW: Record<string, { squad: Array<{ id: string; number: number | null }> }> = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/team-squads.json"), "utf-8"),
);
const NUM_BY_ID = new Map<string, number>();
const OFFICIAL_IDS = new Set<string>();
for (const v of Object.values(T_SQUADS_RAW))
  for (const sp of v.squad) {
    OFFICIAL_IDS.add(sp.id);
    if (sp.number != null) NUM_BY_ID.set(sp.id, sp.number);
  }

// 같은 클럽·이름 첫·끝 토큰·포지션이 같으면 동일인 → 공식 스쿼드 > 등번호 > 사진 보유 순으로 1명만.
function dedupePlayers<T extends { id: string; name: string; pos: string; team: string; photo: string | null }>(players: T[]): T[] {
  const tok = (n: string) => n.split(/\s+/).map((t) => t.replace(/[^0-9a-z가-힣]/gi, "").toLowerCase()).filter(Boolean);
  const score = (p: T) => (OFFICIAL_IDS.has(p.id) ? 4 : 0) + (NUM_BY_ID.has(p.id) ? 2 : 0) + (p.photo ? 1 : 0);
  const best = new Map<string, T>();
  for (const p of players) {
    const t = tok(p.name);
    const key = t.length ? `${normClub(p.team)}|${t[0]}|${t[t.length - 1]}|${p.pos}` : `id:${p.id}`;
    const cur = best.get(key);
    if (!cur || score(p) > score(cur)) best.set(key, p);
  }
  return [...best.values()];
}

export default async function LineupPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const initial = d ? decodeBoard(d) : null;

  const all = dedupePlayers(allDreamPlayers());

  // 클럽 메타 집계(표기 정규화·대표 라벨·베스트11 가능 여부).
  const groups: Record<string, { labels: Record<string, number>; league: string; pos: Record<string, number>; count: number }> = {};
  for (const p of all) {
    const key = normClub(p.team);
    if (!key) continue;
    const g = (groups[key] ??= { labels: {}, league: p.league, pos: { GK: 0, DF: 0, MF: 0, FW: 0 }, count: 0 });
    g.labels[p.team] = (g.labels[p.team] || 0) + 1;
    g.pos[p.pos] = (g.pos[p.pos] || 0) + 1;
    g.count++;
  }
  const clubs: ClubMeta[] = Object.entries(groups)
    .map(([key, g]) => {
      const label = toKoreanTeamName(Object.entries(g.labels).sort((a, b) => b[1] - a[1])[0][0]);
      const canBest11 = g.pos.GK >= 1 && g.pos.DF >= 4 && g.pos.MF >= 3 && g.pos.FW >= 3;
      return { key, label, league: g.league, count: g.count, canBest11 };
    })
    .sort((a, b) => a.league.localeCompare(b.league) || b.count - a.count);

  // 선수 표시명 — dream-pool 의 한글명은 빌드 시점 theSportsPlayer.nameKo(구버전 음역)라
  // 최신 교정 사전(player-names.ts)으로 덮어쓴다. 미커버(한글 안 나오면)는 dream-pool 이름 유지.
  const ids = all.map((p) => p.id);
  let engById = new Map<string, string>();
  try {
    const rows = await prisma.theSportsPlayer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    engById = new Map(rows.map((r) => [r.id, r.name]));
  } catch { /* DB 실패 시 dream-pool 이름 유지 */ }

  // 빌더에는 필요한 필드만 슬림하게(radar 등 제외) + 클럽 그룹 키.
  const pool = all.map((p) => {
    const eng = engById.get(p.id);
    const ko = eng ? toKoreanPlayerName(eng) : "";
    return {
      id: p.id,
      name: /[가-힣]/.test(ko) ? ko : p.name,
      pos: p.pos,
      ovr: p.ovr,
      team: toKoreanTeamName(p.team),
      photo: p.photo,
      number: NUM_BY_ID.get(p.id) ?? null,
      clubKey: normClub(p.team),
    };
  });

  // 월드컵 국가 — 클럽 드롭다운에 'WORLD_CUP' 그룹으로 추가. 선수 id는 wcx_ 접두로 빅5 클럽 선수와 분리(같은 선수가 클럽·국대 양쪽일 때 충돌 방지).
  const wcClubs: ClubMeta[] = [];
  const wcPool: PoolPlayer[] = [];
  for (const [nation, entry] of Object.entries(WC_XI)) {
    const key = "wc-" + nation.toLowerCase().replace(/[^a-z]/g, "");
    const label = toKoreanTeamName(nation);
    wcClubs.push({ key, label, league: "WORLD_CUP", count: entry.xi.length, canBest11: entry.xi.length >= 11 });
    for (const p of entry.xi) {
      // 이름: 교정 사전(player-names.ts) 우선 — wc-predicted-xi 의 nameKo 는 위키 빌더 음역이라
      // 풀네임 오염("카를루스 카제미루")·오역("마테우스 쿤하")이 섞여 있어 사전 한글명이 있으면 그것을 쓴다.
      const ko = toKoreanPlayerName(p.name);
      wcPool.push({
        id: "wcx_" + p.id,
        name: /[가-힣]/.test(ko) ? ko : p.nameKo || p.name,
        pos: WC_POS[p.position] || "MF",
        ovr: Math.round((p.avgRating || 6) * 10),
        team: label,
        photo: p.photo || null,
        number: p.shirtNumber ?? null,
        clubKey: key,
      });
    }
  }
  wcClubs.sort((a, b) => a.label.localeCompare(b.label, "ko"));
  const allClubs = [...clubs, ...wcClubs];
  const allPool = [...pool, ...wcPool];

  return (
    <main className="relative mx-auto max-w-6xl px-4 py-10">
      <AmbientGlow />
      <div className="relative">
        <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
          전술판
        </span>
        <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">라인업 전술판</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
          포메이션을 고르거나 자유롭게, 선수를 끌어 옮겨 나만의 라인업을 완성하세요. 실제 클럽을 불러오거나 두 팀 맞대결도 만들 수 있고, 완성한 보드는 이미지 카드로 저장·공유됩니다.
        </p>
        <LineupBuilder pool={allPool} clubs={allClubs} initial={initial} />
      </div>
    </main>
  );
}
