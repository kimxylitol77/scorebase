// 라인업 전술판 — 포메이션 보드에 선수를 배치해 베스트 11/맞대결을 만들고 이미지 카드로 공유 (공개 도구).
// 후보 풀 = 공식 스쿼드(team-squads 154팀 전원) + 여름 이적 반영(IN/OUT) + 감독(선호 포메이션) 메타.
import type { Metadata } from "next";
import { readFileSync } from "fs";
import path from "path";
import { unstable_cache } from "next/cache";
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
  description: "포메이션 보드에 실제 클럽 스쿼드를 불러와 나만의 베스트 11과 맞대결 라인업을 만들고 이미지 카드로 공유하세요.",
};

// 클럽 표기 정규화 — 스쿼드 미커버 선수(검색 전용)의 그룹 키.
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

// 공식 스쿼드(주간 갱신) + 감독(선호 포메이션 포함) — ts team id 키.
const T_SQUADS: Record<string, { updatedAt?: string; squad: Array<{ id: string; name: string; position: string | null; number: number | null }> }> = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/team-squads.json"), "utf-8"),
);
const T_COACHES: Record<string, { name: string; nameKo?: string | null; preferredFormation?: string | null }> = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/team-coaches.json"), "utf-8"),
);

const SQUAD_POS: Record<string, "GK" | "DF" | "MF" | "FW"> = { G: "GK", D: "DF", M: "MF", F: "FW" };
// 여름 이적창 시작 — 이 이후 발효 이적을 스쿼드에 오버레이 (주간 스쿼드 갱신 사이의 공백 커버)
const SUMMER_WINDOW_START = Math.floor(Date.UTC(2026, 5, 1) / 1000);

