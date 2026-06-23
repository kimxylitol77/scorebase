"use client";
// 라인업 피치 — 좌표 절대배치 + 드래그(vanilla Pointer Events). 단일/맞대결 양 팀.
// 표시모드(사진/OVR/이름)·세로가로 회전 지원. 6px 임계로 클릭/드래그 구분. crossOrigin은 화면 캡처용.
import { useRef, useCallback } from "react";
import { Plus } from "lucide-react";
import type { Side, DisplayMode, Orientation } from "@/lib/lineup/lineup-state";
import { SIDE_COLORS, toDisplayXY, fromDisplayXY } from "@/lib/lineup/formations";
import type { PoolPlayer } from "./types";

const DRAG_THRESHOLD = 6;

function ovrBadge(ovr: number): string {
  return ovr >= 90 ? "#be3455" : ovr >= 80 ? "#475569" : "#52525b";
}

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

  const clampY = useCallback(
    (py: number, side: "home" | "away"): number => {
      if (mode === "single") return Math.max(4, Math.min(96, py));
      return side === "away" ? Math.max(4, Math.min(47, py)) : Math.max(53, Math.min(96, py));
    },
    [mode],
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
      const y = clampY(stored.y, d.side);
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
      <div className="pointer-events-none absolute inset-[4%] rounded-md border-2 border-white/15" />
      {landscape ? (
        <div className={`pointer-events-none absolute inset-y-[4%] left-1/2 border-l-2 ${mode === "versus" ? "border-white/30" : "border-white/15"}`} />
      ) : (
        <div className={`pointer-events-none absolute inset-x-[4%] top-1/2 border-t-2 ${mode === "versus" ? "border-white/30" : "border-white/15"}`} />
      )}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[18%] w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/15" />

      {sides.map(([sideKey, side]) =>
        side.players.map((pl) => {
          const player = pl.pid ? poolById[pl.pid] : null;
          const name = player ? player.name : pl.name;
          const ovr = player ? player.ovr : null;
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
                ) : displayMode === "ovr" ? (
                  <span
                    className="flex h-[clamp(34px,8vw,56px)] w-[clamp(34px,8vw,56px)] items-center justify-center rounded-xl text-base font-bold text-white"
                    style={{ background: ovr != null ? ovrBadge(ovr) : "rgba(255,255,255,0.15)", boxShadow: `0 0 0 2px ${ring}` }}
                  >
                    {ovr != null ? ovr : dispPos}
                  </span>
                ) : displayMode === "name" ? (
                  <span
                    className="flex h-[clamp(30px,7vw,48px)] w-[clamp(30px,7vw,48px)] items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: chipBg, boxShadow: `0 0 0 2px ${ring}` }}
                  >
                    {(name ?? dispPos).slice(0, 2)}
                  </span>
                ) : player ? (
                  <span className="relative block h-[clamp(34px,8vw,56px)] w-[clamp(34px,8vw,56px)] overflow-hidden rounded-full bg-white/90" style={{ boxShadow: `0 0 0 2px ${ring}` }}>
                    {player.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={player.photo} alt={player.name} crossOrigin="anonymous" className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-sm font-bold text-emerald-800">{player.name.slice(0, 2)}</span>
                    )}
                    {ovr != null && (
                      <span className="absolute -bottom-1 -right-1 rounded-full px-1.5 text-[10px] font-bold text-white" style={{ background: ovrBadge(ovr) }}>
                        {ovr}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="flex h-[clamp(34px,8vw,56px)] w-[clamp(34px,8vw,56px)] items-center justify-center rounded-full bg-white/85 text-sm font-bold text-neutral-700" style={{ boxShadow: `0 0 0 2px ${ring}` }}>
                    {name!.slice(0, 2)}
                  </span>
                )}
              </span>
              <span className="mt-1 max-w-full truncate rounded px-1 text-[clamp(9px,2.4vw,12px)] font-semibold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
                {name ?? dispPos}
              </span>
            </button>
          );
        }),
      )}
    </div>
  );
}
