// 이적시장 데일리 — 지난 24h 주목 이적을 모아 리그별 다이제스트 글을 분석팀 계정으로 발행.
// 설계·결정 근거: docs/transfer-daily-post/{plan,context-notes}.md
import "@/lib/env";
import { readFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";

// /transfers 피드와 동일한 8리그 — 그 외 리그는 마이너 소음이라 제외.
const FEED_LEAGUES = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "K_LEAGUE_1", "SAUDI_PL", "MLS"];
const LEAGUE_KO: Record<string, string> = {
  EPL: "EPL", LALIGA: "라리가", BUNDESLIGA: "분데스리가", SERIE_A: "세리에 A",
  LIGUE_1: "리그 1", K_LEAGUE_1: "K리그1", SAUDI_PL: "사우디 프로리그", MLS: "MLS",
};
// 실팀이 아닌 행선지(방출·자격상실) — 팀 집계에서 제외.
const PSEUDO_TEAMS = new Set(["Free player", "Disqualification"]);
const TITLE_PREFIX = "[이적시장 데일리]";
const MANAGER_EMAIL = "manager@scorebase.internal";
// 주목 기준: 이적료 0이어도 시장가치가 이 이상이면 대어 자유계약으로 취급.
const NOTABLE_MV = 3_000_000;

interface SquadPlayer { id: string; name: string; position: string | null; number: number | null }
const T_SQUADS: Record<string, { squad: SquadPlayer[] }> = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/team-squads.json"), "utf-8"),
);

function fmtFee(fee: number): string {
  return fee >= 1_000_000 ? `€${(fee / 1_000_000).toFixed(fee % 1_000_000 ? 1 : 0)}M` : `€${Math.round(fee / 1000)}k`;
}
function playerKo(name: string | null | undefined): string {
  if (!name) return "?";
  const ko = toKoreanPlayerName(name);
  return ko && ko !== name ? ko : name;
}
function teamKo(name: string | null | undefined, league: string): string {
  if (!name) return "?";
  return toKoreanTeamName(name, league) || name;
}

interface Move {
  playerId: string;
  playerName: string | null;
  fromTeamId: string | null;
  fromTeamName: string | null;
  toTeamId: string;
  toTeamName: string;
  league: string;
  fee: number;
  transferType: number | null;
  mv: number;
  aiBrief: string | null;
}

// 영입 유형 라벨 — transfer-display.ts 코드 체계(1=임대·7=자유계약)와 동일.
function moveLabel(m: Move): string {
  if (m.transferType === 1) return "임대";
  if (m.transferType === 7 || m.fromTeamName === "Free player") return "자유계약";
  return m.fee > 0 ? `완전이적 ${fmtFee(m.fee)}` : "완전이적";
}

