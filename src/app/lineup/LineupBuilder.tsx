"use client";
// 라인업 전술판 빌더 — 포메이션/자유/맞대결 + 클럽 + 드래그 + 표시모드/방향 + 전술 그리기 + undo/redo + 캡처 공유.
// 피치·드래그=Pitch, 후보=CandidatePanel, 그리기=DrawLayer, 이력=useHistory.
import { useMemo, useCallback, useState, useRef, type ComponentType } from "react";
import { Share2, Download, Link2, Check, Shirt, UserPlus, Undo2, Redo2, RotateCcw, MousePointer2, Pen, Minus, MoreHorizontal, MoveUpRight, Square, Circle, Volleyball, Eraser } from "lucide-react";
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
const LEAGUE_LABEL: Record<string, string> = { EPL: "프리미어리그", LALIGA: "라리가", BUNDESLIGA: "분데스리가", SERIE_A: "세리에 A", LIGUE_1: "리그 1" };
const LEAGUE_ORDER = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
const DISPLAY_MODES: [DisplayMode, string][] = [["photo", "사진"], ["ovr", "능력치"], ["name", "이름"]];
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
  return { mode: "single", displayMode: "photo", orientation: "portrait", title: "나의 베스트 11", subtitle: "", kit: "grass", strokes: [], home: { club: null, formation: "4-3-3", players: emptySlots("4-3-3", "home", false) } };
}

export default function LineupBuilder({ pool, clubs, initial }: Props) {
  const init0 = useMemo(() => initBoard(initial), [initial]);
  const { state: board, commit, setTransient, checkpoint, undo, redo, reset, canUndo, canRedo } = useHistory<BoardState>(init0);
  const [activeSide, setActiveSide] = useState<"home" | "away">("home");
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<StrokeColor>("white");
  const [copied, setCopied] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  const poolById = useMemo(() => {
    const m: Record<string, PoolPlayer> = {};
    for (const p of pool) m[p.id] = p;
    return m;
  }, [pool]);

  const usedIds = useMemo(() => {
    const s = new Set<string>();
    for (const side of [board.home, board.away]) if (side) for (const p of side.players) if (p.pid) s.add(p.pid);
    return s;
  }, [board]);

  const clubsByLeague = useMemo(() => {
    const g: Record<string, ClubMeta[]> = {};
    for (const c of clubs) (g[c.league] ||= []).push(c);
    return g;
  }, [clubs]);

  const curSide: Side | undefined = activeSide === "away" ? board.away : board.home;
  const curFormation = curSide?.formation ?? FREE_FORMATION;
  const activeNode = curSide?.players.find((p) => p.uid === activeUid) ?? null;
  const activePos: Pos = activeNode ? (activeNode.pid ? poolById[activeNode.pid]?.pos ?? activeNode.pos : activeNode.pos) : "MF";
  const activeLabel = activeNode ? (activeNode.pid ? poolById[activeNode.pid]?.name ?? "선수" : activeNode.name ?? `${POS_LABEL[activeNode.pos]} 자리`) : "";

  const homeFilled = board.home.players.filter((p) => p.pid || p.name).length;
  const awayFilled = board.away?.players.filter((p) => p.pid || p.name).length ?? 0;

  const updateSide = useCallback((which: "home" | "away", fn: (s: Side) => Side) => commit((b) => updateSideIn(b, which, fn)), [commit]);
  const updatePlayers = useCallback((which: "home" | "away", fn: (ps: Placed[]) => Placed[]) => updateSide(which, (s) => ({ ...s, players: fn(s.players) })), [updateSide]);

  function applyFormation(fname: string) {
    commit((b) => {
      const versus = b.mode === "versus";
      if (fname === FREE_FORMATION) return updateSideIn(b, activeSide, (s) => ({ ...s, formation: null, players: s.players.filter((p) => p.pid || p.name) }));
      return updateSideIn(b, activeSide, (s) => ({ ...s, formation: fname, players: emptySlots(fname, activeSide, versus) }));
    });
    setActiveUid(null);
  }

  function loadClub(clubKey: string) {
    if (!clubKey) return;
    const club = clubs.find((c) => c.key === clubKey);
    const byPos: Record<Pos, PoolPlayer[]> = { GK: [], DF: [], MF: [], FW: [] };
    for (const p of pool) if (p.clubKey === clubKey) byPos[p.pos].push(p);
    (Object.keys(byPos) as Pos[]).forEach((k) => byPos[k].sort((a, b) => b.ovr - a.ovr));
    commit((b) => {
      const versus = b.mode === "versus";
      const cur = activeSide === "away" ? b.away : b.home;
      const fname = cur?.formation && cur.formation !== FREE_FORMATION && FORMATIONS[cur.formation] ? cur.formation : "4-3-3";
      const cursor: Record<Pos, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
      const players: Placed[] = FORMATIONS[fname].map((slot) => {
        const cand = byPos[slot.pos][cursor[slot.pos]++];
        return { uid: newUid(), pid: cand ? cand.id : null, name: null, pos: slot.pos, x: slot.x, y: placeY(slot.y, activeSide, versus) };
      });
      return updateSideIn(b, activeSide, (s) => ({ ...s, club: club?.label ?? null, formation: fname, players }));
    });
    setActiveUid(null);
  }

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
    reset(initBoard(null));
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
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">포메이션</span>
          <select value={curFormation} onChange={(e) => applyFormation(e.target.value)} className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white">
            {FORMATION_OPTIONS.map((f) => (<option key={f}>{f}</option>))}
          </select>
        </div>
        <select value="" onChange={(e) => loadClub(e.target.value)} className="max-w-[200px] rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white">
          <option value="">클럽에서 가져오기…</option>
          {LEAGUE_ORDER.filter((lg) => clubsByLeague[lg]?.length).map((lg) => (
            <optgroup key={lg} label={LEAGUE_LABEL[lg] ?? lg}>
              {clubsByLeague[lg].map((c) => (<option key={c.key} value={c.key}>{c.label}{c.canBest11 ? "" : " (일부)"}</option>))}
            </optgroup>
          ))}
        </select>
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
          </div>
          <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">선수를 눌러 채우거나 끌어서 이동, 도구로 전술을 그릴 수 있어요.</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onCapture} disabled={capturing} className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-50"><Download className="h-4 w-4" /> {capturing ? "저장 중…" : "이미지로 저장"}</button>
            <button type="button" onClick={onShare} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200"><Share2 className="h-4 w-4" /> 공유</button>
            <button type="button" onClick={onCopy} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200">{copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Link2 className="h-4 w-4" />}{copied ? "복사됨" : "링크 복사"}</button>
          </div>
        </div>

        <div className="mt-4 max-w-2xl">
          {activeNode ? (
            <CandidatePanel pool={pool} pos={activePos} label={activeLabel} filled={!!(activeNode.pid || activeNode.name)} usedIds={usedIds} onPick={pickPlayer} onCustom={pickCustom} onDelete={deleteNode} onClose={() => setActiveUid(null)} />
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 dark:border-neutral-700 dark:bg-white/[0.02]">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">피치의 자리를 눌러 선수를 채우고, 끌어서 위치를 옮기세요. 위 도구로 전술 화살표·선을 그릴 수도 있어요.</p>
              <button type="button" onClick={addPlayer} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200"><UserPlus className="h-4 w-4" /> 선수 추가</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