/** 공식 스쿼드 + 이적 오버레이 + 감독 메타로 클럽·풀 구축. 무거워서 3h 캐시. */
const getClubData = unstable_cache(
  async (): Promise<{ pool: PoolPlayer[]; clubs: ClubMeta[] }> => {
    const tsTeamIds = Object.keys(T_SQUADS);

    // ts team id → 우리 Team (이름·리그)
    const srcRows = await prisma.teamSourceId.findMany({
      where: { source: "thesports", externalId: { in: tsTeamIds } },
      select: { externalId: true, team: { select: { name: true, league: true } } },
    });
    const teamByTsId = new Map(srcRows.map((r) => [r.externalId, r.team]));

    // 여름 이적 오버레이 — 선수별 최신 1건만 (여러 번 이동 시 마지막 행선지 기준).
    // 스쿼드 파일 갱신일 이전 발효분은 파일에 이미 반영돼 있으므로, 팀별 updatedAt 이후만 얹는다
    // (전체 창 기준으로 얹으면 임대복귀·6월 이적까지 수백 명이 NEW 로 중복됨).
    const squadTs = (tsId: string): number => {
      const u = T_SQUADS[tsId]?.updatedAt;
      const ms = u ? Date.parse(u) : NaN;
      return Number.isFinite(ms) ? Math.floor(ms / 1000) : SUMMER_WINDOW_START;
    };
    const transfers = await prisma.footballTransfer.findMany({
      where: {
        transferTime: { gte: SUMMER_WINDOW_START },
        transferType: { in: [1, 3, 7] }, // 임대·완전·자유 — 방출(6) 등은 IN 의미 없음
        OR: [{ toTeamId: { in: tsTeamIds } }, { fromTeamId: { in: tsTeamIds } }],
      },
      select: { playerId: true, toTeamId: true, fromTeamId: true, transferTime: true },
      orderBy: { transferTime: "desc" },
    });
    const latestByPlayer = new Map<string, { toTeamId: string | null; fromTeamId: string | null; transferTime: number | null }>();
    for (const t of transfers) if (!latestByPlayer.has(t.playerId)) latestByPlayer.set(t.playerId, t);
    const insByTeam = new Map<string, string[]>();
    const outIds = new Map<string, string>(); // playerId → 떠난 팀(ts id)
    for (const [pid, t] of latestByPlayer) {
      const ts = t.transferTime ?? 0;
      if (t.toTeamId && T_SQUADS[t.toTeamId] && ts > squadTs(t.toTeamId))
        (insByTeam.get(t.toTeamId) ?? insByTeam.set(t.toTeamId, []).get(t.toTeamId)!).push(pid);
      if (t.fromTeamId && T_SQUADS[t.fromTeamId] && t.toTeamId !== t.fromTeamId && ts > squadTs(t.fromTeamId))
        outIds.set(pid, t.fromTeamId);
    }

    // 한글명·포지션·사진 배치 조회 (스쿼드 전원 + 이적 IN)
    const allIds = new Set<string>();
    for (const v of Object.values(T_SQUADS)) for (const p of v.squad) allIds.add(p.id);
    for (const ids of insByTeam.values()) for (const id of ids) allIds.add(id);
    const players = await prisma.theSportsPlayer.findMany({
      where: { id: { in: [...allIds] } },
      select: { id: true, name: true, nameKo: true, position: true, photoUrl: true },
    });
    const dbById = new Map(players.map((p) => [p.id, p]));
    const dreamById = new Map(allDreamPlayers().map((p) => [p.id, p]));

    // 표시명 — 교정 사전(player-names.ts) 최우선 → DB nameKo → 영문 (이름 정확성 정책)
    const displayName = (id: string, engFallback: string): string => {
      const db = dbById.get(id);
      const eng = db?.name || engFallback;
      const fixed = toKoreanPlayerName(eng);
      if (/[가-힣]/.test(fixed)) return fixed;
      if (db?.nameKo && /[가-힣]/.test(db.nameKo)) return db.nameKo;
      return dreamById.get(id)?.name ?? eng;
    };

    const pool: PoolPlayer[] = [];
    const clubs: ClubMeta[] = [];
    const seen = new Set<string>();

    for (const [tsId, entry] of Object.entries(T_SQUADS)) {
      const team = teamByTsId.get(tsId);
      if (!team) continue;
      const clubKey = `ts-${tsId}`;
      const label = toKoreanTeamName(team.name, team.league) || team.name;
      const posCount = { GK: 0, DF: 0, MF: 0, FW: 0 };
      let count = 0;

      const pushPlayer = (id: string, engName: string, posRaw: string | null, number: number | null, isNew: boolean) => {
        if (seen.has(id)) return; // 이적 중복(스쿼드에 이미 반영된 IN) 방지
        const dream = dreamById.get(id);
        const db = dbById.get(id);
        const pos = SQUAD_POS[posRaw ?? ""] ?? dream?.pos ?? SQUAD_POS[db?.position ?? ""] ?? "MF";
        seen.add(id);
        posCount[pos]++;
        count++;
        pool.push({
          id,
          name: displayName(id, engName),
          pos,
          ovr: dream?.ovr ?? 0,
          team: label,
          photo: dream?.photo ?? db?.photoUrl ?? null,
          number,
          clubKey,
          isNew: isNew || undefined,
        });
      };

      for (const sp of entry.squad) {
        if (outIds.get(sp.id) === tsId) continue; // 이번 창에 떠난 선수 제외
        pushPlayer(sp.id, sp.name, sp.position, sp.number, false);
      }
      for (const pid of insByTeam.get(tsId) ?? []) {
        const db = dbById.get(pid);
        pushPlayer(pid, db?.name ?? "선수", db?.position ?? null, null, true);
      }

      const coach = T_COACHES[tsId];
      clubs.push({
        key: clubKey,
        label,
        league: team.league,
        count,
        canBest11: posCount.GK >= 1 && posCount.DF >= 4 && posCount.MF >= 3 && posCount.FW >= 3,
        coachName: coach ? (coach.nameKo || coach.name) : null,
        coachFormation: coach?.preferredFormation || null,
      });
    }

    // 스쿼드 미커버 dream-pool 선수 — 검색 전용으로 풀에만 추가 (클럽 목록엔 없음)
    for (const p of dreamById.values()) {
      if (seen.has(p.id)) continue;
      pool.push({
        id: p.id,
        name: displayName(p.id, p.name),
        pos: p.pos,
        ovr: p.ovr,
        team: toKoreanTeamName(p.team),
        photo: p.photo,
        number: null,
        clubKey: normClub(p.team),
      });
    }

    clubs.sort((a, b) => a.league.localeCompare(b.league) || a.label.localeCompare(b.label, "ko"));
    return { pool, clubs };
  },
  ["lineup-club-data-v2"],
  { revalidate: 3 * 3600 },
);

export default async function LineupPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const initial = d ? decodeBoard(d) : null;

  const { pool, clubs } = await getClubData();

  // 월드컵 국가 — 클럽 드롭다운에 'WORLD_CUP' 그룹으로 추가. 선수 id는 wcx_ 접두로 클럽 선수와 분리.
  const wcClubs: ClubMeta[] = [];
  const wcPool: PoolPlayer[] = [];
  for (const [nation, entry] of Object.entries(WC_XI)) {
    const key = "wc-" + nation.toLowerCase().replace(/[^a-z]/g, "");
    const label = toKoreanTeamName(nation);
    wcClubs.push({ key, label, league: "WORLD_CUP", count: entry.xi.length, canBest11: entry.xi.length >= 11 });
    for (const p of entry.xi) {
      // 이름: 교정 사전 우선 — wc-predicted-xi 의 nameKo 는 위키 빌더 음역이라 오염 케이스가 있음.
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
          클럽을 불러오면 공식 스쿼드 전원(이번 여름 이적 반영)이 후보로 뜨고, 감독의 선호 포메이션으로 자동 배치됩니다. 완성한 보드는 이미지 카드로 저장·공유하세요.
        </p>
        <LineupBuilder pool={allPool} clubs={allClubs} initial={initial} />
      </div>
    </main>
  );
}