export async function runGenerateTransferDaily(opts?: { dryRun?: boolean }) {
  const manager = await prisma.user.findUnique({ where: { email: MANAGER_EMAIL }, select: { id: true } });
  if (!manager) throw new Error("분석팀 계정 없음 (manager@scorebase.internal)");

  // 하루 1개 가드 — 오늘(KST) 이미 발행했으면 skip (post-daily-topic 패턴).
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const dayStartUtc = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 3600 * 1000);
  const existing = await prisma.post.findFirst({
    where: { authorId: manager.id, title: { startsWith: TITLE_PREFIX }, createdAt: { gte: dayStartUtc } },
    select: { id: true },
  });
  // dryRun 은 미리보기 용도라 가드를 통과시킨다 (발행은 어차피 안 함).
  if (existing && !opts?.dryRun) return { posted: false, reason: "already", postId: existing.id };

  // 지난 24h 신규 이적 — updatedAt=first-seen(소식일). transferTime 은 7/1 무더기라 부적합.
  const rows = await prisma.footballTransfer.findMany({
    where: {
      updatedAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
      league: { in: FEED_LEAGUES },
      toTeamId: { not: null },
      transferType: { not: 2 }, // 임대복귀 제외
    },
  });
  const playerIds = [...new Set(rows.map((r) => r.playerId))];
  const mvRows = playerIds.length
    ? await prisma.playerMarketValue.findMany({ where: { id: { in: playerIds } }, select: { id: true, currentValue: true } })
    : [];
  const mvMap = new Map(mvRows.map((r) => [r.id, r.currentValue ?? 0]));

  const moves: Move[] = rows
    .filter((r) => r.toTeamName && !PSEUDO_TEAMS.has(r.toTeamName))
    .map((r) => ({
      playerId: r.playerId,
      playerName: null as string | null, // 이름은 스쿼드/전 소속에서 보강
      fromTeamId: r.fromTeamId,
      fromTeamName: r.fromTeamName,
      toTeamId: r.toTeamId!,
      toTeamName: r.toTeamName!,
      league: r.league!,
      fee: r.transferFee ?? 0,
      transferType: r.transferType,
      mv: mvMap.get(r.playerId) ?? 0,
      aiBrief: r.aiBrief,
    }))
    .filter((m) => m.fee > 0 || m.mv >= NOTABLE_MV || m.aiBrief);
  // 선수 영문명 보강 — 도착팀 스쿼드 우선, 없으면 전 소속 스쿼드.
  for (const m of moves) {
    m.playerName =
      T_SQUADS[m.toTeamId]?.squad.find((p) => p.id === m.playerId)?.name ??
      (m.fromTeamId ? T_SQUADS[m.fromTeamId]?.squad.find((p) => p.id === m.playerId)?.name : null) ??
      null;
  }
  // 이름을 어느 스쿼드에서도 못 찾으면 "?" 불릿이 되므로 제외 (대부분 유스·비주류).
  const dropped = moves.filter((m) => !m.playerName).length;
  const named = moves.filter((m) => m.playerName);
  if (dropped) console.log(`[transfer-daily] 이름 미상 ${dropped}건 제외`);
  if (named.length === 0) return { posted: false, reason: "quiet" };
  moves.length = 0;
  moves.push(...named);

  const totalCount = moves.length;
  const kstLabel = `${kstNow.getUTCMonth() + 1}월 ${kstNow.getUTCDate()}일`;
  const title = `${TITLE_PREFIX} ${kstLabel} — 주목 이적 ${totalCount}건`;

  // 리그별 다이제스트 — 주목 이적 전체를 리그별 불릿으로.
  const byLeague = new Map<string, Move[]>();
  for (const m of moves) byLeague.set(m.league, [...(byLeague.get(m.league) ?? []), m]);
  const digestBlock = [
    `## 리그별 주목 이적`,
    ...[...byLeague.entries()].map(([lg, ms]) =>
      [
        `**${LEAGUE_KO[lg] ?? lg}**`,
        ...ms.map((m) => `- ${playerKo(m.playerName)}: ${teamKo(m.fromTeamName, lg)} → ${teamKo(m.toTeamName, lg)} (${moveLabel(m)})`),
      ].join("\n"),
    ),
  ].join("\n\n");

  const content = [
    `지난 24시간 이적시장에서 주목할 만한 움직임 **${totalCount}건**을 정리했습니다.`,
    digestBlock,
    `이적료·시장가치 전체 현황은 [이적시장 페이지](/transfers)에서 볼 수 있습니다.`,
  ].filter((s) => s && s.trim()).join("\n\n");

  if (opts?.dryRun) {
    return { posted: false, reason: "dryRun", title, content, moves: totalCount };
  }

  const post = await prisma.post.create({
    data: {
      authorId: manager.id,
      category: "FREE",
      sport: "soccer",
      title,
      content,
    },
    select: { id: true },
  });
  console.log(`[transfer-daily] 발행: post ${post.id} — ${title}`);
  return { posted: true, postId: post.id, moves: totalCount };
}

// tsx 직접 실행 (npm run job:transfer-daily) — `--dry` 로 발행 없이 미리보기.
if (import.meta.url === `file://${process.argv[1]}`) {
  runGenerateTransferDaily({ dryRun: process.argv.includes("--dry") })
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
