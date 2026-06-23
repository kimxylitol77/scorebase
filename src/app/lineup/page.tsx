// 라인업 전술판 — 포메이션 보드에 선수를 배치해 베스트 11/맞대결을 만들고 이미지 카드로 공유 (공개 도구).
import type { Metadata } from "next";
import { allDreamPlayers } from "@/lib/dream-team/pool";
import { decodeBoard } from "@/lib/lineup/lineup-state";
import { prisma } from "@/lib/db";
import { toKoreanPlayerName } from "@/lib/player-names";
import { toKoreanTeamName } from "@/lib/team-names";
import LineupBuilder from "./LineupBuilder";
import type { ClubMeta } from "./types";
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

export default async function LineupPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const initial = d ? decodeBoard(d) : null;

  const all = allDreamPlayers();

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
      clubKey: normClub(p.team),
    };
  });

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
        <LineupBuilder pool={pool} clubs={clubs} initial={initial} />
      </div>
    </main>
  );
}
