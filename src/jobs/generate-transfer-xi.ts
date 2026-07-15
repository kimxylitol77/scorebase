// 이적시장 예상 XI — 48h 이적 활동 1위 팀의 영입 반영 베스트 11 초안(제목+본문+명단+전술판 링크)을
// 운영자 텔레그램으로 전송. 발행은 운영자가 직접(글쓰기 폼 붙여넣기 + 전술판 수동 첨부) — 2026-07-15 전환.
// 웹 검색은 "누가"(이름 11개)만, "어디에"(포지션)는 실좌표 도출 데이터(player-positions-detail.json)가
// 결정 — 과거 슬롯 배정 환각의 재발 차단. 설계·결정 근거: docs/transfer-xi-bot/{plan,context-notes}.md
import "@/lib/env";
import { readFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { generateWithWebSearch } from "@/lib/ai/claude";
import { sendTelegram } from "@/lib/notify/telegram";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import { encodeBoard, newUid, type BoardState, type Placed, type BenchEntry } from "@/lib/lineup/lineup-state";
import { FORMATIONS, type Pos, type Slot } from "@/lib/lineup/formations";

const FEED_LEAGUES = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "K_LEAGUE_1", "SAUDI_PL", "MLS"];
const LEAGUE_KO: Record<string, string> = {
  EPL: "EPL", LALIGA: "라리가", BUNDESLIGA: "분데스리가", SERIE_A: "세리에 A",
  LIGUE_1: "리그 1", K_LEAGUE_1: "K리그1", SAUDI_PL: "사우디 프로리그", MLS: "MLS",
};
const PSEUDO_TEAMS = new Set(["Free player", "Disqualification"]);
// 본문 글투 — post 875 작성자(축덕광) 페르소나 톤 사본. 발행은 운영자 수동이지만
// 붙여넣기용 초안이라 커뮤니티체 유지 (fake-members.ts 는 server-only 라 import 불가 → 로컬 정의).
const PERSONA_TONE = "축구 전술 얘기 좋아함. 라인업·압박 같은 단어를 가볍게 씀";
// 주목 기준 — 이적료 0이어도 시장가치가 이 이상이면 대어 자유계약.
const NOTABLE_MV = 3_000_000;
// 포커스 성립 최소 가중치(이적료+시장가치 합) — 미만이면 조용한 날로 보고 스킵.
const FOCUS_MIN_SCORE = 5_000_000;

interface SquadPlayer { id: string; name: string; position: string | null; number: number | null }
const T_SQUADS: Record<string, { squad: SquadPlayer[] }> = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/team-squads.json"), "utf-8"),
);
const T_COACHES: Record<string, { name: string; nameKo?: string | null; preferredFormation?: string | null }> = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/team-coaches.json"), "utf-8"),
);
// 실좌표 도출 세부 포지션 (derive-detail-position.ts 산출, mac-mini 주간 갱신).
const DETAIL_POS: Record<string, { primary: string; others: string[]; apps: number }> = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/player-positions-detail.json"), "utf-8"),
);

function fmtFee(fee: number): string {
  return fee >= 1_000_000 ? `€${(fee / 1_000_000).toFixed(fee % 1_000_000 ? 1 : 0)}M` : `€${Math.round(fee / 1000)}k`;
}
function playerKo(name: string | null | undefined, dbKo?: string | null): string {
  if (!name) return "?";
  const fixed = toKoreanPlayerName(name);
  if (/[가-힣]/.test(fixed)) return fixed;
  if (dbKo && /[가-힣]/.test(dbKo)) return dbKo;
  return name;
}
function teamKo(name: string | null | undefined, league: string): string {
  if (!name) return "?";
  return toKoreanTeamName(name, league) || name;
}
// 이름 정규화 — 악센트 제거·소문자·영문자만 (웹 검색 이름 ↔ 스쿼드 이름 매칭용).
function normName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}
function matchSquadPlayer(name: string, squad: SquadPlayer[]): SquadPlayer | null {
  const n = normName(name);
  if (!n) return null;
  const exact = squad.find((p) => normName(p.name) === n);
  if (exact) return exact;
  const last = n.split(" ").pop()!;
  const byLast = squad.filter((p) => normName(p.name).split(" ").includes(last));
  if (byLast.length === 1) return byLast[0];
  const incl = squad.find((p) => { const pn = normName(p.name); return pn.includes(n) || n.includes(pn); });
  return incl ?? null;
}

