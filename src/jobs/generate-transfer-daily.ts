// 이적시장 데일리 — 지난 24h 주목 이적을 모아 포커스 팀(예상 XI 전술판 임베드)+다이제스트 글을 분석팀 계정으로 발행.
// 설계·결정 근거: docs/transfer-daily-post/{plan,context-notes}.md
import "@/lib/env";
import { readFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import {
  encodeBoard,
  newUid,
  type BoardState,
  type Side,
  type Placed,
  type BenchEntry,
} from "@/lib/lineup/lineup-state";
import { FORMATIONS, type Pos } from "@/lib/lineup/formations";

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
// 맞대결 보드 성립 기준: 상위 2팀 모두 이 가중치(이적료+시장가치 합) 이상.
const VERSUS_MIN_SCORE = 10_000_000;

interface SquadPlayer { id: string; name: string; position: string | null; number: number | null }
const T_SQUADS: Record<string, { squad: SquadPlayer[] }> = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/team-squads.json"), "utf-8"),
);
const T_COACHES: Record<string, { name: string; nameKo?: string | null; preferredFormation?: string | null }> = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/team-coaches.json"), "utf-8"),
);

function posOf(letter: string | null | undefined): Pos {
  if (letter === "G") return "GK";
  if (letter === "D") return "DF";
  if (letter === "M") return "MF";
  return "FW";
}
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

