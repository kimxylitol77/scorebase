// 감독 전술 아티클 공용 조각 — 시즌 결산(generate-manager-review)·월간(generate-manager-month) 공유.
// 데이터 브리프(숫자 사전 포맷 — LLM 재계산 금지)·렌더 보강(사진·감독사진·전술판 코드).
import { prisma } from "@/lib/db";
import { encodeBoard, newUid, type BoardState, type Placed } from "@/lib/lineup/lineup-state";
import type { Pos } from "@/lib/lineup/formations";
import type { TacticalManagerContext, XiPlayer } from "./manager-aggregate";

const POS_MAP: Record<string, Pos> = { G: "GK", D: "DF", M: "MF", F: "FW" };

// NFD 분해로 분음부호를 접고 슬러그를 만든다 — 접지 않으면 "Bayern München" 이
// "bayern-m-nchen" 이 된다(2026-08-19 분데스리가 실측).
export const teamSlug = (name: string) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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
  // 팀 tsId 로 조회하면 감독 교체 후 후임 감독 사진이 붙는다 — 이름 매칭된 coachProfile(ctx.coach.logo) 사용.
  ctx.coachPhoto = ctx.coach.logo ?? null;
  ctx.lineupCode = buildLineupCode(ctx, knownPids);
}

/** 프롬프트용 데이터 브리프 — 숫자는 전부 여기서 포맷해 주입한다. */
export function dataBrief(ctx: TacticalManagerContext): string {
  const r = ctx.record;
  const f = ctx.formations;
  const sp = ctx.shotProfile;
  // xG 소스(샷맵·DB)가 없는 리그(챔피언십 등)는 전부 0 으로 집계된다 — 0 을 사실처럼 브리핑하면
  // LLM 이 "xG 0" 을 그대로 인용한다. xG 신호가 하나도 없으면 xG 조각을 통째로 뺀다.
  const hasXg =
    f.some((x) => x.xgFor > 0 || x.xgAgainst > 0) ||
    ctx.monthly.some((m) => m.xgFor > 0 || m.xgAgainst > 0);
  const lines: string[] = [
    `팀: ${ctx.team.nameKo}(${ctx.team.name}) / 감독: ${ctx.coach.nameKo}(${ctx.coach.name})`,
    `성적: ${r.rank}위, ${r.played}경기 ${r.w}승 ${r.d}무 ${r.l}패 승점 ${r.points}, 득실 ${r.gf}-${r.ga}`,
    `포메이션 사용: ${f.map((x) => `${x.formation} ${x.count}회(${x.w}승${x.d}무${x.l}패${hasXg ? `, 경기당 xG ${x.xgFor}/실점xG ${x.xgAgainst}` : ""})`).join(", ")}`,
    `선발 로테이션: 경기당 평균 ${ctx.xiChanges.avgPerMatch}명 교체${ctx.xiChanges.everPresent.length ? `, 전 경기 선발 ${ctx.xiChanges.everPresent.join("·")}` : ""}`,
    `최다 선발(상위): ${ctx.topStarters.slice(0, 8).map((p) => `${p.nameKo} ${p.starts}회`).join(", ")}`,
    `월별 흐름: ${ctx.monthly.map((m) => `${Number(m.month.slice(5))}월 ${m.w}승${m.d}무${m.l}패${hasXg ? `(xG ${m.xgFor}:${m.xgAgainst})` : ""}`).join(" / ")}`,
  ];
  if (!hasXg) lines.push("주의: 이 시즌 데이터에 xG·슈팅 좌표는 없다. xG 를 본문에서 언급하지 말 것.");
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
