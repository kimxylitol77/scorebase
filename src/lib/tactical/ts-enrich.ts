// 전술 리뷰 컨텍스트 보강 — TheSports 매치 캐시(라인업 좌표·감독·인시던트·선수별 경기 스탯)를
// 한글 이름으로 풀어 프롬프트 텍스트·이름 링크 목록·/lineup 전술판 공유 코드로 만든다.
// 캐시가 없으면 전부 빈 값 — 호출부는 기존 컨텍스트만으로 진행한다.

import { prisma } from "@/lib/db";
import { coachById } from "@/lib/coach-photos";
import { coachPageHref } from "@/lib/coach-page-link";
import { toKoreanCoachName } from "@/lib/coach-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import { encodeBoard, newUid, type BoardState, type Placed } from "@/lib/lineup/lineup-state";
import type { Pos } from "@/lib/lineup/formations";

interface TsLineupPlayer {
  id?: string;
  name?: string;
  first?: number;
  position?: string; // G/D/M/F
  shirt_number?: number;
  x?: number;
  y?: number; // 자기 골문 = 0
  rating?: string | number;
  captain?: number;
}
interface TsLineup {
  coach_id?: { home?: string; away?: string };
  home_formation?: string;
  away_formation?: string;
  lineup?: { home?: TsLineupPlayer[] | Record<string, TsLineupPlayer>; away?: TsLineupPlayer[] | Record<string, TsLineupPlayer> };
}
interface TsIncident {
  time?: number;
  add_time?: number;
  type?: number;
  position?: number; // 1 홈 · 2 원정
  player_id?: string;
  player_name?: string;
  assist1_id?: string;
  assist1_name?: string;
  in_player_id?: string;
  in_player_name?: string;
  out_player_id?: string;
  out_player_name?: string;
  home_score?: number;
  away_score?: number;
}
interface TsPlayerStat {
  player_id?: string;
  minutes_played?: number;
  rating?: string | number;
  passes?: number;
  passes_accuracy?: number;
  key_passes?: number;
  tackles?: number;
  interceptions?: number;
  clearances?: number;
  duels?: number;
  duels_won?: number;
  dribble?: number;
  dribble_succ?: number;
  shots?: number;
  shots_on_target?: number;
  big_chance_created?: number;
  big_chance_missed?: number;
  crosses?: number;
  long_balls?: number;
  saves?: number;
  fouls?: number;
  was_fouled?: number;
}

export interface NameLink {
  name: string;
  href: string;
}
/** 도식 한 명 — 피치 % 좌표(x 좌→우, y 위→아래, 자기 팀이 위로 공격), 역할 약어, 한글명. */
export interface ShapePlayer {
  name: string;
  role: string; // GK·CB·LB·RB·DM·CM·AM·LM·RM·LW·RW·ST
  line: "G" | "D" | "M" | "F";
  x: number;
  y: number;
}
/** 본문 삽입용 전술 도식 데이터 — 한 팀의 셋업(색 마커+라인)과 상대 형태(흰 마커, 미러링). */
export interface ShapeFigure {
  side: "home" | "away";
  team: string;
  formation: string | null;
  coach: string | null;
  players: ShapePlayer[];
  opponent: string;
  opponentFormation: string | null;
  opponentPlayers: ShapePlayer[];
}
export interface TsEnrichment {
  /** 프롬프트 [경기 데이터] 에 덧붙일 줄들. */
  lines: string[];
  /** 본문 자동 링크용 — 한글 표기 → 페이지 경로(등재된 선수·감독만). */
  links: NameLink[];
  /** /lineup?d= 전술판 프리로드 코드(양 팀 선발 좌표). 좌표 결손이면 null. */
  lineupCode: string | null;
  /** 본문 도식(홈 셋업·원정 셋업). 좌표 결손이면 빈 배열. */
  shapes: ShapeFigure[];
}

