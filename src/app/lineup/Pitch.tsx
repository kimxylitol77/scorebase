"use client";
// 라인업 피치 — 좌표 절대배치 + 드래그(vanilla Pointer Events). 단일/맞대결 양 팀.
// 표시모드(사진/OVR/이름)·세로가로 회전 지원. 6px 임계로 클릭/드래그 구분. crossOrigin은 화면 캡처용.
import { useRef, useCallback } from "react";
import { Plus } from "lucide-react";
import type { Side, DisplayMode, Orientation } from "@/lib/lineup/lineup-state";
import { SIDE_COLORS, toDisplayXY, fromDisplayXY } from "@/lib/lineup/formations";
import type { PoolPlayer } from "./types";

const DRAG_THRESHOLD = 6;

interface Props {
  home: Side;
  away?: Side;
  mode: "single" | "versus";
  displayMode: DisplayMode;
  orientation: Orientation;
  poolById: Record<string, PoolPlayer>;
  kitFrom: string;
  kitTo: string;
  activeUid: string | null;
  onNodeClick: (side: "home" | "away", uid: string) => void;
  onNodeMove: (side: "home" | "away", uid: string, x: number, y: number) => void;
  onDragStart?: () => void; // 드래그 첫 이동 시 1회 (undo 체크포인트용)
}

