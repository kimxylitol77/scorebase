"use client";
// 라인업 전술판 빌더 — 포메이션/자유/맞대결 + 클럽 + 드래그 + 표시모드/방향 + 전술 그리기 + undo/redo + 캡처 공유.
// 피치·드래그=Pitch, 후보=CandidatePanel, 그리기=DrawLayer, 이력=useHistory.
import { useMemo, useCallback, useState, useRef, useEffect, type ComponentType } from "react";
import { Share2, Download, Link2, Check, Shirt, UserPlus, Undo2, Redo2, RotateCcw, MousePointer2, Pen, Minus, MoreHorizontal, MoveUpRight, Square, Circle, Volleyball, Eraser, PenLine } from "lucide-react";
import Pitch from "./Pitch";
import CandidatePanel from "./CandidatePanel";
import DrawLayer from "./DrawLayer";
import { useHistory } from "./useHistory";
import type { PoolPlayer, ClubMeta } from "./types";
import { FORMATIONS, FORMATION_OPTIONS, FREE_FORMATION, KITS, KIT_BY_KEY, type Pos } from "@/lib/lineup/formations";
import { encodeBoard, newUid, type BoardState, type Side, type Placed, type DisplayMode, type Orientation } from "@/lib/lineup/lineup-state";
import { STROKE_COLORS, STROKE_COLOR_KEYS, type Tool, type StrokeColor, type Stroke } from "@/lib/lineup/drawing";

interface Props {
  pool: PoolPlayer[];
  clubs: ClubMeta[];
  initial: BoardState | null;
}

const POS_LABEL: Record<Pos, string> = { GK: "골키퍼", DF: "수비수", MF: "미드필더", FW: "공격수" };
const LEAGUE_LABEL: Record<string, string> = {
  EPL: "프리미어리그", LALIGA: "라리가", BUNDESLIGA: "분데스리가", SERIE_A: "세리에 A", LIGUE_1: "리그 1",
  WORLD_CUP: "월드컵 대표팀", K_LEAGUE_1: "K리그1", K_LEAGUE_2: "K리그2", MLS: "MLS", SAUDI_PL: "사우디 프로리그",
  CHAMPIONSHIP: "챔피언십", EREDIVISIE: "에레디비시", PRIMEIRA_LIGA: "프리메이라리가", SUPER_LIG: "쉬페르리그",
  J1_LEAGUE: "J1리그", J2_LEAGUE: "J2리그", BRASILEIRAO: "브라질레이랑", LIGA_MX: "리가 MX", CSL: "중국 슈퍼리그", A_LEAGUE: "A리그",
};
const LEAGUE_ORDER = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "K_LEAGUE_1", "WORLD_CUP"];
const DISPLAY_MODES: [DisplayMode, string][] = [["photo", "사진"], ["name", "번호"]];
const ORIENTATIONS: [Orientation, string][] = [["portrait", "세로"], ["landscape", "가로"]];
const TOOLS: [Tool, ComponentType<{ className?: string }>, string][] = [
  ["select", MousePointer2, "선택"],
  ["pen", Pen, "펜"],
  ["line", Minus, "선"],
  ["dashed", MoreHorizontal, "점선"],
  ["arrow", MoveUpRight, "화살표"],
  ["rect", Square, "사각형"],
  ["ellipse", Circle, "원"],
  ["ball", Volleyball, "공"],
  ["eraser", Eraser, "지우개"],
];