/** ts 포지션(G/D/M/F) + 좌표 → 역할 약어. x 는 자기 팀 기준 좌→우 0~100, y 는 자기 골문 0. */
function roleOf(pos: string, x: number, y: number): { role: string; line: ShapePlayer["line"] } {
  if (pos === "G") return { role: "GK", line: "G" };
  if (pos === "D") return { role: x < 33 ? "LB" : x > 67 ? "RB" : "CB", line: "D" };
  if (pos === "M") {
    if (x < 22) return { role: "LM", line: "M" };
    if (x > 78) return { role: "RM", line: "M" };
    return { role: y < 42 ? "DM" : y < 60 ? "CM" : "AM", line: "M" };
  }
  return { role: x < 33 ? "LW" : x > 67 ? "RW" : "ST", line: "F" };
}

const POS_KO: Record<string, string> = { G: "GK", D: "DF", M: "MF", F: "FW" };
const POS_BOARD: Record<string, Pos> = { G: "GK", D: "DF", M: "MF", F: "FW" };
// ts incident 코드 — 실측 확정표(메모리 ts-substitution-direction): 1 골 · 8 PK골 · 17 자책골 · 29 연장골 · 9 교체(in=투입) · 3 경고 · 4 퇴장 · 15 경고누적 퇴장 · 28 VAR
const GOAL_TYPES: Record<number, string> = { 1: "골", 8: "PK 골", 17: "자책골", 29: "골(연장)" };

const toArr = (v: TsLineupPlayer[] | Record<string, TsLineupPlayer> | undefined): TsLineupPlayer[] =>
  Array.isArray(v) ? v : v ? Object.values(v) : [];
const num = (v: string | number | undefined | null): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