interface Move {
  playerId: string;
  playerName: string | null;
  fromTeamName: string | null;
  toTeamId: string;
  toTeamName: string;
  league: string;
  fee: number;
  transferType: number | null;
  mv: number;
}
function moveLabel(m: Move): string {
  if (m.transferType === 1) return "임대";
  if (m.transferType === 7 || m.fromTeamName === "Free player") return "자유계약";
  return m.fee > 0 ? `완전이적 ${fmtFee(m.fee)}` : "완전이적";
}

// ============================================================
// 배치 엔진 — 세부 포지션 → 라인 버킷 → 풀피치 좌표 + 포메이션 역산
// ============================================================
type Bucket = "GK" | "DF" | "DM" | "CM" | "AM" | "FW";
const BUCKET_OF: Record<string, Bucket> = {
  GK: "GK", CB: "DF", LB: "DF", RB: "DF", FB: "DF",
  CDM: "DM", DM: "DM", CM: "CM", LM: "CM", RM: "CM", CAM: "AM", AM: "AM",
  LW: "FW", RW: "FW", ST: "FW", CF: "FW", W: "FW",
};
// 라인 내 좌→우 정렬 키 (0=왼쪽, 1=중앙, 2=오른쪽).
const SIDE_OF: Record<string, number> = { LB: 0, LM: 0, LW: 0, RB: 2, RM: 2, RW: 2 };
const POS_TYPE: Record<Bucket, Pos> = { GK: "GK", DF: "DF", DM: "MF", CM: "MF", AM: "MF", FW: "FW" };
// 스쿼드 문자 폴백 — detail 없을 때 넓은 라인만이라도.
const LETTER_BUCKET: Record<string, Bucket> = { G: "GK", D: "DF", M: "CM", F: "FW" };

export interface XiEntry { id: string; name: string; detail: string | null; bucket: Bucket }

// ============================================================
// 감독 선호 포메이션 끼워맞춤 — 선수 세부 포지션과 슬롯의 적합도(비용) 최소 배정.
// 역산만 하면 이력 포지션 분포에 따라 감독 실제 전술과 다른 포메이션이 나온다
// (캐릭 4-2-3-1 인데 4-3-2-1 표기 — post 1027 실측).
// ============================================================
type Fam = "GK" | "WB" | "CB" | "DM" | "CM" | "AM" | "W" | "ST";
const DETAIL_FAM: Record<string, Fam> = {
  GK: "GK", LB: "WB", RB: "WB", FB: "WB", CB: "CB",
  CDM: "DM", DM: "DM", CM: "CM", CAM: "AM", AM: "AM",
  LM: "W", RM: "W", LW: "W", RW: "W", W: "W", ST: "ST", CF: "ST",
};
const SLOT_FAM: Record<string, Fam> = {
  GK: "GK", LB: "WB", RB: "WB", LWB: "WB", RWB: "WB", CB: "CB",
  DM: "DM", CM: "CM", AM: "AM", LM: "W", RM: "W", LW: "W", RW: "W", ST: "ST",
};
// 패밀리 간 이동 비용 — 0=제자리, 1~3=흔한 역할 전환, 9=말이 안 됨(배정 거부 기준).
const FAM_COST: Record<Fam, Partial<Record<Fam, number>>> = {
  GK: { GK: 0 },
  WB: { WB: 0, CB: 2, W: 3, CM: 4, DM: 4 },
  CB: { CB: 0, WB: 3, DM: 3.5 },
  DM: { DM: 0, CM: 1, CB: 3, AM: 3 },
  CM: { CM: 0, DM: 1, AM: 1.5, W: 3, WB: 4 },
  AM: { AM: 0, CM: 1.5, W: 2, ST: 2.5, DM: 4 },
  W: { W: 0, AM: 1.5, ST: 2.5, CM: 3, WB: 3.5 },
  ST: { ST: 0, AM: 2, W: 2.5 },
};
type SideKey = "L" | "C" | "R";
const sideOfDetail = (d: string | null): SideKey => (d?.startsWith("L") ? "L" : d?.startsWith("R") ? "R" : "C");
const sideOfSlot = (s: Slot): SideKey => (s.x < 40 ? "L" : s.x > 60 ? "R" : "C");