function placeY(rawY: number, side: "home" | "away", versus: boolean): number {
  if (!versus) return rawY;
  return side === "away" ? Math.round(50 - rawY * 0.46) : Math.round(50 + rawY * 0.46);
}
function emptySlots(fname: string, side: "home" | "away", versus: boolean): Placed[] {
  const slots = FORMATIONS[fname] ?? FORMATIONS["4-3-3"];
  return slots.map((s) => ({ uid: newUid(), pid: null, name: null, pos: s.pos, x: s.x, y: placeY(s.y, side, versus) }));
}
// 포메이션 변경 시 기존 선수 보존 — 같은 포지션 슬롯에 우선 배치하고, 포지션이 남는 선수는 빈 슬롯에 채워 11명을 유지.
// 빈 보드(채워진 선수 0)면 빈 슬롯만 반환. 이게 없으면 포메이션을 바꿀 때마다 배치한 선수가 전부 사라진다.
function reflowSlots(prev: Placed[], fname: string, side: "home" | "away", versus: boolean): Placed[] {
  const slots = FORMATIONS[fname] ?? FORMATIONS["4-3-3"];
  const filled = prev.filter((p) => p.pid || p.name);
  if (filled.length === 0) return emptySlots(fname, side, versus);
  const byPos: Record<Pos, Placed[]> = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of filled) byPos[p.pos].push(p);
  const assigned: (Placed | null)[] = slots.map((s) => byPos[s.pos].shift() ?? null);
  const leftover = [...byPos.GK, ...byPos.DF, ...byPos.MF, ...byPos.FW];
  for (let i = 0; i < assigned.length && leftover.length; i++) if (!assigned[i]) assigned[i] = leftover.shift()!;
  return slots.map((s, i) => {
    const p = assigned[i];
    return { uid: newUid(), pid: p?.pid ?? null, name: p?.name ?? null, pos: p?.pos ?? s.pos, x: s.x, y: placeY(s.y, side, versus) };
  });
}
function compressY(players: Placed[], side: "home" | "away"): Placed[] {
  return players.map((p) => ({ ...p, y: Math.max(2, Math.min(96, side === "away" ? 50 - p.y * 0.46 : 50 + p.y * 0.46)) }));
}
function expandY(players: Placed[]): Placed[] {
  return players.map((p) => ({ ...p, y: Math.max(4, Math.min(96, (p.y - 50) / 0.46)) }));
}
function updateSideIn(b: BoardState, which: "home" | "away", fn: (s: Side) => Side): BoardState {
  if (which === "home") return { ...b, home: fn(b.home) };
  return b.away ? { ...b, away: fn(b.away) } : b;
}

// dataURL → Blob (fetch(data:)는 CSP connect-src에 막혀 직접 디코드).
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)?.[1] ?? "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function initBoard(initial: BoardState | null): BoardState {
  if (initial) return { ...initial, strokes: initial.strokes ?? [] };
  return { mode: "single", displayMode: "photo", orientation: "portrait", title: "나의 베스트 11", subtitle: "", kit: "grass", bench: [], strokes: [], home: { club: null, formation: "4-3-3", players: emptySlots("4-3-3", "home", false) } };
}

