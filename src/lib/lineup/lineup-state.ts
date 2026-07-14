// 라인업 전술판 상태 ↔ 공유 URL 문자열(base64url) 인코딩/디코딩. 빌더(브라우저)·OG 카드(노드) 공용.
// 슬롯키는 저장하지 않는다 — 포메이션이 슬롯 순서를 고정하므로 픽을 순서대로 11칸 배열로만 보관.
import { FORMATIONS, type Pos } from "./formations";
import type { Stroke } from "./drawing";

// 픽: 실선수 = pid 문자열, 커스텀 = { n: 이름 }, 빈자리 = null.
export type SlotPick = string | { n: string };

export interface LineupState {
  f: string; // 포메이션 key
  t: string; // 팀명(타이틀)
  s: string; // 부제
  k: string; // 키트색 key
  p: (SlotPick | null)[]; // 슬롯 순서대로
}

function b64urlEncode(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 =
    typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(code: string): string {
  const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const bin =
    typeof atob !== "undefined" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// === 좌표 기반 보드 모델 (맞대결·자유배치·드래그) ===
// 모든 선수가 자유 좌표(x,y %)를 보유. 포메이션은 좌표 프리셋을 적용하는 액션일 뿐.

export interface Placed {
  uid: string; // 클라 전용 React key·드래그 식별 (인코딩 안 함)
  pid: string | null; // 실선수 id (pool 조회) / 커스텀이면 null
  name: string | null; // 커스텀 이름 / 실선수면 null (pool에서)
  pos: Pos; // 커스텀 선수의 포지션 (실선수는 렌더 시 pool.pos 우선)
  x: number; // 0~100 %
  y: number; // 0~100 %
  alt?: boolean; // 대체자원(뎁스 차트) — true 면 빨강 링, 있으면 선발은 파랑 링
}
export interface Side {
  club: string | null; // 가져온 클럽명 (라벨·맞대결 헤더용)
  formation: string | null; // 마지막 적용 포메이션 (UI 표시용, 자유면 null)
  players: Placed[];
}
export type DisplayMode = "photo" | "ovr" | "name"; // 선수 표시: 사진 / 능력치 / 이름만
export type Orientation = "portrait" | "landscape"; // 피치 방향: 세로 / 가로
export interface BoardState {
  mode: "single" | "versus";
  displayMode: DisplayMode;
  orientation: Orientation;
  title: string;
  subtitle: string;
  kit: string;
  grid?: boolean; // 존 그리드 오버레이 (세로 6등분 + 5레인) — 코칭 전술판 스타일
  home: Side;
  away?: Side;
  bench: BenchEntry[]; // 후보 명단 (더블 스쿼드) — 실선수 pid 또는 커스텀 이름
  strokes: Stroke[]; // 전술 그림 (URL 인코딩 제외, 화면 캡처로만 공유)
}

// 후보 명단 항목 — 좌표 없이 pid(실선수) 또는 name(커스텀)만.
export interface BenchEntry {
  pid: string | null;
  name: string | null;
}

const POS_CODES: Pos[] = ["GK", "DF", "MF", "FW"];
const posToCode = (p: Pos): number => Math.max(0, POS_CODES.indexOf(p));
const codeToPos = (c: number): Pos => POS_CODES[c] ?? "MF";

let uidSeq = 0;
export function newUid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `u${(uidSeq++).toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// 와이어(축약) 포맷 — URL 길이 절감. 선수 [pid,x,y] | 커스텀 [0,x,y,name,posCode]. 좌표는 정수.
type WirePlayer = [string, number, number] | [string, number, number, 1] | [0, number, number, string, number] | [0, number, number, string, number, 1];
interface WireSide {
  c?: string;
  pl: WirePlayer[];
}
interface WireBoard {
  v: 1;
  m: "s" | "v";
  dm?: "o" | "n"; // displayMode (생략=photo)
  o?: "l"; // orientation (생략=portrait)
  g?: 1; // 존 그리드 (생략=off)
  t: string;
  s: string;
  kit: string;
  h: WireSide;
  a?: WireSide;
  b?: (string | [0, string])[]; // 후보 명단 — pid 또는 [0, 커스텀이름]
}

function sideToWire(side: Side): WireSide {
  const pl: WirePlayer[] = side.players.map((p) => {
    if (p.pid) {
      return p.alt
        ? ([p.pid, Math.round(p.x), Math.round(p.y), 1] as WirePlayer)
        : ([p.pid, Math.round(p.x), Math.round(p.y)] as WirePlayer);
    }
    return p.alt
      ? ([0, Math.round(p.x), Math.round(p.y), p.name ?? "", posToCode(p.pos), 1] as WirePlayer)
      : ([0, Math.round(p.x), Math.round(p.y), p.name ?? "", posToCode(p.pos)] as WirePlayer);
  });
  const w: WireSide = { pl };
  if (side.club) w.c = side.club;
  return w;
}

// 실선수 pos는 렌더 시 pool에서 채우므로 여기선 placeholder(MF). 커스텀만 posCode 복원.
function wireToSide(w: WireSide): Side {
  const players: Placed[] = (w.pl ?? []).map((t) => {
    if (t[0] === 0) {
      const [, x, y, name, code, altFlag] = t as [0, number, number, string, number, 1?];
      return { uid: newUid(), pid: null, name: name || null, pos: codeToPos(code), x, y, alt: altFlag === 1 || undefined };
    }
    const [pid, x, y, altFlag] = t as [string, number, number, 1?];
    return { uid: newUid(), pid, name: null, pos: "MF" as Pos, x, y, alt: altFlag === 1 || undefined };
  });
  return { club: w.c ?? null, formation: null, players };
}

export function encodeBoard(b: BoardState): string {
  const w: WireBoard = {
    v: 1,
    m: b.mode === "versus" ? "v" : "s",
    t: b.title.slice(0, 30),
    s: b.subtitle.slice(0, 40),
    kit: b.kit,
    h: sideToWire(b.home),
  };
  if (b.displayMode === "ovr") w.dm = "o";
  else if (b.displayMode === "name") w.dm = "n";
  if (b.orientation === "landscape") w.o = "l";
  if (b.grid) w.g = 1;
  if (b.mode === "versus" && b.away) w.a = sideToWire(b.away);
  if ((b.bench ?? []).length) w.b = (b.bench ?? []).map((e) => (e.pid ? e.pid : ([0, e.name ?? ""] as [0, string])));
  return b64urlEncode(JSON.stringify(w));
}

// 신규 v1 보드 + 구 LineupState(단일) 하위호환. posOf 불필요(실선수 pos는 호출측이 pool로 렌더).
export function decodeBoard(code: string): BoardState | null {
  try {
    const obj = JSON.parse(b64urlDecode(code));
    if (obj?.v === 1) {
      return {
        mode: obj.m === "v" ? "versus" : "single",
        displayMode: obj.dm === "o" ? "ovr" : obj.dm === "n" ? "name" : "photo",
        orientation: obj.o === "l" ? "landscape" : "portrait",
        grid: obj.g === 1 || undefined,
        title: obj.t ?? "",
        subtitle: obj.s ?? "",
        kit: obj.kit ?? "grass",
        home: wireToSide(obj.h),
        away: obj.a ? wireToSide(obj.a) : undefined,
        bench: Array.isArray(obj.b)
          ? obj.b.map((e: string | [0, string]) =>
              typeof e === "string" ? { pid: e, name: null } : { pid: null, name: e[1] || null })
          : [],
        strokes: [],
      };
    }
    if (obj && typeof obj.f === "string" && Array.isArray(obj.p)) {
      return {
        mode: "single",
        displayMode: "photo",
        orientation: "portrait",
        title: obj.t ?? "",
        subtitle: obj.s ?? "",
        kit: obj.k ?? "grass",
        home: sideFromLegacy(obj as LineupState),
        bench: [],
        strokes: [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

// 구 단일 포맷(슬롯 순서 픽) → 좌표 보유 Side. 포메이션 좌표를 초기 위치로.
export function sideFromLegacy(state: LineupState): Side {
  const slots = FORMATIONS[state.f] ?? FORMATIONS["4-3-3"];
  const players: Placed[] = [];
  slots.forEach((slot, i) => {
    const pick = state.p[i];
    if (!pick) return;
    players.push({
      uid: newUid(),
      pid: typeof pick === "string" ? pick : null,
      name: typeof pick === "string" ? null : pick.n,
      pos: slot.pos,
      x: slot.x,
      y: slot.y,
    });
  });
  return { club: null, formation: state.f, players };
}

// 보드의 모든 실선수 pid (OG 카드가 pool 조회).
export function pidsFromBoard(b: BoardState): string[] {
  const ids: string[] = [];
  for (const side of [b.home, b.away]) {
    if (!side) continue;
    for (const p of side.players) if (p.pid) ids.push(p.pid);
  }
  for (const e of b.bench ?? []) if (e.pid) ids.push(e.pid);
  return ids;
}
