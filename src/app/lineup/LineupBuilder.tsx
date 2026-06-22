"use client";
// 라인업 전술판 빌더 — 포메이션/자유/맞대결 + 클럽 가져오기 + 드래그 이동 + 이미지 카드 공유.
// 모든 선수가 자유 좌표(Placed)를 보유. 피치 렌더·드래그는 Pitch, 후보 선택은 CandidatePanel에 위임.
import { useState, useMemo, useCallback } from "react";
import { Share2, Download, Link2, Check, Shirt, UserPlus } from "lucide-react";
import Pitch from "./Pitch";
import CandidatePanel from "./CandidatePanel";
import type { PoolPlayer, ClubMeta } from "./types";
import { FORMATIONS, FORMATION_OPTIONS, FREE_FORMATION, KITS, KIT_BY_KEY, type Pos } from "@/lib/lineup/formations";
import { encodeBoard, newUid, type BoardState, type Side, type Placed } from "@/lib/lineup/lineup-state";

interface Props {
  pool: PoolPlayer[];
  clubs: ClubMeta[];
  initial: BoardState | null;
}

const POS_LABEL: Record<Pos, string> = { GK: "골키퍼", DF: "수비수", MF: "미드필더", FW: "공격수" };
const LEAGUE_LABEL: Record<string, string> = { EPL: "프리미어리그", LALIGA: "라리가", BUNDESLIGA: "분데스리가", SERIE_A: "세리에 A", LIGUE_1: "리그 1" };
const LEAGUE_ORDER = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];

// 맞대결 시 y를 절반 영역으로 압축 — home은 하단(중앙선~바닥), away는 상단(미러).
function placeY(rawY: number, side: "home" | "away", versus: boolean): number {
  if (!versus) return rawY;
  return side === "away" ? Math.round(50 - rawY * 0.46) : Math.round(50 + rawY * 0.46);
}
function emptySlots(fname: string, side: "home" | "away", versus: boolean): Placed[] {
  const slots = FORMATIONS[fname] ?? FORMATIONS["4-3-3"];
  return slots.map((s) => ({ uid: newUid(), pid: null, name: null, pos: s.pos, x: s.x, y: placeY(s.y, side, versus) }));
}
// 모드 전환 시 기존 선수 y 변환(단일↔맞대결).
function compressY(players: Placed[], side: "home" | "away"): Placed[] {
  return players.map((p) => ({ ...p, y: Math.max(2, Math.min(96, side === "away" ? 50 - p.y * 0.46 : 50 + p.y * 0.46)) }));
}
function expandY(players: Placed[]): Placed[] {
  return players.map((p) => ({ ...p, y: Math.max(4, Math.min(96, (p.y - 50) / 0.46)) }));
}
// 순수 side 업데이트 — setBoard 함수형 안에서 최신 board로 판정(stale mode 회피).
function updateSideIn(b: BoardState, which: "home" | "away", fn: (s: Side) => Side): BoardState {
  if (which === "home") return { ...b, home: fn(b.home) };
  return b.away ? { ...b, away: fn(b.away) } : b;
}

function initBoard(initial: BoardState | null): BoardState {
  if (initial) return initial;
  return { mode: "single", title: "나의 베스트 11", subtitle: "", kit: "grass", home: { club: null, formation: "4-3-3", players: emptySlots("4-3-3", "home", false) } };
}