function slotCost(e: XiEntry, s: Slot): number {
  const fam = e.detail ? DETAIL_FAM[e.detail] : ({ GK: "GK", DF: "CB", DM: "DM", CM: "CM", AM: "AM", FW: "ST" } as Record<Bucket, Fam>)[e.bucket];
  const base = FAM_COST[fam]?.[SLOT_FAM[s.label] ?? "CM"];
  if (base === undefined) return 9;
  const a = sideOfDetail(e.detail);
  const b = sideOfSlot(s);
  const side = a === b ? 0 : a === "C" || b === "C" ? 0.7 : 3;
  return base + side;
}

/** 감독 선호 포메이션 슬롯에 XI 를 최소 비용으로 배정. 억지 배정(비용 8+)이 생기면 null.
 *  매칭이 11명 미만이어도 배정 — 남는 슬롯은 비워 두고 운영자가 빌더에서 채운다(초안 모드). */
export function fitToFormation(entries: XiEntry[], formationKey: string, knownPids: Set<string>): Placed[] | null {
  const slots = FORMATIONS[formationKey];
  if (!slots || entries.length > slots.length) return null;
  const pairs: { ei: number; si: number; cost: number }[] = [];
  entries.forEach((e, ei) => slots.forEach((s, si) => pairs.push({ ei, si, cost: slotCost(e, s) })));
  pairs.sort((p, q) => p.cost - q.cost);
  const eUsed = new Set<number>(), sUsed = new Set<number>();
  const assign = new Map<number, number>(); // si → ei
  for (const p of pairs) {
    if (eUsed.has(p.ei) || sUsed.has(p.si)) continue;
    if (p.cost >= 8) return null; // 억지 배정 — 포메이션이 이 XI 와 안 맞음 → 역산 폴백
    eUsed.add(p.ei);
    sUsed.add(p.si);
    assign.set(p.si, p.ei);
    if (assign.size === entries.length) break;
  }
  if (assign.size !== entries.length) return null;
  return slots.flatMap((s, si) => {
    const ei = assign.get(si);
    if (ei === undefined) return [];
    const e = entries[ei];
    const known = knownPids.has(e.id);
    return [{ uid: newUid(), pid: known ? e.id : null, name: known ? null : playerKo(e.name), pos: s.pos, x: s.x, y: s.y }];
  });
}

/** XI 11명 → 풀피치 단일 보드 좌표 + 역산 포메이션. GK 1명이 아니면 null(게이트). */
export function layoutXi(entries: XiEntry[], knownPids: Set<string>): { players: Placed[]; formation: string } | null {
  const byBucket = new Map<Bucket, XiEntry[]>();
  for (const e of entries) byBucket.set(e.bucket, [...(byBucket.get(e.bucket) ?? []), e]);
  if ((byBucket.get("GK")?.length ?? 0) !== 1) return null;

  const order: Bucket[] = ["GK", "DF", "DM", "CM", "AM", "FW"];
  const lines = order.map((b) => ({ b, list: byBucket.get(b) ?? [] })).filter((l) => l.list.length > 0);
  // 필드 플레이어가 한 라인에 6명+ 몰리면 포지션 데이터 이상 — 게이트.
  if (lines.some((l) => l.b !== "GK" && l.list.length > 5)) return null;

  const players: Placed[] = [];
  const fieldLines = lines.filter((l) => l.b !== "GK");
  fieldLines.forEach((line, i) => {
    // y — 수비라인 74 부터 최전방 15 까지 균등 (formations.ts 단일 보드 관례 근사).
    const y = fieldLines.length > 1 ? 74 - (i * 59) / (fieldLines.length - 1) : 40;
    // x — 좌(0)→중(1)→우(2) 정렬 후 인원수 균등 분산.
    line.list.sort((a, b) => (SIDE_OF[a.detail ?? ""] ?? 1) - (SIDE_OF[b.detail ?? ""] ?? 1));
    const k = line.list.length;
    const gap = k > 1 ? Math.min(24, 84 / (k - 1)) : 0;
    line.list.forEach((e, j) => {
      players.push({
        uid: newUid(),
        pid: knownPids.has(e.id) ? e.id : null,
        name: knownPids.has(e.id) ? null : playerKo(e.name),
        pos: POS_TYPE[e.bucket],
        x: Math.round(50 + (j - (k - 1) / 2) * gap),
        y: Math.round(y),
      });
    });
  });
  const gk = lines.find((l) => l.b === "GK")!.list[0];
  players.push({
    uid: newUid(),
    pid: knownPids.has(gk.id) ? gk.id : null,
    name: knownPids.has(gk.id) ? null : playerKo(gk.name),
    pos: "GK", x: 50, y: 92,
  });
  const formation = fieldLines.map((l) => l.list.length).join("-");
  return { players, formation };
}