// 감독 선호 포메이션 기반 예상 XI — 스쿼드+신규 영입을 포지션 버킷별 시장가치 상위로 채운다.
function buildSquadSide(
  tsTeamId: string,
  clubKo: string,
  incoming: Move[],
  mvMap: Map<string, number>,
): { side: Side; bench: BenchEntry[]; formation: string; coach: string | null; xiValue: number; top3: { name: string; v: number }[] } | null {
  const entry = T_SQUADS[tsTeamId];
  if (!entry?.squad?.length) return null;

  const inIds = new Set(incoming.map((m) => m.playerId));
  const cands = new Map<string, { pid: string; name: string; pos: Pos; mv: number; isNew: boolean }>();
  for (const p of entry.squad) {
    cands.set(p.id, { pid: p.id, name: p.name, pos: posOf(p.position), mv: mvMap.get(p.id) ?? 0, isNew: inIds.has(p.id) });
  }
  // 신규 영입이 주간 갱신 스쿼드에 아직 없으면 전 소속 스쿼드에서 포지션을 찾아 후보에 추가.
  for (const m of incoming) {
    if (cands.has(m.playerId)) continue;
    const old = m.fromTeamId ? T_SQUADS[m.fromTeamId]?.squad.find((p) => p.id === m.playerId) : undefined;
    if (!old) continue;
    cands.set(m.playerId, { pid: m.playerId, name: old.name, pos: posOf(old.position), mv: mvMap.get(m.playerId) ?? 0, isNew: true });
  }

  const coach = T_COACHES[tsTeamId];
  const formation = coach?.preferredFormation && FORMATIONS[coach.preferredFormation] ? coach.preferredFormation : "4-3-3";
  const slots = FORMATIONS[formation];

  // 버킷별 정렬 — 시장가치 desc, 동률이면 신규 영입 우선(그날의 주인공을 XI 에 노출).
  const rank = (a: { mv: number; isNew: boolean }, b: { mv: number; isNew: boolean }) =>
    b.mv - a.mv || Number(b.isNew) - Number(a.isNew);
  const buckets: Record<Pos, { pid: string; name: string; pos: Pos; mv: number; isNew: boolean }[]> = { GK: [], DF: [], MF: [], FW: [] };
  for (const c of cands.values()) buckets[c.pos].push(c);
  for (const k of Object.keys(buckets) as Pos[]) buckets[k].sort(rank);

  const used = new Set<string>();
  const players: Placed[] = [];
  for (const slot of slots) {
    let pick = buckets[slot.pos].find((c) => !used.has(c.pid));
    if (!pick) {
      // 버킷 부족 시 남은 후보 전체에서 최고 가치로 보충 (마이너 스쿼드 데이터 결손 대비).
      pick = [...cands.values()].filter((c) => !used.has(c.pid)).sort(rank)[0];
    }
    if (!pick) return null;
    used.add(pick.pid);
    players.push({ uid: newUid(), pid: pick.pid, name: null, pos: pick.pos, x: slot.x, y: slot.y });
  }

  const xi = [...used].map((pid) => cands.get(pid)!);
  const bench: BenchEntry[] = [...cands.values()]
    .filter((c) => !used.has(c.pid))
    .sort(rank)
    .slice(0, 5)
    .map((c) => ({ pid: c.pid, name: null }));
  const xiValue = xi.reduce((s, c) => s + c.mv, 0);
  const top3 = xi.filter((c) => c.mv > 0).sort((a, b) => b.mv - a.mv).slice(0, 3)
    .map((c) => ({ name: playerKo(c.name), v: c.mv }));

  return {
    side: { club: clubKo, formation, players },
    bench,
    formation,
    coach: coach ? (coach.nameKo || coach.name) : null,
    xiValue,
    top3,
  };
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

  // 팀별 가중치(이적료+시장가치 합)로 포커스 선정 — 스쿼드 데이터 있는 팀만 보드 가능.
  const byTeam = new Map<string, { moves: Move[]; score: number }>();
  for (const m of moves) {
    const t = byTeam.get(m.toTeamId) ?? { moves: [], score: 0 };
    t.moves.push(m);
    t.score += m.fee + m.mv;
    byTeam.set(m.toTeamId, t);
  }
  const ranked = [...byTeam.entries()].sort((a, b) => b[1].score - a[1].score);
  const focusEntry = ranked.find(([id]) => T_SQUADS[id]?.squad?.length);
  const rivalEntry = focusEntry
    ? ranked.find(([id, t]) => id !== focusEntry[0] && t.score >= VERSUS_MIN_SCORE && T_SQUADS[id]?.squad?.length)
    : undefined;

  // 보드 대상 팀의 스쿼드 전원 시장가치 로드 — XI 선발·가치 합계는 스쿼드 전체 기준이어야 한다.
  // (이적 당사자만 넣으면 XI 가 영입생 1명 값으로 집계되는 왜곡 — dry-run 에서 실측한 버그.)
  const boardTeamIds = [focusEntry?.[0], rivalEntry?.[0]].filter((v): v is string => Boolean(v));
  const squadIds = [...new Set(boardTeamIds.flatMap((id) => (T_SQUADS[id]?.squad ?? []).map((p) => p.id)))]
    .filter((id) => !mvMap.has(id));
  if (squadIds.length) {
    const more = await prisma.playerMarketValue.findMany({
      where: { id: { in: squadIds } },
      select: { id: true, currentValue: true },
    });
    for (const r of more) mvMap.set(r.id, r.currentValue ?? 0);
  }

  const totalCount = moves.length;
  const kstLabel = `${kstNow.getUTCMonth() + 1}월 ${kstNow.getUTCDate()}일`;

  let lineupCode: string | null = null;
  let focusBlock = "";
  let title = `${TITLE_PREFIX} ${kstLabel} — 주목 이적 ${totalCount}건`;

  if (focusEntry) {
    const [focusId, focusTeam] = focusEntry;
    const fMove = focusTeam.moves.sort((a, b) => b.fee + b.mv - (a.fee + a.mv))[0];
    const focusKo = teamKo(fMove.toTeamName, fMove.league);
    const built = buildSquadSide(focusId, focusKo, focusTeam.moves, mvMap);

    title = `${TITLE_PREFIX} ${kstLabel} — ${focusKo}, ${playerKo(fMove.playerName)} 영입${totalCount > 1 ? ` 외 ${totalCount - 1}건` : ""}`;

    const signingLines = focusTeam.moves.map(
      (m) => `- **${playerKo(m.playerName)}** (${teamKo(m.fromTeamName, m.league)} → ${focusKo}, ${moveLabel(m)})${m.mv > 0 ? ` · 시장가치 ${fmtFee(m.mv)}` : ""}`,
    );
    const valueLine = built && built.xiValue > 0
      ? `예상 베스트 XI 시장가치 합계는 **${fmtFee(built.xiValue)}** (스코어베이스 시장가치 DB 기준)${built.top3.length ? `, 최고 몸값은 ${built.top3.map((t) => `${t.name} ${fmtFee(t.v)}`).join(" · ")}` : ""}.`
      : "";

    // 보드 생성 — 맞대결 성립 시 두 팀 XI 를 한 보드(versus)로.
    if (built) {
      const rivalBuilt = rivalEntry
        ? buildSquadSide(
            rivalEntry[0],
            teamKo(rivalEntry[1].moves[0].toTeamName, rivalEntry[1].moves[0].league),
            rivalEntry[1].moves,
            mvMap,
          )
        : null;
      // versus 좌표 변환 — 빌더 placeY 와 동일(홈=아래 절반 50+0.46y, 원정=위 절반 미러 50-0.46y).
      // 풀피치 좌표를 그대로 쓰면 두 팀 22명이 같은 자리에 겹친다 (post 938 초판에서 실측).
      const vY = (players: Placed[], side: "home" | "away"): Placed[] =>
        players.map((p) => ({ ...p, y: Math.round(side === "away" ? 50 - p.y * 0.46 : 50 + p.y * 0.46) }));
      const board: BoardState = rivalBuilt
        ? {
            mode: "versus", displayMode: "photo", orientation: "portrait",
            title: `${built.side.club} vs ${rivalBuilt.side.club}`,
            subtitle: `영입 반영 예상 XI · ${kstLabel}`,
            kit: "grass",
            home: { ...built.side, players: vY(built.side.players, "home") },
            away: { ...rivalBuilt.side, players: vY(rivalBuilt.side.players, "away") },
            bench: [], strokes: [],
          }
        : {
            mode: "single", displayMode: "photo", orientation: "portrait",
            title: `${focusKo} 예상 베스트 XI`,
            subtitle: `감독 ${built.coach ?? "-"} · ${built.formation}`,
            kit: "grass", home: built.side, bench: built.bench, strokes: [],
          };
      lineupCode = encodeBoard(board);
    }

    // 전술 코멘트만 LLM — 수치·이적 사실은 코드가 쓰므로 창작 여지 차단.
    let tactic = "";
    if (built) {
      try {
        tactic = (
          await generate(
            [
              `너는 축구 전술 분석가다. 아래 사실만 근거로 ${focusKo}의 이번 영입이 감독 전술에 어떻게 맞는지 3~4문장 한국어로 써라.`,
              `사실: 감독 ${built.coach ?? "미상"}, 선호 포메이션 ${built.formation}, 영입 선수 ${focusTeam.moves.map((m) => playerKo(m.playerName)).join(", ")}.`,
              // 금액은 본문 불릿이 정확히 쓰므로 LLM 에겐 아예 금지 — dry-run 에서 €40M→"40억 유로" 오변환 실측.
              `규칙: 이모지 금지, 금액·이적료·시장가치 언급 금지, 새로운 선수명·수치 창작 금지, 확정 단정 대신 "기대된다/보인다" 톤, 마크다운 굵게 1~2회만.`,
            ].join("\n"),
            { maxTokens: 500 },
          )
        ).trim();
      } catch (e) {
        console.warn("[transfer-daily] 전술 코멘트 생성 실패 — 코멘트 없이 발행:", (e as Error).message);
      }
    }

    focusBlock = [
      `## 오늘의 포커스 — ${focusKo}`,
      signingLines.join("\n"),
      valueLine,
      tactic,
      built
        ? `${rivalEntry ? "아래 전술판에서 두 팀의 영입 반영 예상 XI 를 맞대결로 붙였습니다." : `아래는 감독 선호 포메이션(${built.formation}) 기준 영입 반영 예상 베스트 XI 입니다.`} 여러분이라면 어디를 바꾸시겠습니까? [전술판에서 직접 수정](/lineup)하고 댓글로 의견 남겨주세요.`
        : "",
    ].filter((s) => s && s.trim()).join("\n\n");
  }

  // 다이제스트 — 포커스 외 나머지 팀 리그별 불릿.
  const restMoves = moves.filter((m) => !focusEntry || m.toTeamId !== focusEntry[0]);
  let digestBlock = "";
  if (restMoves.length) {
    const byLeague = new Map<string, Move[]>();
    for (const m of restMoves) byLeague.set(m.league, [...(byLeague.get(m.league) ?? []), m]);
    digestBlock = [
      `## 그밖의 이적`,
      ...[...byLeague.entries()].map(([lg, ms]) =>
        [
          `**${LEAGUE_KO[lg] ?? lg}**`,
          ...ms.map((m) => `- ${playerKo(m.playerName)}: ${teamKo(m.fromTeamName, lg)} → ${teamKo(m.toTeamName, lg)} (${moveLabel(m)})`),
        ].join("\n"),
      ),
    ].join("\n\n");
  }

  const content = [
    `지난 24시간 이적시장에서 주목할 만한 움직임 **${totalCount}건**을 정리했습니다.`,
    focusBlock,
    digestBlock,
    `이적료·시장가치 전체 현황은 [이적시장 페이지](/transfers)에서 볼 수 있습니다.`,
  ].filter((s) => s && s.trim()).join("\n\n");

  if (opts?.dryRun) {
    return { posted: false, reason: "dryRun", title, content, lineupCode, moves: totalCount, versus: Boolean(rivalEntry && lineupCode) };
  }

  const post = await prisma.post.create({
    data: {
      authorId: manager.id,
      category: "FREE",
      sport: "soccer",
      title,
      content,
      ...(lineupCode ? { lineupCode } : {}),
    },
    select: { id: true },
  });
  console.log(`[transfer-daily] 발행: post ${post.id} — ${title}`);
  return { posted: true, postId: post.id, moves: totalCount, focus: focusEntry?.[0] ?? null, versus: Boolean(rivalEntry && lineupCode) };
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