export default function LineupBuilder({ pool, clubs, initial }: Props) {
  const [board, setBoard] = useState<BoardState>(() => initBoard(initial));
  const [activeSide, setActiveSide] = useState<"home" | "away">("home");
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
  const curFormation = (curSide?.formation) ?? FREE_FORMATION;
  const activeNode = curSide?.players.find((p) => p.uid === activeUid) ?? null;
  const activePos: Pos = activeNode ? (activeNode.pid ? poolById[activeNode.pid]?.pos ?? activeNode.pos : activeNode.pos) : "MF";
  const activeLabel = activeNode
    ? activeNode.pid
      ? poolById[activeNode.pid]?.name ?? "선수"
      : activeNode.name ?? `${POS_LABEL[activeNode.pos]} 자리`
    : "";

  const homeFilled = board.home.players.filter((p) => p.pid || p.name).length;
  const awayFilled = board.away?.players.filter((p) => p.pid || p.name).length ?? 0;

  // --- 상태 업데이트 헬퍼 ---
  const updateSide = useCallback((which: "home" | "away", fn: (s: Side) => Side) => {
    setBoard((b) => {
      if (which === "home") return { ...b, home: fn(b.home) };
      return b.away ? { ...b, away: fn(b.away) } : b;
    });
  }, []);
  const updatePlayers = useCallback(
    (which: "home" | "away", fn: (ps: Placed[]) => Placed[]) => updateSide(which, (s) => ({ ...s, players: fn(s.players) })),
    [updateSide],
  );

  // --- 액션 ---
  function applyFormation(fname: string) {
    setBoard((b) => {
      const versus = b.mode === "versus";
      if (fname === FREE_FORMATION) {
        return updateSideIn(b, activeSide, (s) => ({ ...s, formation: null, players: s.players.filter((p) => p.pid || p.name) }));
      }
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
    setBoard((b) => {
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

  const nodeClick = useCallback((side: "home" | "away", uid: string) => {
    setActiveSide(side);
    setActiveUid(uid);
  }, []);
  const nodeMove = useCallback(
    (side: "home" | "away", uid: string, x: number, y: number) => updatePlayers(side, (ps) => ps.map((p) => (p.uid === uid ? { ...p, x, y } : p))),
    [updatePlayers],
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
    setBoard((b) => {
      if (b.mode === mode) return b;
      if (mode === "versus") {
        return {
          ...b,
          mode,
          home: { ...b.home, players: compressY(b.home.players, "home") },
          away: b.away ?? { club: null, formation: "4-3-3", players: emptySlots("4-3-3", "away", true) },
        };
      }
      return { ...b, mode, home: { ...b.home, players: expandY(b.home.players) } };
    });
    if (mode === "single") setActiveSide("home");
  }

  // --- 공유 ---
  const code = useMemo(() => encodeBoard(board), [board]);
  const ogUrl = `/api/og/lineup?d=${code}`;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/lineup?d=${code}` : `/lineup?d=${code}`;

  async function onShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: board.title || "라인업", url: shareUrl });
        return;
      } catch {
        /* 취소·미지원 → 복사 폴백 */
      }
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

  return (
    <div className="mt-6">
      {/* 모드 + 팀명 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="inline-flex rounded-full bg-neutral-100 p-0.5 dark:bg-white/[0.06]">
          <button type="button" onClick={() => changeMode("single")} className={board.mode === "single" ? segActive : segIdle}>
            단일 라인업
          </button>
          <button type="button" onClick={() => changeMode("versus")} className={board.mode === "versus" ? segActive : segIdle}>
            맞대결
          </button>
        </div>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          {board.mode === "versus" ? `${homeFilled} vs ${awayFilled}` : `${homeFilled}/11명`}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">제목</label>
          <input
            value={board.title}
            onChange={(e) => setBoard((b) => ({ ...b, title: e.target.value }))}
            maxLength={30}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-base font-medium text-neutral-900 outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
          />
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">부제 (선택)</label>
          <input
            value={board.subtitle}
            onChange={(e) => setBoard((b) => ({ ...b, subtitle: e.target.value }))}
            maxLength={40}
            placeholder="예) 2026 드림 스쿼드"
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
          />
        </div>
      </div>

      {/* 맞대결: 편집 팀 탭 */}
      {board.mode === "versus" && (
        <div className="mt-3 inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-700">
          <button
            type="button"
            onClick={() => { setActiveSide("home"); setActiveUid(null); }}
            className={activeSide === "home" ? "rounded-md bg-rose-500/10 px-3 py-1 text-sm font-medium text-rose-600 dark:text-rose-300" : "px-3 py-1 text-sm text-neutral-500 dark:text-neutral-400"}
          >
            우리팀 (아래)
          </button>
          <button
            type="button"
            onClick={() => { setActiveSide("away"); setActiveUid(null); }}
            className={activeSide === "away" ? "rounded-md bg-blue-500/10 px-3 py-1 text-sm font-medium text-blue-600 dark:text-blue-300" : "px-3 py-1 text-sm text-neutral-500 dark:text-neutral-400"}
          >
            상대팀 (위)
          </button>
        </div>
      )}

      {/* 포메이션 · 클럽 · 키트 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">포메이션</span>
          <select
            value={curFormation}
            onChange={(e) => applyFormation(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
          >
            {FORMATION_OPTIONS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <select
            value=""
            onChange={(e) => loadClub(e.target.value)}
            className="max-w-[200px] rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-white/[0.04] dark:text-white"
          >
            <option value="">클럽에서 가져오기…</option>
            {LEAGUE_ORDER.filter((lg) => clubsByLeague[lg]?.length).map((lg) => (
              <optgroup key={lg} label={LEAGUE_LABEL[lg] ?? lg}>
                {clubsByLeague[lg].map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                    {c.canBest11 ? "" : " (일부)"}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400">
            <Shirt className="h-3.5 w-3.5" /> 키트
          </span>
          <div className="flex gap-1.5">
            {KITS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setBoard((b) => ({ ...b, kit: k.key }))}
                title={k.label}
                aria-label={k.label}
                className={`h-6 w-6 rounded-full ring-2 transition-transform ${board.kit === k.key ? "scale-110 ring-rose-500" : "ring-transparent hover:scale-105"}`}
                style={{ background: `linear-gradient(135deg, ${k.from}, ${k.to})` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 피치 + 우측 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          <Pitch
            home={board.home}
            away={board.away}
            mode={board.mode}
            poolById={poolById}
            kitFrom={kitObj.from}
            kitTo={kitObj.to}
            activeUid={activeUid}
            onNodeClick={nodeClick}
            onNodeMove={nodeMove}
          />
          <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">선수를 눌러 채우거나 끌어서 위치를 옮기세요.</p>

          {/* 공유 */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={ogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
            >
              <Download className="h-4 w-4" /> 이미지로 저장
            </a>
            <button
              type="button"
              onClick={onShare}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200"
            >
              <Share2 className="h-4 w-4" /> 공유
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Link2 className="h-4 w-4" />}
              {copied ? "복사됨" : "링크 복사"}
            </button>
          </div>
        </div>

        {/* 우측: 후보 패널 or 안내 */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          {activeNode ? (
            <CandidatePanel
              pool={pool}
              pos={activePos}
              label={activeLabel}
              filled={!!(activeNode.pid || activeNode.name)}
              usedIds={usedIds}
              onPick={pickPlayer}
              onCustom={pickCustom}
              onDelete={deleteNode}
              onClose={() => setActiveUid(null)}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 dark:border-neutral-700 dark:bg-white/[0.02]">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                피치의 자리를 눌러 선수를 채우고, 끌어서 위치를 옮기세요. 포메이션·클럽을 고르거나 자유롭게 배치할 수 있어요.
              </p>
              <button
                type="button"
                onClick={addPlayer}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200"
              >
                <UserPlus className="h-4 w-4" /> 선수 추가
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