export async function buildTsEnrichment(matchId: number, homeKo: string, awayKo: string): Promise<TsEnrichment> {
  const empty: TsEnrichment = { lines: [], links: [], lineupCode: null, shapes: [] };
  const cache = await prisma.theSportsMatchCache.findUnique({
    where: { matchId },
    select: { lineup: true, detailLive: true, playerStats: true },
  });
  if (!cache) return empty;
  const lu = (cache.lineup ?? null) as TsLineup | null;
  const incidents = ((cache.detailLive as { incidents?: TsIncident[] } | null)?.incidents ?? []).filter(
    (i): i is TsIncident => !!i && typeof i === "object",
  );
  const stats = (Array.isArray(cache.playerStats) ? cache.playerStats : []) as TsPlayerStat[];

  const homeAll = toArr(lu?.lineup?.home);
  const awayAll = toArr(lu?.lineup?.away);
  const homeIds = new Set(homeAll.map((p) => p.id).filter((v): v is string => !!v));
  const awayIds = new Set(awayAll.map((p) => p.id).filter((v): v is string => !!v));

  // ── 이름 사전: ts id → 한글 (TheSportsPlayer.nameKo → 위키 사전 → 영문) ──
  const ids = new Set<string>([...homeIds, ...awayIds]);
  for (const i of incidents) for (const k of ["player_id", "assist1_id", "in_player_id", "out_player_id"] as const) if (i[k]) ids.add(i[k]!);
  const rawNameById = new Map<string, string>();
  for (const p of [...homeAll, ...awayAll]) if (p.id && p.name) rawNameById.set(p.id, clean(p.name));
  for (const i of incidents) {
    if (i.player_id && i.player_name) rawNameById.set(i.player_id, clean(i.player_name));
    if (i.assist1_id && i.assist1_name) rawNameById.set(i.assist1_id, clean(i.assist1_name));
    if (i.in_player_id && i.in_player_name) rawNameById.set(i.in_player_id, clean(i.in_player_name));
    if (i.out_player_id && i.out_player_name) rawNameById.set(i.out_player_id, clean(i.out_player_name));
  }
  const registered = new Set<string>();
  const koById = new Map<string, string>();
  if (ids.size > 0) {
    const rows = await prisma.theSportsPlayer.findMany({ where: { id: { in: [...ids] } }, select: { id: true, nameKo: true } });
    for (const r of rows) {
      registered.add(r.id);
      if (r.nameKo) koById.set(r.id, r.nameKo);
    }
  }
  // 표기 우선순위: 위키 표제어 사전(toKoreanPlayerName, 미매핑이면 원문 반환) → TheSportsPlayer.nameKo(야간 봇 음역,
  // "니콜라 작송"류 오기가 섞임 — 2026-09-05 실측) → 영문 원문.
  const nameOf = (id: string | undefined, fallback?: string): string => {
    const raw = clean(fallback) || (id ? rawNameById.get(id) ?? "" : "");
    const dict = raw ? toKoreanPlayerName(raw) : "";
    if (dict && /[가-힣]/.test(dict)) return dict;
    if (id && koById.has(id)) return koById.get(id)!;
    return raw || "선수";
  };

  const links: NameLink[] = [];
  const seenLink = new Set<string>();
  const pushLink = (name: string, href: string) => {
    if (!name || name === "선수" || seenLink.has(name)) return;
    seenLink.add(name);
    links.push({ name, href });
  };
  // 등재된(선수 페이지가 있는) 선수만 링크 — 무조건 걸면 미등록 선수가 404 (live 페이지와 같은 원칙)
  for (const id of ids) if (registered.has(id)) pushLink(nameOf(id), `/transfers/${id}`);

  const lines: string[] = [];

  // ── 감독 ──
  const coachLine = (id: string | undefined, teamKo: string) => {
    const c = coachById(id);
    const ko = c?.nameKo ?? toKoreanCoachName(c?.name) ?? null;
    if (!ko) return null;
    const href = coachPageHref(id);
    if (href) pushLink(ko, href);
    return `${teamKo} ${ko}`;
  };
  const ch = coachLine(lu?.coach_id?.home, homeKo);
  const ca = coachLine(lu?.coach_id?.away, awayKo);
  if (ch || ca) lines.push(`[감독] ${[ch, ca].filter(Boolean).join(" / ")}`);

  // ── 선발 XI (한글·포지션·등번호·평점) ──
  const xiLine = (arr: TsLineupPlayer[], teamKo: string, formation?: string) => {
    const xi = arr.filter((p) => p.first === 1);
    if (xi.length === 0) return;
    const order: Record<string, number> = { G: 0, D: 1, M: 2, F: 3 };
    xi.sort((a, b) => (order[a.position ?? ""] ?? 9) - (order[b.position ?? ""] ?? 9));
    const s = xi
      .map((p) => {
        const r = num(p.rating);
        return `${nameOf(p.id, p.name)}(${POS_KO[p.position ?? ""] ?? p.position ?? "?"}${p.shirt_number ? ` #${p.shirt_number}` : ""}${p.captain === 1 ? " 주장" : ""}${r != null ? ` 평점 ${r.toFixed(1)}` : ""})`;
      })
      .join(", ");
    lines.push(`[${teamKo} 선발 XI${formation ? ` ${formation}` : ""}] ${s}`);
  };
  xiLine(homeAll, homeKo, lu?.home_formation);
  xiLine(awayAll, awayKo, lu?.away_formation);

  // ── 타임라인 (골·교체·카드·VAR) ──
  const tl: string[] = [];
  const side = (i: TsIncident) => (i.position === 1 ? homeKo : i.position === 2 ? awayKo : "");
  // ts time 은 추가시간을 합산한 값(96) 이고 add_time 이 그 중 추가분(6) — "90+6'" 로 표기.
  const minute = (i: TsIncident) =>
    i.add_time && i.time != null ? `${i.time - i.add_time}+${i.add_time}'` : `${i.time ?? "?"}'`;
  const sorted = [...incidents].sort((a, b) => (a.time ?? 0) - (b.time ?? 0) || (a.add_time ?? 0) - (b.add_time ?? 0));
  for (const i of sorted) {
    const t = i.type ?? -1;
    if (GOAL_TYPES[t]) {
      const score = i.home_score != null && i.away_score != null ? ` → ${i.home_score}-${i.away_score}` : "";
      const assist = i.assist1_id || i.assist1_name ? ` (도움 ${nameOf(i.assist1_id, i.assist1_name)})` : "";
      tl.push(`${minute(i)} ${GOAL_TYPES[t]} ${side(i)} ${nameOf(i.player_id, i.player_name)}${assist}${score}`);
    } else if (t === 9) {
      tl.push(`${minute(i)} 교체 ${side(i)} IN ${nameOf(i.in_player_id, i.in_player_name)} / OUT ${nameOf(i.out_player_id, i.out_player_name)}`);
    } else if (t === 3) {
      tl.push(`${minute(i)} 경고 ${side(i)} ${nameOf(i.player_id, i.player_name)}`);
    } else if (t === 4 || t === 15) {
      tl.push(`${minute(i)} 퇴장${t === 15 ? "(경고 누적)" : ""} ${side(i)} ${nameOf(i.player_id, i.player_name)}`);
    } else if (t === 28) {
      tl.push(`${minute(i)} VAR 판독 ${side(i)}${i.player_id || i.player_name ? ` ${nameOf(i.player_id, i.player_name)} 관련` : ""}`);
    }
  }
  if (tl.length) lines.push(`[타임라인]\n${tl.map((s) => `  ${s}`).join("\n")}`);

  // ── 선수별 경기 스탯 하이라이트 (팀별) ──
  const statLines = (memberIds: Set<string>, teamKo: string) => {
    const rows = stats.filter((s) => s.player_id && memberIds.has(s.player_id) && (s.minutes_played ?? 0) > 0);
    if (rows.length === 0) return;
    const nm = (s: TsPlayerStat) => nameOf(s.player_id);
    const top = (key: keyof TsPlayerStat, n = 1) =>
      [...rows].filter((s) => (num(s[key] as number) ?? 0) > 0).sort((a, b) => (num(b[key] as number) ?? 0) - (num(a[key] as number) ?? 0)).slice(0, n);
    const out: string[] = [];
    const byRating = [...rows].filter((s) => num(s.rating) != null).sort((a, b) => (num(b.rating) ?? 0) - (num(a.rating) ?? 0)).slice(0, 3);
    if (byRating.length) out.push(`평점 상위 ${byRating.map((s) => `${nm(s)} ${num(s.rating)!.toFixed(1)}(${s.minutes_played}분)`).join(", ")}`);
    const kp = top("key_passes", 2);
    if (kp.length) out.push(`키패스 ${kp.map((s) => `${nm(s)} ${s.key_passes}`).join(", ")}`);
    const ps = top("passes", 2);
    if (ps.length) out.push(`패스 ${ps.map((s) => `${nm(s)} ${s.passes}회${s.passes_accuracy != null ? `(성공 ${s.passes_accuracy})` : ""}`).join(", ")}`);
    const tk = top("tackles", 2);
    if (tk.length) out.push(`태클 ${tk.map((s) => `${nm(s)} ${s.tackles}`).join(", ")}`);
    const ic = top("interceptions", 1);
    if (ic.length) out.push(`인터셉트 ${ic.map((s) => `${nm(s)} ${s.interceptions}`).join(", ")}`);
    const dw = top("duels_won", 2);
    if (dw.length) out.push(`듀얼 승리 ${dw.map((s) => `${nm(s)} ${s.duels_won}/${s.duels ?? "?"}`).join(", ")}`);
    const dr = top("dribble_succ", 1);
    if (dr.length) out.push(`드리블 성공 ${dr.map((s) => `${nm(s)} ${s.dribble_succ}/${s.dribble ?? "?"}`).join(", ")}`);
    const sh = top("shots", 2);
    if (sh.length) out.push(`슈팅 ${sh.map((s) => `${nm(s)} ${s.shots}(유효 ${s.shots_on_target ?? 0})`).join(", ")}`);
    const bc = top("big_chance_created", 1);
    if (bc.length) out.push(`빅찬스 창출 ${bc.map((s) => `${nm(s)} ${s.big_chance_created}`).join(", ")}`);
    const bm = top("big_chance_missed", 1);
    if (bm.length) out.push(`빅찬스 실축 ${bm.map((s) => `${nm(s)} ${s.big_chance_missed}`).join(", ")}`);
    const sv = top("saves", 1);
    if (sv.length) out.push(`선방 ${sv.map((s) => `${nm(s)} ${s.saves}`).join(", ")}`);
    if (out.length) lines.push(`[${teamKo} 선수 스탯]\n${out.map((s) => `  - ${s}`).join("\n")}`);
  };
  statLines(homeIds, homeKo);
  statLines(awayIds, awayKo);

  // ── /lineup 전술판 코드 (맞대결 보드, 실좌표) ──
  // 보드 좌표 규약은 LineupBuilder.placeY 와 동일: 홈=아래(50+y*0.46)·원정=위(50-y*0.46), y 는 공격 방향이 0.
  // ts y 는 자기 골문이 0 이므로 100-y 로 뒤집는다. ts x 는 "아래로 공격" 화면 기준이라 위로 공격하는 홈만 x 를 뒤집는다.
  let lineupCode: string | null = null;
  const placedOf = (arr: TsLineupPlayer[], sideKey: "home" | "away"): Placed[] | null => {
    const xi = arr.filter((p) => p.first === 1);
    if (xi.length < 7 || xi.filter((p) => (p.x ?? 0) > 0 || (p.y ?? 0) > 0).length < 7) return null;
    return xi.map((p) => {
      const attackY = 100 - (p.y ?? 50);
      return {
        uid: newUid(),
        pid: null,
        name: nameOf(p.id, p.name),
        pos: POS_BOARD[p.position ?? ""] ?? "MF",
        x: sideKey === "away" ? (p.x ?? 50) : 100 - (p.x ?? 50),
        y: sideKey === "away" ? Math.round(50 - attackY * 0.46) : Math.round(50 + attackY * 0.46),
      };
    });
  };
  const hp = placedOf(homeAll, "home");
  const ap = placedOf(awayAll, "away");
  if (hp && ap) {
    const board: BoardState = {
      mode: "versus",
      displayMode: "name",
      orientation: "portrait",
      title: `${homeKo} vs ${awayKo}`,
      subtitle: `${lu?.home_formation ?? ""} vs ${lu?.away_formation ?? ""}`.trim(),
      kit: "grass",
      home: { club: homeKo, formation: lu?.home_formation ?? null, players: hp },
      away: { club: awayKo, formation: lu?.away_formation ?? null, players: ap },
      bench: [],
      strokes: [],
    };
    lineupCode = encodeBoard(board);
  }

  // ── 본문 도식 — 각 팀 셋업(위로 공격) + 상대 형태(미러링) ──
  const shapePlayers = (arr: TsLineupPlayer[], mirror: boolean): ShapePlayer[] | null => {
    const xi = arr.filter((p) => p.first === 1);
    if (xi.length < 7 || xi.filter((p) => (p.x ?? 0) > 0 || (p.y ?? 0) > 0).length < 7) return null;
    return xi.map((p) => {
      const rx = p.x ?? 50, ry = p.y ?? 50;
      // ts 좌표는 "아래로 공격하는 화면" 기준(SoccerLineupSvg 헤더 규약: home left%=x, top%=y·0.5).
      // 그래서 x 가 작을수록 그 팀의 오른쪽 측면이다 — 역할 판정은 팀 기준 좌우로 뒤집어 넣는다.
      const { role, line } = roleOf(p.position ?? "M", 100 - rx, ry);
      // 자기 팀은 위로 공격 → left% = 100-x, top% = 100-y. 상대는 아래로 공격 → left% = x, top% = y.
      return {
        name: nameOf(p.id, p.name),
        role,
        line,
        x: mirror ? rx : 100 - rx,
        y: mirror ? ry : 100 - ry,
      };
    });
  };
  const shapes: ShapeFigure[] = [];
  const hs = shapePlayers(homeAll, false), asOpp = shapePlayers(awayAll, true);
  const as_ = shapePlayers(awayAll, false), hsOpp = shapePlayers(homeAll, true);
  const coachKo = (id: string | undefined) => {
    const c = coachById(id);
    return c?.nameKo ?? toKoreanCoachName(c?.name) ?? null;
  };
  if (hs && asOpp && as_ && hsOpp) {
    shapes.push({
      side: "home", team: homeKo, formation: lu?.home_formation ?? null, coach: coachKo(lu?.coach_id?.home), players: hs,
      opponent: awayKo, opponentFormation: lu?.away_formation ?? null, opponentPlayers: asOpp,
    });
    shapes.push({
      side: "away", team: awayKo, formation: lu?.away_formation ?? null, coach: coachKo(lu?.coach_id?.away), players: as_,
      opponent: homeKo, opponentFormation: lu?.home_formation ?? null, opponentPlayers: hsOpp,
    });
  }

  return { lines, links, lineupCode, shapes };
}