export default function LineupBuilder({ pool, clubs, initial }: Props) {
  const init0 = useMemo(() => initBoard(initial), [initial]);
  const { state: board, commit, setTransient, checkpoint, undo, redo, reset, canUndo, canRedo } = useHistory<BoardState>(init0);
  const [activeSide, setActiveSide] = useState<"home" | "away">("home");
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [benchPicking, setBenchPicking] = useState(false); // 후보 명단 추가 패널
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<StrokeColor>("white");
  const [copied, setCopied] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  // 새로고침(F5) 시 작업 보존 — board를 sessionStorage에 저장하고, 공유 URL(?d=) 없이 들어오면 마운트 때 복원.
  // 이게 없으면 새로고침마다 빈 세로 보드로 초기화돼 방향·배치가 사라진다.
  // 첫 실행(빈 init0)은 저장을 건너뛴다 — 안 그러면 복원 effect보다 먼저 빈 보드로 sessionStorage를 덮어쓴다.
  const savedOnce = useRef(false);
  useEffect(() => {
    if (!savedOnce.current) { savedOnce.current = true; return; }
    try { sessionStorage.setItem("lineup-board", JSON.stringify(board)); } catch { /* 무시 */ }
  }, [board]);
  useEffect(() => {
    if (!initial) {
      try {
        const saved = sessionStorage.getItem("lineup-board");
        if (saved) reset(JSON.parse(saved) as BoardState);
      } catch { /* 무시 */ }
    }
    setMounted(true); // 복원이 끝난 뒤에야 보드를 그린다 → F5 시 세로→가로 깜빡임 제거
    // 마운트 1회만 복원.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const poolById = useMemo(() => {
    const m: Record<string, PoolPlayer> = {};
    for (const p of pool) m[p.id] = p;
    return m;
  }, [pool]);

  const usedIds = useMemo(() => {
    const s = new Set<string>();
    for (const side of [board.home, board.away]) if (side) for (const p of side.players) if (p.pid) s.add(p.pid);
    for (const e of board.bench) if (e.pid) s.add(e.pid);
    return s;
  }, [board]);

  const clubsByLeague = useMemo(() => {
    const g: Record<string, ClubMeta[]> = {};
    for (const c of clubs) (g[c.league] ||= []).push(c);
    return g;
  }, [clubs]);

  const curSide: Side | undefined = activeSide === "away" ? board.away : board.home;
  const activeNode = curSide?.players.find((p) => p.uid === activeUid) ?? null;
  // 활성 진영의 대표 클럽 — 그 팀 선수를 후보 상단에 올리기 위함(배치된 선수들의 clubKey 최빈값).
  const activeClubKey = useMemo(() => {
    if (!curSide) return null;
    const counts: Record<string, number> = {};
    for (const pl of curSide.players) {
      const ck = pl.pid ? poolById[pl.pid]?.clubKey : undefined;
      if (ck) counts[ck] = (counts[ck] || 0) + 1;
    }
    let best: string | null = null, max = 0;
    for (const k in counts) if (counts[k] > max) { max = counts[k]; best = k; }
    return best;
  }, [curSide, poolById]);
  const activePos: Pos = activeNode ? (activeNode.pid ? poolById[activeNode.pid]?.pos ?? activeNode.pos : activeNode.pos) : "MF";
  const activeLabel = activeNode ? (activeNode.pid ? poolById[activeNode.pid]?.name ?? "선수" : activeNode.name ?? `${POS_LABEL[activeNode.pos]} 자리`) : "";

  const homeFilled = board.home.players.filter((p) => p.pid || p.name).length;
  const awayFilled = board.away?.players.filter((p) => p.pid || p.name).length ?? 0;

  const updateSide = useCallback((which: "home" | "away", fn: (s: Side) => Side) => commit((b) => updateSideIn(b, which, fn)), [commit]);
  const updatePlayers = useCallback((which: "home" | "away", fn: (ps: Placed[]) => Placed[]) => updateSide(which, (s) => ({ ...s, players: fn(s.players) })), [updateSide]);

  function applyFormation(fname: string, side: "home" | "away" = activeSide) {
    commit((b) => {
      const versus = b.mode === "versus";
      if (fname === FREE_FORMATION) return updateSideIn(b, side, (s) => ({ ...s, formation: null, players: s.players.filter((p) => p.pid || p.name) }));
      return updateSideIn(b, side, (s) => ({ ...s, formation: fname, players: reflowSlots(s.players, fname, side, versus) }));
    });
    setActiveUid(null);
  }

  // 포메이션 셀렉터 — 맞대결에선 우리팀/상대팀 각각(클럽 픽커와 동일하게 side 별).
  const formationSelect = (side: "home" | "away") => {
    const f = (side === "away" ? board.away?.formation : board.home.formation) ?? FREE_FORMATION;
    return (
      <select value={f} onChange={(e) => applyFormation(e.target.value, side)} className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-500">
        {FORMATION_OPTIONS.map((ff) => (<option key={ff}>{ff}</option>))}
      </select>
    );
  };

  function loadClub(clubKey: string, side: "home" | "away" = activeSide) {
    if (!clubKey) return;
    const club = clubs.find((c) => c.key === clubKey);
    const byPos: Record<Pos, PoolPlayer[]> = { GK: [], DF: [], MF: [], FW: [] };
    for (const p of pool) if (p.clubKey === clubKey) byPos[p.pos].push(p);
    (Object.keys(byPos) as Pos[]).forEach((k) => byPos[k].sort((a, b) => b.ovr - a.ovr));
    commit((b) => {
      const versus = b.mode === "versus";
      if (clubKey.startsWith("wc-")) {
        // 월드컵 국가 = 예상 XI 11명을 포지션 줄(GK·DF·MF·FW)로 자동 배치 — formation 프리셋 없이(WC formation 10종 대응).
        const ROWS: Record<Pos, number> = { GK: 92, DF: 70, MF: 46, FW: 18 };
        const players: Placed[] = [];
        (["FW", "MF", "DF", "GK"] as Pos[]).forEach((g) => {
          const arr = byPos[g];
          arr.forEach((p, i) => {
            const x = arr.length === 1 ? 50 : Math.round(12 + (76 * i) / (arr.length - 1));
            players.push({ uid: newUid(), pid: p.id, name: null, pos: g, x, y: placeY(ROWS[g], side, versus) });
          });
        });
        return updateSideIn(b, side, (s) => ({ ...s, club: club?.label ?? null, formation: FREE_FORMATION, players }));
      }
      // 감독 선호 포메이션이 프리셋에 있으면 그것으로 자동 배치 (감독 전술 추천)
      const coachF = club?.coachFormation && FORMATIONS[club.coachFormation] ? club.coachFormation : null;
      const cur = side === "away" ? b.away : b.home;
      const fname = coachF ?? (cur?.formation && cur.formation !== FREE_FORMATION && FORMATIONS[cur.formation] ? cur.formation : "4-3-3");
      const cursor: Record<Pos, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
      const players: Placed[] = FORMATIONS[fname].map((slot) => {
        const cand = byPos[slot.pos][cursor[slot.pos]++];
        return { uid: newUid(), pid: cand ? cand.id : null, name: null, pos: slot.pos, x: slot.x, y: placeY(slot.y, side, versus) };
      });
      const next = updateSideIn(b, side, (s) => ({ ...s, club: club?.label ?? null, formation: fname, players }));
      // 부제가 비어 있으면 감독명 자동 병기 — 보드·OG 카드에 감독 노출
      if (!next.subtitle && club?.coachName) return { ...next, subtitle: `감독 ${club.coachName} · ${fname}` };
      return next;
    });
    setActiveSide(side);
    setActiveUid(null);
  }

  // 클럽 드롭다운 — side 를 명시해 맞대결에서 우리팀/상대팀을 각각 불러온다(단일은 home 고정).
  // 리그 순서 — 우선순위 리그 먼저, 나머지 커버 리그는 뒤에 알파벳순
  const leagueOrder = useMemo(() => {
    const rest = Object.keys(clubsByLeague).filter((lg) => !LEAGUE_ORDER.includes(lg)).sort();
    return [...LEAGUE_ORDER, ...rest];
  }, [clubsByLeague]);

  const clubPicker = (side: "home" | "away", label: string) => (
    <select value="" onChange={(e) => loadClub(e.target.value, side)} className="max-w-[200px] rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-500">
      <option value="">{label}</option>
      {leagueOrder.filter((lg) => clubsByLeague[lg]?.length).map((lg) => (
        <optgroup key={lg} label={LEAGUE_LABEL[lg] ?? lg}>
          {clubsByLeague[lg].map((c) => (<option key={c.key} value={c.key}>{c.label}{c.canBest11 ? "" : " (일부)"}</option>))}
        </optgroup>
      ))}
    </select>
  );

  // 불러온 클럽의 감독 메타 — Side.club 은 라벨 문자열이라 라벨로 역조회
  const coachOf = (side: "home" | "away") => {
    const clubLabel = side === "away" ? board.away?.club : board.home.club;
    if (!clubLabel) return null;
    const c = clubs.find((x) => x.label === clubLabel);
    return c?.coachName ? c : null;
  };

  const coachChip = (side: "home" | "away") => {
    const c = coachOf(side);
    if (!c) return null;
    const cur = side === "away" ? board.away?.formation : board.home.formation;
    const applicable = c.coachFormation && FORMATIONS[c.coachFormation] && cur !== c.coachFormation;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-300">
        감독 <span className="font-semibold text-neutral-900 dark:text-white">{c.coachName}</span>
        {c.coachFormation && <span className="text-neutral-400">· 선호 {c.coachFormation}</span>}
        {applicable && (
          <button
            type="button"
            onClick={() => applyFormation(c.coachFormation!, side)}
            className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-rose-500"
          >
            전술 적용
          </button>
        )}
      </span>
    );
  };

  function addPlayer() {
    const uid = newUid();
    const versus = board.mode === "versus";
    const y = versus ? (activeSide === "away" ? 28 : 72) : 50;
    updatePlayers(activeSide, (ps) => [...ps, { uid, pid: null, name: null, pos: "MF", x: 50, y }]);
    setActiveUid(uid);
  }

  const nodeClick = useCallback((side: "home" | "away", uid: string) => { setActiveSide(side); setActiveUid(uid); }, []);
  const nodeMove = useCallback(
    (side: "home" | "away", uid: string, x: number, y: number) => setTransient((b) => updateSideIn(b, side, (s) => ({ ...s, players: s.players.map((p) => (p.uid === uid ? { ...p, x, y } : p)) }))),
    [setTransient],
  );

  function pickPlayer(p: PoolPlayer) {
    if (!activeUid) return;
    updatePlayers(activeSide, (ps) => ps.map((n) => (n.uid === activeUid ? { ...n, pid: p.id, name: null, pos: p.pos } : n)));
    setActiveUid(null);
  }
  function pickCustom(name: string) {
    if (!activeUid) return;
    updatePlayers(activeSide, (ps) => ps.map((n) => (n.uid === activeUid ? { ...n, pid: null, name } : n)));
    setActiveUid(null);
  }
  const BENCH_MAX = 12;
  function benchAdd(pp: PoolPlayer) {
    commit((b) => (b.bench.length >= BENCH_MAX ? b : { ...b, bench: [...b.bench, { pid: pp.id, name: null }] }));
  }
  function benchAddCustom(name: string) {
    commit((b) => (b.bench.length >= BENCH_MAX ? b : { ...b, bench: [...b.bench, { pid: null, name }] }));
  }
  function benchRemove(i: number) {
    commit((b) => ({ ...b, bench: b.bench.filter((_, idx) => idx !== i) }));
  }

  function deleteNode() {
    if (!activeUid) return;
    updatePlayers(activeSide, (ps) => ps.filter((n) => n.uid !== activeUid));
    setActiveUid(null);
  }

  function changeMode(mode: "single" | "versus") {
    setActiveUid(null);
    commit((b) => {
      if (b.mode === mode) return b;
      if (mode === "versus") return { ...b, mode, home: { ...b.home, players: compressY(b.home.players, "home") }, away: b.away ?? { club: null, formation: "4-3-3", players: emptySlots("4-3-3", "away", true) } };
      return { ...b, mode, home: { ...b.home, players: expandY(b.home.players) } };
    });
    if (mode === "single") setActiveSide("home");
  }

  // 그리기: 새 stroke 추가/삭제 = 각 1 이력(undo로 stroke 제거).
  const commitStroke = useCallback((s: Stroke) => commit((b) => ({ ...b, strokes: [...b.strokes, s] })), [commit]);
  const eraseStroke = useCallback((id: string) => commit((b) => ({ ...b, strokes: b.strokes.filter((x) => x.id !== id) })), [commit]);

  function resetAll() {
    // 내용만 초기화 — 보기 설정(방향·표시모드·키트)은 유지해서 가로로 보던 사람이 세로로 튕기지 않게.
    reset({ ...initBoard(null), orientation: board.orientation, displayMode: board.displayMode, kit: board.kit });
    setActiveUid(null);
    setActiveSide("home");
    setTool("select");
  }

  // --- 공유 ---
  const code = useMemo(() => encodeBoard(board), [board]);
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/lineup?d=${code}` : `/lineup?d=${code}`;

  async function onCapture() {
    const node = captureRef.current;
    if (!node || capturing) return;
    setCapturing(true);
    try {
      const { toPng } = await import("html-to-image");
      // skipFonts: cross-origin 폰트 CSS 에러 회피. cacheBust는 thesports URL에 query를 붙여 이미지 로드를 깨뜨려 미사용.
      const dataUrl = await toPng(node, { pixelRatio: 2, skipFonts: true });
      const fname = `${(board.title || "lineup").replace(/\s+/g, "-")}.png`;
      if (typeof navigator !== "undefined" && navigator.canShare) {
        try {
          const file = new File([dataUrlToBlob(dataUrl)], fname, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: board.title || "라인업" });
            return;
          }
        } catch {
          /* share 실패 → 다운로드 폴백 */
        }
      }
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = fname;
      a.click();
    } catch (e) {
      console.error("[lineup] capture failed", e);
    } finally {
      setCapturing(false);
    }
  }
  async function onShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: board.title || "라인업", url: shareUrl }); return; } catch { /* 폴백 */ }
    }
    onCopy();
  }
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* 무시 */
    }
  }

  const kitObj = KIT_BY_KEY[board.kit] ?? KITS[0];
  const segActive = "rounded-full bg-white px-3.5 py-1 text-sm font-medium text-neutral-900 shadow-sm dark:bg-white/15 dark:text-white";
  const segIdle = "rounded-full px-3.5 py-1 text-sm font-medium text-neutral-500 dark:text-neutral-400";
  const segSmActive = "rounded-md bg-white px-2.5 py-1 text-xs font-medium text-neutral-900 shadow-sm dark:bg-white/15 dark:text-white";
  const segSmIdle = "rounded-md px-2.5 py-1 text-xs font-medium text-neutral-500 dark:text-neutral-400";
  const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:border-rose-300 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 dark:border-neutral-700 dark:text-neutral-300";

  // 복원 전(F5 직후)엔 스켈레톤만 — 기본 세로 보드를 그렸다가 저장된 가로로 바뀌는 깜빡임 방지.
  // ?d= 공유 링크는 서버에서 이미 올바른 보드라 즉시 렌더(initial).
  const showBoard = !!initial || mounted;
  if (!showBoard) {
    return <div className="mt-6 h-[640px] animate-pulse rounded-2xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-white/[0.03]" />;
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="inline-flex rounded-full bg-neutral-100 p-0.5 dark:bg-white/[0.06]">
          <button type="button" onClick={() => changeMode("single")} className={board.mode === "single" ? segActive : segIdle}>단일 라인업</button>
          <button type="button" onClick={() => changeMode("versus")} className={board.mode === "versus" ? segActive : segIdle}>맞대결</button>
        </div>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{board.mode === "versus" ? `${homeFilled} vs ${awayFilled}` : `${homeFilled}/11명`}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">제목</label>
          <input value={board.title} onChange={(e) => setTransient((b) => ({ ...b, title: e.target.value }))} maxLength={30} className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-base font-medium text-neutral-900 outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white" />
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">부제 (선택)</label>
          <input value={board.subtitle} onChange={(e) => setTransient((b) => ({ ...b, subtitle: e.target.value }))} maxLength={40} placeholder="예) 2026 드림 스쿼드" className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white" />
        </div>
      </div>

      {board.mode === "versus" && (
        <div className="mt-3 inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-700">
          <button type="button" onClick={() => { setActiveSide("home"); setActiveUid(null); }} className={activeSide === "home" ? "rounded-md bg-rose-500/10 px-3 py-1 text-sm font-medium text-rose-600 dark:text-rose-300" : "px-3 py-1 text-sm text-neutral-500 dark:text-neutral-400"}>우리팀 (아래)</button>
          <button type="button" onClick={() => { setActiveSide("away"); setActiveUid(null); }} className={activeSide === "away" ? "rounded-md bg-blue-500/10 px-3 py-1 text-sm font-medium text-blue-600 dark:text-blue-300" : "px-3 py-1 text-sm text-neutral-500 dark:text-neutral-400"}>상대팀 (위)</button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {board.mode === "versus" ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-rose-600 dark:text-rose-300">우리팀 포메이션</span>
              {formationSelect("home")}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-blue-600 dark:text-blue-300">상대팀 포메이션</span>
              {formationSelect("away")}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">포메이션</span>
            {formationSelect("home")}
          </div>
        )}
        {board.mode === "versus" ? (
          <>
            {clubPicker("home", "우리팀 클럽 불러오기…")}
            {clubPicker("away", "상대팀 클럽 불러오기…")}
          </>
        ) : clubPicker("home", "클럽에서 가져오기…")}
        {coachChip("home")}
        {board.mode === "versus" && coachChip("away")}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400"><Shirt className="h-3.5 w-3.5" /> 키트</span>
          <div className="flex gap-1.5">
            {KITS.map((k) => (
              <button key={k.key} type="button" onClick={() => commit((b) => ({ ...b, kit: k.key }))} title={k.label} aria-label={k.label} className={`h-6 w-6 rounded-full ring-2 transition-transform ${board.kit === k.key ? "scale-110 ring-rose-500" : "ring-transparent hover:scale-105"}`} style={{ background: `linear-gradient(135deg, ${k.from}, ${k.to})` }} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="inline-flex rounded-lg bg-neutral-100 p-0.5 dark:bg-white/[0.06]">
          {DISPLAY_MODES.map(([dm, label]) => (<button key={dm} type="button" onClick={() => commit((b) => ({ ...b, displayMode: dm }))} className={board.displayMode === dm ? segSmActive : segSmIdle}>{label}</button>))}
        </div>
        <div className="inline-flex rounded-lg bg-neutral-100 p-0.5 dark:bg-white/[0.06]">
          {ORIENTATIONS.map(([o, label]) => (<button key={o} type="button" onClick={() => commit((b) => ({ ...b, orientation: o }))} className={board.orientation === o ? segSmActive : segSmIdle}>{label}</button>))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={undo} disabled={!canUndo} className={iconBtn} title="되돌리기" aria-label="되돌리기"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={redo} disabled={!canRedo} className={iconBtn} title="다시" aria-label="다시"><Redo2 className="h-4 w-4" /></button>
          <button type="button" onClick={resetAll} className={iconBtn} title="전체 초기화" aria-label="전체 초기화"><RotateCcw className="h-4 w-4" /></button>
        </div>
      </div>

      {/* 전술 그리기 툴바 */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-700">
          {TOOLS.map(([t, Icon, label]) => (
            <button key={t} type="button" onClick={() => setTool(t)} title={label} aria-label={label} className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${tool === t ? "bg-rose-500/15 text-rose-600 dark:text-rose-300" : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white"}`}>
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {STROKE_COLOR_KEYS.map((ck) => (
            <button key={ck} type="button" onClick={() => setColor(ck)} aria-label={ck} className={`h-5 w-5 rounded-full ring-2 transition-transform ${color === ck ? "scale-110 ring-neutral-400 dark:ring-white/60" : "ring-transparent hover:scale-105"}`} style={{ background: STROKE_COLORS[ck], boxShadow: ck === "white" ? "inset 0 0 0 1px rgba(0,0,0,0.15)" : undefined }} />
          ))}
        </div>
        {tool !== "select" && <span className="text-xs text-neutral-400 dark:text-neutral-500">그리기 모드 — 선수 이동은 ‘선택’</span>}
      </div>

      <div className="mt-4">
        <div className={board.orientation === "landscape" ? "w-full" : "max-w-2xl"}>
          <div ref={captureRef} className="relative">
            <Pitch home={board.home} away={board.away} mode={board.mode} displayMode={board.displayMode} orientation={board.orientation} poolById={poolById} kitFrom={kitObj.from} kitTo={kitObj.to} activeUid={activeUid} onNodeClick={nodeClick} onNodeMove={nodeMove} onDragStart={checkpoint} />
            <DrawLayer strokes={board.strokes} tool={tool} color={color} onCommitStroke={commitStroke} onErase={eraseStroke} />
            <div className="pointer-events-none absolute bottom-1.5 right-2.5 text-[11px] font-semibold text-white/70" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.85)" }}>scorebase.kr</div>
            {board.bench.length > 0 && (
              <div className="mt-1.5 rounded-xl px-3 py-2.5" style={{ background: `linear-gradient(135deg, ${kitObj.from}, ${kitObj.to})` }}>
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white/75">후보</span>
                  {board.bench.map((e, i) => {
                    const pp = e.pid ? poolById[e.pid] : null;
                    return (
                      <span key={i} className="inline-flex items-center gap-1.5 text-xs font-semibold text-white" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.7)" }}>
                        {pp?.photo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={pp.photo} alt="" className="h-5 w-5 rounded-full bg-white/80 object-cover ring-1 ring-white/40" />
                        )}
                        {pp?.name ?? e.name}
                        {pp?.number != null && <span className="font-normal text-white/60">{pp.number}</span>}
                        {!capturing && (
                          <button type="button" onClick={() => benchRemove(i)} aria-label="후보에서 빼기" className="text-white/50 hover:text-white">×</button>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">선수를 눌러 채우거나 끌어서 이동, 도구로 전술을 그릴 수 있어요.</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onCapture} disabled={capturing} className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-50"><Download className="h-4 w-4" /> {capturing ? "저장 중…" : "이미지로 저장"}</button>
            <button type="button" onClick={onShare} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200"><Share2 className="h-4 w-4" /> 공유</button>
            <button type="button" onClick={onCopy} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200">{copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Link2 className="h-4 w-4" />}{copied ? "복사됨" : "링크 복사"}</button>
            <a href={`/community/new?lineup=${encodeURIComponent(code)}`} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200"><PenLine className="h-4 w-4" /> 게시판에 올리기</a>
            <button type="button" onClick={() => { setActiveUid(null); setBenchPicking(true); }} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200"><UserPlus className="h-4 w-4" /> 후보 추가{board.bench.length > 0 ? ` (${board.bench.length})` : ""}</button>
          </div>
        </div>

        <div className="mt-4 max-w-2xl">
          {benchPicking ? (
            <CandidatePanel pool={pool} pos="MF" clubKey={activeClubKey} label={`후보 명단에 추가 · ${board.bench.length}/12`} filled={false} usedIds={usedIds} onPick={benchAdd} onCustom={benchAddCustom} onDelete={() => {}} onClose={() => setBenchPicking(false)} benchMode />
          ) : activeNode ? (
            <CandidatePanel pool={pool} pos={activePos} clubKey={activeClubKey} label={activeLabel} filled={!!(activeNode.pid || activeNode.name)} usedIds={usedIds} onPick={pickPlayer} onCustom={pickCustom} onDelete={deleteNode} onClose={() => setActiveUid(null)} />
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 dark:border-neutral-700 dark:bg-white/[0.02]">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">피치의 자리를 눌러 선수를 채우거나, 아래에서 클럽(팀)을 고르면 포메이션에 11명이 한 번에 채워집니다. 도구로 전술 화살표·선도 그릴 수 있어요.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {board.mode === "versus" ? (
                  <>
                    {clubPicker("home", "우리팀 클럽…")}
                    {clubPicker("away", "상대팀 클럽…")}
                  </>
                ) : clubPicker("home", "클럽(팀)에서 가져오기…")}
                <button type="button" onClick={addPlayer} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200"><UserPlus className="h-4 w-4" /> 선수 직접 추가</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