export default function Pitch({ home, away, mode, displayMode, orientation, poolById, kitFrom, kitTo, activeUid, onNodeClick, onNodeMove, onDragStart }: Props) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ uid: string; side: "home" | "away"; sx: number; sy: number; moved: boolean } | null>(null);
  const landscape = orientation === "landscape";

  // 진영 제한 없음 — 단일·맞대결 모두 위아래 자유 이동(양 팀이 상대 진영까지 넘나들 수 있게).
  const clampY = useCallback(
    (py: number): number => Math.max(4, Math.min(96, py)),
    [],
  );

  const onDown = useCallback((e: React.PointerEvent, uid: string, side: "home" | "away") => {
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* 합성 이벤트·비활성 포인터는 캡처 불가 — 무시하고 드래그 진행 */
    }
    dragRef.current = { uid, side, sx: e.clientX, sy: e.clientY, moved: false };
  }, []);

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || !pitchRef.current) return;
      if (!d.moved) {
        if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < DRAG_THRESHOLD) return;
        d.moved = true;
        onDragStart?.();
      }
      const r = pitchRef.current.getBoundingClientRect();
      const dpx = ((e.clientX - r.left) / r.width) * 100;
      const dpy = ((e.clientY - r.top) / r.height) * 100;
      const stored = fromDisplayXY(dpx, dpy, landscape); // 표시 좌표 → 저장(세로) 좌표
      const x = Math.max(4, Math.min(96, stored.x));
      const y = clampY(stored.y);
      onNodeMove(d.side, d.uid, Math.round(x), Math.round(y));
    },
    [clampY, onNodeMove, landscape, onDragStart],
  );

  const onUp = useCallback(
    (_e: React.PointerEvent, uid: string, side: "home" | "away") => {
      const d = dragRef.current;
      dragRef.current = null;
      if (d && !d.moved) onNodeClick(side, uid);
    },
    [onNodeClick],
  );

  const sides: Array<["home" | "away", Side]> = [["home", home]];
  if (mode === "versus" && away) sides.push(["away", away]);

  return (
    <div
      ref={pitchRef}
      className="relative w-full overflow-hidden rounded-2xl"
      style={{ aspectRatio: landscape ? "16 / 10" : "4 / 5", background: `linear-gradient(${landscape ? "to right" : "to bottom"}, ${kitFrom}, ${kitTo})` }}
    >
      <PitchMarkings landscape={landscape} versus={mode === "versus"} />

      {sides.map(([sideKey, side]) =>
        side.players.map((pl) => {
          const player = pl.pid ? poolById[pl.pid] : null;
          const name = player ? player.name : pl.name;
          const number = player ? player.number : null;
          const dispPos = player ? player.pos : pl.pos;
          const empty = !player && !name;
          const isActive = activeUid === pl.uid;
          const ring = mode === "versus" ? SIDE_COLORS[sideKey].ring : "rgba(255,255,255,0.7)";
          const chipBg = mode === "versus" ? SIDE_COLORS[sideKey].solid : "rgba(255,255,255,0.25)";
          const disp = toDisplayXY(pl.x, pl.y, landscape);
          return (
            <button
              key={pl.uid}
              type="button"
              onPointerDown={(e) => onDown(e, pl.uid, sideKey)}
              onPointerMove={onMove}
              onPointerUp={(e) => onUp(e, pl.uid, sideKey)}
              className="absolute flex touch-none flex-col items-center"
              style={{ left: `${disp.x}%`, top: `${disp.y}%`, transform: "translate(-50%, -50%)", width: "21%" }}
            >
              <span className={`relative flex items-center justify-center rounded-full ${isActive ? "ring-4 ring-white" : ""}`}>
                {empty ? (
                  <span
                    className="flex h-[clamp(34px,8vw,56px)] w-[clamp(34px,8vw,56px)] items-center justify-center rounded-full border-2 border-dashed bg-white/10 text-white/80"
                    style={{ borderColor: mode === "versus" ? ring : "rgba(255,255,255,0.6)" }}
                  >
                    <Plus className="h-4 w-4" />
                  </span>
                ) : displayMode === "name" ? (
                  <span
                    className="flex h-[clamp(30px,7vw,48px)] w-[clamp(30px,7vw,48px)] items-center justify-center rounded-full text-base font-bold text-white"
                    style={{ background: chipBg, boxShadow: `0 0 0 2px ${ring}` }}
                  >
                    {number != null ? number : (name ?? dispPos).slice(0, 2)}
                  </span>
                ) : player ? (
                  <span className="relative block h-[clamp(34px,8vw,56px)] w-[clamp(34px,8vw,56px)] overflow-hidden rounded-full bg-white/90" style={{ boxShadow: `0 0 0 2px ${ring}` }}>
                    {player.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/lineup/img?u=${encodeURIComponent(player.photo)}`} alt={player.name} className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-sm font-bold text-emerald-800">{player.name.slice(0, 2)}</span>
                    )}
                  </span>
                ) : (
                  <span className="flex h-[clamp(34px,8vw,56px)] w-[clamp(34px,8vw,56px)] items-center justify-center rounded-full bg-white/85 text-sm font-bold text-neutral-700" style={{ boxShadow: `0 0 0 2px ${ring}` }}>
                    {name!.slice(0, 2)}
                  </span>
                )}
              </span>
              <span className="mt-1 max-w-full truncate rounded px-1 text-[clamp(9px,2.4vw,12px)] font-semibold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
                {name ?? dispPos}{number != null && displayMode !== "name" ? ` (${number})` : ""}
              </span>
            </button>
          );
        }),
      )}
    </div>
  );
}

// 축구장 라인 — 외곽·중앙선·센터서클/스팟·페널티 에어리어·골 에어리어·골대. 세로/가로 대응.
function PitchMarkings({ landscape, versus }: { landscape: boolean; versus: boolean }) {
  const lc = "border-white/20";
  const mid = versus ? "border-white/35" : "border-white/20";
  const goal = "border-white/35";
  const common = "pointer-events-none absolute border-2";
  return (
    <>
      <div className={`${common} inset-[3.5%] rounded-[3px] ${lc}`} />
      <div className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20 ${landscape ? "h-[26%] w-[16.25%]" : "h-[20.8%] w-[26%]"}`} />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/35" />
      {landscape ? (
        <>
          <div className={`pointer-events-none absolute inset-y-[3.5%] left-1/2 border-l-2 ${mid}`} />
          {/* 좌측 골 */}
          <div className={`${common} left-[3.5%] top-1/2 h-[52%] w-[15%] -translate-y-1/2 rounded-r-[3px] border-l-0 ${lc}`} />
          <div className={`${common} left-[3.5%] top-1/2 h-[24%] w-[8%] -translate-y-1/2 rounded-r-[2px] border-l-0 ${lc}`} />
          <div className={`${common} left-[1.8%] top-1/2 h-[14%] w-[1.7%] -translate-y-1/2 rounded-l-[2px] border-r-0 ${goal}`} />
          {/* 우측 골 */}
          <div className={`${common} right-[3.5%] top-1/2 h-[52%] w-[15%] -translate-y-1/2 rounded-l-[3px] border-r-0 ${lc}`} />
          <div className={`${common} right-[3.5%] top-1/2 h-[24%] w-[8%] -translate-y-1/2 rounded-l-[2px] border-r-0 ${lc}`} />
          <div className={`${common} right-[1.8%] top-1/2 h-[14%] w-[1.7%] -translate-y-1/2 rounded-r-[2px] border-l-0 ${goal}`} />
        </>
      ) : (
        <>
          <div className={`pointer-events-none absolute inset-x-[3.5%] top-1/2 border-t-2 ${mid}`} />
          {/* 위쪽 골 */}
          <div className={`${common} left-1/2 top-[3.5%] h-[15%] w-[50%] -translate-x-1/2 rounded-b-[3px] border-t-0 ${lc}`} />
          <div className={`${common} left-1/2 top-[3.5%] h-[8%] w-[24%] -translate-x-1/2 rounded-b-[2px] border-t-0 ${lc}`} />
          <div className={`${common} left-1/2 top-[1.8%] h-[1.7%] w-[14%] -translate-x-1/2 rounded-t-[2px] border-b-0 ${goal}`} />
          {/* 아래쪽 골 */}
          <div className={`${common} bottom-[3.5%] left-1/2 h-[15%] w-[50%] -translate-x-1/2 rounded-t-[3px] border-b-0 ${lc}`} />
          <div className={`${common} bottom-[3.5%] left-1/2 h-[8%] w-[24%] -translate-x-1/2 rounded-t-[2px] border-b-0 ${lc}`} />
          <div className={`${common} bottom-[1.8%] left-1/2 h-[1.7%] w-[14%] -translate-x-1/2 rounded-b-[2px] border-t-0 ${goal}`} />
        </>
      )}
    </>
  );
}