/** 본문에서 도식 자리를 표시하는 토큰 — 글 페이지가 이 토큰 위치에 TacticalShapeFigure 를 렌더한다. */
export const SHAPE_TOKEN = { home: "{{tactical-shape:home}}", away: "{{tactical-shape:away}}" } as const;
export const SHAPE_TOKEN_RE = /\{\{tactical-shape:(home|away)\}\}/g;

/**
 * "## 두 감독의 셋업" 섹션 끝(다음 ## 직전)에 도식 토큰 두 개를 끼운다.
 * 그 섹션이 없으면 첫 ## 섹션 뒤에. 이미 토큰이 있으면 그대로.
 */
export function insertShapeTokens(md: string): string {
  if (/\{\{tactical-shape:(home|away)\}\}/.test(md)) return md; // /g 정규식의 lastIndex 상태 회피
  const lines = md.split("\n");
  let start = lines.findIndex((l) => /^##\s+두 감독의 셋업/.test(l));
  if (start === -1) start = lines.findIndex((l) => /^##\s/.test(l));
  if (start === -1) return `${md}\n\n${SHAPE_TOKEN.home}\n\n${SHAPE_TOKEN.away}`;
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end === -1) end = lines.length;
  lines.splice(end, 0, "", SHAPE_TOKEN.home, "", SHAPE_TOKEN.away, "");
  return lines.join("\n");
}

/**
 * 본문의 선수·감독 이름 첫 등장에 마크다운 링크를 건다. 제목(#)·굵은 리드 줄·기존 링크 안은 건드리지 않는다.
 * 긴 이름부터 치환해 "손흥민"이 "손흥"류 부분 일치로 깨지는 것을 막는다.
 */
export function linkNamesInMarkdown(md: string, links: NameLink[]): string {
  if (links.length === 0) return md;
  const hrefByName = new Map(links.map((l) => [l.name, l.href]));
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 한 번의 좌→우 스캔으로 겹침 없이 치환 — 치환으로 생긴 링크 텍스트가 다시 매칭되지 않는다.
  const re = new RegExp([...hrefByName.keys()].sort((a, b) => b.length - a.length).map(esc).join("|"), "g");
  const done = new Set<string>();
  return md
    .split("\n")
    .map((line) => {
      if (line.startsWith("#") || /^\*\*.*\*\*$/.test(line.trim())) return line;
      // 기존 링크·이미지 토큰은 보호 — 텍스트 조각만 치환
      return line
        .split(/(!?\[[^\]]*\]\([^)]*\))/g)
        .map((part) =>
          /^!?\[[^\]]*\]\([^)]*\)$/.test(part)
            ? part
            : part.replace(re, (name) => {
                if (done.has(name)) return name;
                done.add(name);
                return `[${name}](${hrefByName.get(name)})`;
              }),
        )
        .join("");
    })
    .join("\n");
}