// 본문 후처리 — ① generateWithWebSearch 가 인용 경계의 text 블록들을 \n 으로 join 해
// 문장이 조각나므로 단일 개행은 결합(문단 경계 \n\n 유지). ② max_tokens 잘림 방어로
// 마지막 완결 문장(종결부호)까지만 남긴다.
function cleanBody(raw: string): string {
  let s = raw.replace(/([^\n])\n(?!\n)/g, "$1 ").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const last = Math.max(s.lastIndexOf("."), s.lastIndexOf("!"), s.lastIndexOf("?"));
  if (last > 0 && last < s.length - 1) s = s.slice(0, last + 1);
  return s.trim();
}

// 웹 검색 — 예상 선발 11명 "이름만". 포지션 배정은 절대 시키지 않는다(과거 환각 원인).
async function searchXiNames(teamNameEn: string, coachEn: string | null, signings: string[]): Promise<string[] | null> {
  const prompt = [
    `너는 ${teamNameEn} 축구 전문 기자다.`,
    `web_search 로 ${teamNameEn}${coachEn ? ` (${coachEn} 감독)` : ""} 의 가장 최근 예상 선발 라인업(predicted lineup / starting XI)을 확인해라.`,
    signings.length ? `이번 이적시장 신규 영입: ${signings.join(", ")}. 매체가 주전으로 예상하면 포함해라.` : "",
    `규칙: 반드시 web_search 결과에 근거할 것. 이름을 추측으로 지어내지 말 것. 그 팀 현 소속(확정 영입 포함) 선수만. 정확히 11명.`,
    `출력 규칙(엄수): 분석·설명·검색계획 서술 금지. 검색이 끝나면 다른 말 없이 JSON 한 줄만 출력하고 멈춰라: {"players":["영문 풀네임", ... 11개]}`,
  ].filter(Boolean).join("\n");
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      // XI 검색은 sonnet — haiku 는 검색 서술만 하다 JSON 을 못 내는 실측(2026-07-15). 본문은 기본 모델.
      raw = await generateWithWebSearch(prompt, { maxTokens: 3000, maxUses: 5, model: process.env.TRANSFER_XI_MODEL || "claude-sonnet-5" });
    } catch (e) {
      console.warn(`[transfer-xi] 웹 XI 검색 실패(${attempt + 1}/2):`, (e as Error).message);
      continue;
    }
    const jm = raw.replace(/```(?:json)?/gi, "").match(/\{[\s\S]*\}/);
    if (!jm) {
      console.warn(`[transfer-xi] 웹 XI JSON 없음(${attempt + 1}/2) — 응답 앞부분: ${raw.slice(0, 200)}`);
      continue;
    }
    try {
      const p = JSON.parse(jm[0]) as { players?: unknown };
      if (Array.isArray(p.players) && p.players.length === 11 && p.players.every((x) => typeof x === "string")) {
        return p.players as string[];
      }
      console.warn(`[transfer-xi] 웹 XI players 형식 불일치(${attempt + 1}/2): ${jm[0].slice(0, 200)}`);
    } catch {
      console.warn(`[transfer-xi] 웹 XI JSON invalid(${attempt + 1}/2): ${jm[0].slice(0, 200)}`);
    }
  }
  return null;
}

export async function runGenerateTransferXi(opts?: { dryRun?: boolean; forceTeamId?: string }) {
  // 최근 48h 주목 이적 — updatedAt=first-seen (transfer-daily 와 동일 근거).
  const rows = await prisma.footballTransfer.findMany({
    where: {
      updatedAt: { gte: new Date(Date.now() - 48 * 3600 * 1000) },
      league: { in: FEED_LEAGUES },
      toTeamId: { not: null },
      transferType: { not: 2 },
    },
  });
  const mvMap = new Map(
    (await prisma.playerMarketValue.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.playerId))] } },
      select: { id: true, currentValue: true },
    })).map((r) => [r.id, r.currentValue ?? 0]),
  );
  const moves: Move[] = rows
    .filter((r) => r.toTeamName && !PSEUDO_TEAMS.has(r.toTeamName))
    .map((r) => ({
      playerId: r.playerId,
      playerName:
        T_SQUADS[r.toTeamId!]?.squad.find((p) => p.id === r.playerId)?.name ??
        (r.fromTeamId ? T_SQUADS[r.fromTeamId]?.squad.find((p) => p.id === r.playerId)?.name : null) ?? null,
      fromTeamName: r.fromTeamName,
      toTeamId: r.toTeamId!,
      toTeamName: r.toTeamName!,
      league: r.league!,
      fee: r.transferFee ?? 0,
      transferType: r.transferType,
      mv: mvMap.get(r.playerId) ?? 0,
    }))
    .filter((m) => m.playerName && (m.fee > 0 || m.mv >= NOTABLE_MV));
  if (moves.length === 0 && !opts?.forceTeamId) return { posted: false, reason: "quiet" };

  // 최근 7일 발행 팀 제외 — 운영자가 수동 발행한 예상 XI 글(전술판 첨부 + "예상 XI" 제목) 기준.
  const recent = await prisma.post.findMany({
    where: { lineupCode: { not: null }, title: { contains: "예상 XI" }, createdAt: { gte: new Date(Date.now() - 7 * 86400e3) } },
    select: { title: true },
  });

  const byTeam = new Map<string, { moves: Move[]; score: number }>();
  for (const m of moves) {
    const t = byTeam.get(m.toTeamId) ?? { moves: [], score: 0 };
    t.moves.push(m);
    t.score += m.fee + m.mv;
    byTeam.set(m.toTeamId, t);
  }
  const ranked = [...byTeam.entries()].sort((a, b) => b[1].score - a[1].score);
  const focus = opts?.forceTeamId
    ? ([opts.forceTeamId, byTeam.get(opts.forceTeamId) ?? { moves: [], score: FOCUS_MIN_SCORE }] as const)
    : ranked.find(([id, t]) => {
        if (t.score < FOCUS_MIN_SCORE || !T_SQUADS[id]?.squad?.length) return false;
        const ko = teamKo(t.moves[0].toTeamName, t.moves[0].league);
        return !recent.some((p) => p.title.includes(ko));
      });
  if (!focus) return { posted: false, reason: "no-focus" };

  const [focusId, focusTeam] = focus;
  const squad = T_SQUADS[focusId]?.squad ?? [];
  if (!squad.length) return { posted: false, reason: "no-squad" };
  const sample = focusTeam.moves[0] ?? null;
  const teamNameEn = sample?.toTeamName ?? squad[0]?.name ?? focusId;
  const league = sample?.league ?? "EPL";
  const focusKo = teamKo(teamNameEn, league);
  const coach = T_COACHES[focusId];

  // 웹 검색 #1 — 선발 이름 11개.
  const xiNames = await searchXiNames(teamNameEn, coach?.name ?? null, focusTeam.moves.map((m) => m.playerName!));
  if (!xiNames) return { posted: false, reason: "no-xi" };

  // 이름 → id 매칭 (스쿼드 + 영입 기록). 게이트: 9/11 미만 스킵.
  const moveAsSquad: SquadPlayer[] = focusTeam.moves.map((m) => ({ id: m.playerId, name: m.playerName!, position: null, number: null }));
  const pool = [...squad, ...moveAsSquad.filter((m) => !squad.some((s) => s.id === m.id))];
  const used = new Set<string>();
  const entries: XiEntry[] = [];
  const unmatched: string[] = [];
  let matched = 0;
  for (const name of xiNames) {
    const hit = matchSquadPlayer(name, pool);
    if (hit && !used.has(hit.id)) {
      used.add(hit.id);
      matched++;
      const det = DETAIL_POS[hit.id];
      const bucket = (det?.primary && BUCKET_OF[det.primary]) || LETTER_BUCKET[hit.position ?? ""] || "CM";
      entries.push({ id: hit.id, name: hit.name, detail: det?.primary ?? null, bucket });
    } else {
      unmatched.push(name);
    }
  }
  if (matched < 9) {
    console.warn(`[transfer-xi] 이름 매칭 ${matched}/11 부족(${focusKo}) — 스킵`);
    return { posted: false, reason: "low-match", matched };
  }
  const withDetail = entries.filter((e) => e.detail).length;
  if (withDetail < 8) {
    console.warn(`[transfer-xi] 세부 포지션 ${withDetail}/11 부족(${focusKo}) — 스킵`);
    return { posted: false, reason: "low-detail", withDetail };
  }

  // pid 게이트 겸 한글명 — XI + 영입 당사자(벤치·제목·불릿 표기용) 모두.
  const nameIds = [...new Set([...entries.map((e) => e.id), ...focusTeam.moves.map((m) => m.playerId)])];
  const names = new Map<string, string | null>(
    (await prisma.theSportsPlayer.findMany({ where: { id: { in: nameIds } }, select: { id: true, nameKo: true } }))
      .map((r) => [r.id, r.nameKo]),
  );
  // 배치 — 감독 선호 포메이션 끼워맞춤 1순위, 안 맞으면(억지 배정) 라인 역산 폴백.
  const knownPids = new Set(names.keys());
  const pref = coach?.preferredFormation;
  const fitted = pref && FORMATIONS[pref] ? fitToFormation(entries, pref, knownPids) : null;
  const laid = fitted
    ? { players: fitted, formation: pref! }
    : layoutXi(entries, knownPids);
  if (!laid) {
    console.warn(`[transfer-xi] 배치 실패(GK ${entries.filter((e) => e.bucket === "GK").length}명 등) — 스킵`);
    return { posted: false, reason: "layout" };
  }
  if (pref && !fitted) console.warn(`[transfer-xi] 선호 포메이션 ${pref} 끼워맞춤 실패 — 역산(${laid.formation})으로 폴백`);

  // 벤치 — XI 에 못 든 신규 영입 (전술판 하단 노출).
  const bench: BenchEntry[] = focusTeam.moves
    .filter((m) => !used.has(m.playerId))
    .slice(0, 5)
    .map((m) => ({ pid: m.playerId, name: null }));

  const board: BoardState = {
    mode: "single",
    displayMode: "photo",
    orientation: "portrait",
    title: `${focusKo} 영입 반영 예상 XI`,
    subtitle: `${coach?.nameKo || coach?.name || "감독 미정"} · ${laid.formation}`,
    kit: "grass",
    home: { club: focusKo, formation: laid.formation, players: laid.players },
    bench,
    strokes: [],
  };

  // XI 명단 텍스트 — 라인별.
  // XI 명단 — 보드 배치(슬롯) 기준으로 그룹핑해 전술판과 일치시킨다
  // (이력 포지션 기준이면 4-2-3-1 인데 FW 2명으로 표기되는 어긋남 — post 1028 초판 실측).
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const placedName = (p: Placed) =>
    p.pid ? playerKo(entryById.get(p.pid)?.name ?? p.pid, names.get(p.pid)) : (p.name ?? "?");
  // 같은 시각적 라인(y 미세 차이)은 좌→우로만 — /15 반올림으로 라인 단위 그룹핑.
  const lineNames = (pos: Pos) =>
    laid.players.filter((p) => p.pos === pos)
      .sort((a, b) => Math.round(b.y / 15) - Math.round(a.y / 15) || a.x - b.x)
      .map(placedName).join(", ");
  const xiBlock = [
    `**예상 베스트 XI (${laid.formation})**`,
    `- GK: ${lineNames("GK")}`,
    `- DF: ${lineNames("DF")}`,
    `- MF: ${lineNames("MF")}`,
    `- FW: ${lineNames("FW")}`,
  ].join("\n");

  const signingLines = focusTeam.moves.map(
    (m) => `- **${playerKo(m.playerName, names.get(m.playerId))}** (${teamKo(m.fromTeamName, m.league)} → ${focusKo}, ${moveLabel(m)})${m.mv > 0 ? ` · 시장가치 ${fmtFee(m.mv)}` : ""}`,
  );

  // 웹 검색 #2 — 전술 분석 본문 (페르소나 톤, 팩트 고정·창작 차단).
  // haiku 는 검색 결과 문장을 조각째 인용해 붙이는 실측 문제 → sonnet 고정.
  let body = "";
  try {
    body = (await generateWithWebSearch(
      [
        `너는 한국 축구 커뮤니티 회원이다. 말투: ${PERSONA_TONE}. "~다/~것 같다" 체, 존댓말 금지.`,
        `web_search 로 ${teamNameEn} 의 최근 전술 성향·새 영입 활용 전망을 확인하고, 아래 사실만 근거로 3~4문단 분석 글을 써라.`,
        `사실: 감독 ${coach?.nameKo || coach?.name || "미정"}, 예상 포메이션 ${laid.formation}, 신규 영입 ${focusTeam.moves.map((m) => `${playerKo(m.playerName, names.get(m.playerId))}(${DETAIL_POS[m.playerId]?.primary ?? "포지션 미상"})`).join(", ")}.`,
        `규칙: 검색 과정·"확인해보겠습니다" 류 서술 금지 — 완성된 글만. 검색 결과 문장을 그대로 인용하지 말고 전부 네 문장으로 소화해서 쓸 것. 이모지·헤딩(#)·리스트 금지(문단 텍스트만). 금액·이적료·시장가치·구체 통계수치 언급 금지. 선발 11명 명단 나열 금지(아래에 코드가 붙임). 위 사실에 없는 선수명 창작 금지. 확정 단정 대신 "기대된다/보인다" 톤. 700자 이내.`,
      ].join("\n"),
      { maxTokens: 3000, maxUses: 3, model: process.env.TRANSFER_XI_MODEL || "claude-sonnet-5" },
    )).trim();
    body = cleanBody(body);
  } catch (e) {
    console.warn("[transfer-xi] 본문 생성 실패 — 짧은 고정 문구로 발행:", (e as Error).message);
    body = `${focusKo} 이번 영입 반영해서 예상 XI 한번 짜봤다. 포메이션은 최근 기조 기준 ${laid.formation}.`;
  }

  const keySigning = focusTeam.moves.sort((a, b) => b.fee + b.mv - (a.fee + a.mv))[0];
  const title = keySigning
    ? `${playerKo(keySigning.playerName, names.get(keySigning.playerId))} 품은 ${focusKo} 예상 XI 뜯어봤다 (${laid.formation})`
    : `${focusKo} 영입 반영 예상 XI 뜯어봤다 (${laid.formation})`;

  const content = [
    body,
    xiBlock,
    signingLines.length ? [`**이번 영입 정리**`, ...signingLines].join("\n") : "",
    `전술판은 아래에. 여러분이 감독이면 어디 바꿀 건지 [직접 수정](/lineup)해서 댓글로.`,
  ].filter((s) => s && s.trim()).join("\n\n");
  const lineupCode = encodeBoard(board);

  if (opts?.dryRun) {
    return { posted: false, reason: "dryRun", title, content, lineupCode, formation: laid.formation, matched, withDetail, entries: entries.map((e) => `${e.name}:${e.detail ?? "?"}→${e.bucket}`) };
  }

  // 텔레그램 초안 전송 — 발행은 운영자가 직접 (본문 붙여넣기 + 전술판 첨부).
  // 전술판 초안 링크: 봇이 계산한 배치가 빌더에 미리 로드돼 수정만 하면 됨.
  const siteUrl = process.env.SITE_URL || "https://www.scorebase.kr";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const message = [
    `<b>[예상 XI 초안] ${esc(title)}</b>`,
    ``,
    esc(content),
    ``,
    ...(unmatched.length ? [`주의: 웹 XI 매칭 ${matched}/11 — 미매칭(전술판에 직접 추가 필요): ${esc(unmatched.join(", "))}`] : []),
    `전술판 초안(빌더에서 열어 수정): ${siteUrl}/lineup?d=${lineupCode}`,
  ].join("\n");
  await sendTelegram(message);
  console.log(`[transfer-xi] 초안 전송: ${title}`);
  return { sent: true, focus: focusId, formation: laid.formation, title };
}

// tsx 직접 실행 (npm run job:transfer-xi) — `--dry` 미리보기, `--team=<tsId>` 팀 강제.
if (import.meta.url === `file://${process.argv[1]}`) {
  const teamArg = process.argv.find((a) => a.startsWith("--team="))?.slice(7);
  runGenerateTransferXi({ dryRun: process.argv.includes("--dry"), forceTeamId: teamArg })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
