// 감독 전술 아티클 공용 조각 — 시즌 결산(generate-manager-review)·월간(generate-manager-month) 공유.
// 데이터 브리프(숫자 사전 포맷 — LLM 재계산 금지)·렌더 보강(사진·감독사진·전술판 코드).
import { readFileSync, existsSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { encodeBoard, newUid, type BoardState, type Placed } from "@/lib/lineup/lineup-state";
import type { Pos } from "@/lib/lineup/formations";
import type { TacticalManagerContext, XiPlayer } from "./manager-aggregate";

const POS_MAP: Record<string, Pos> = { G: "GK", D: "DF", M: "MF", F: "FW" };

export const teamSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** 평균 포지션 XI → 전술판 빌더 보드 코드 (?d=). */
function buildLineupCode(ctx: TacticalManagerContext, knownPids: Set<string>): string {
  const players: Placed[] = ctx.mostUsedXi.players.map((p: XiPlayer) => ({
    uid: newUid(),
    pid: p.tsPid && knownPids.has(p.tsPid) ? p.tsPid : null,
    name: p.tsPid && knownPids.has(p.tsPid) ? null : p.nameKo,
    pos: POS_MAP[p.pos] ?? "MF",
    x: p.x,
    y: 100 - p.y, // 집계 y(자기 골문=0) → 보드 y(위=상대 골문)
  }));
  const board: BoardState = {
    mode: "single",
    displayMode: "photo",
    orientation: "portrait",
    title: `${ctx.team.nameKo} ${ctx.seasonLabel} 베스트 XI`,
    subtitle: `${ctx.coach.nameKo} · ${ctx.mostUsedXi.formation}`,
    kit: "grass",
    home: { club: ctx.team.nameKo, formation: ctx.mostUsedXi.formation, players },
    bench: [],
    strokes: [],
  };
  return encodeBoard(board);
}

/** 렌더 부가 데이터 채움 — 선수 사진·감독 사진·전술판 코드. ctx 를 제자리 갱신. */
export async function enrichForRender(ctx: TacticalManagerContext): Promise<void> {
  const pidList = [...new Set(ctx.mostUsedXi.players.map((p) => p.tsPid).filter((v): v is string => !!v))];
  const tsRows = await prisma.theSportsPlayer.findMany({ where: { id: { in: pidList } }, select: { id: true, photoUrl: true } });
  const knownPids = new Set(tsRows.map((r) => r.id));
  ctx.photoByAf = Object.fromEntries(
    ctx.mostUsedXi.players
      .map((p) => [p.afId, p.tsPid ? tsRows.find((r) => r.id === p.tsPid)?.photoUrl : null] as const)
      .filter((e): e is [number, string] => !!e[1]),
  );
  const coachesPath = path.join(process.cwd(), "data/team-coaches.json");
  const coaches: Record<string, { name: string; logo?: string | null }> = existsSync(coachesPath)
    ? JSON.parse(readFileSync(coachesPath, "utf8"))
    : {};
  ctx.coachPhoto = (ctx.team.tsId ? coaches[ctx.team.tsId]?.logo : null) ?? null;
  ctx.lineupCode = buildLineupCode(ctx, knownPids);
}

/** 프롬프트용 데이터 브리프 — 숫자는 전부 여기서 포맷해 주입한다. */
export function dataBrief(ctx: TacticalManagerContext): string {
  const r = ctx.record;
  const f = ctx.formations;
  const sp = ctx.shotProfile;
  const lines: string[] = [
    `팀: ${ctx.team.nameKo}(${ctx.team.name}) / 감독: ${ctx.coach.nameKo}(${ctx.coach.name})`,
    `성적: ${r.rank}위, ${r.played}경기 ${r.w}승 ${r.d}무 ${r.l}패 승점 ${r.points}, 득실 ${r.gf}-${r.ga}`,
    `포메이션 사용: ${f.map((x) => `${x.formation} ${x.count}회(${x.w}승${x.d}무${x.l}패, 경기당 xG ${x.xgFor}/실점xG ${x.xgAgainst})`).join(", ")}`,
    `선발 로테이션: 경기당 평균 ${ctx.xiChanges.avgPerMatch}명 교체${ctx.xiChanges.everPresent.length ? `, 전 경기 선발 ${ctx.xiChanges.everPresent.join("·")}` : ""}`,
    `최다 선발(상위): ${ctx.topStarters.slice(0, 8).map((p) => `${p.nameKo} ${p.starts}회`).join(", ")}`,
    `월별 흐름: ${ctx.monthly.map((m) => `${Number(m.month.slice(5))}월 ${m.w}승${m.d}무${m.l}패(xG ${m.xgFor}:${m.xgAgainst})`).join(" / ")}`,
  ];
  if (ctx.coachStints.length > 1) {
    lines.push(`감독 교체: ${ctx.coachStints.map((s) => `${s.coachKo} ${s.from}~${s.to} ${s.played}경기 승점/경기 ${s.ppg}`).join(" → ")}`);
  }
  if (sp) {
    lines.push(
      `슈팅 프로필: 슈팅 ${sp.for.shots}회 ${sp.for.goals}골(xG합 ${sp.for.xg}), 박스 안 비중 ${Math.round(sp.for.insideBoxShare * 100)}%. ` +
      `피슈팅 ${sp.against.shots}회 ${sp.against.goals}실점(xG합 ${sp.against.xg}). ` +
      `최다 득점: ${sp.for.topShooters.slice(0, 3).map((s) => `${s.nameKo} ${s.goals}골`).join(", ")}`,
    );
  }
  return lines.join("\n");
}
