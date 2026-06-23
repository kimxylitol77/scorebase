"use client";
// undo/redo 히스토리 훅 — past/present/future 스택. 드래그·그리기 중간상태는 transient(스택 미적립),
// 종료/이산 액션만 commit. 드래그가 매 프레임 스택을 쌓지 않게 분리.
import { useReducer, useCallback } from "react";

const MAX = 40;

type Updater<T> = T | ((prev: T) => T);
function resolve<T>(u: Updater<T>, prev: T): T {
  return typeof u === "function" ? (u as (p: T) => T)(prev) : u;
}

interface HistState<T> {
  past: T[];
  present: T;
  future: T[];
}
type Action<T> =
  | { type: "transient"; payload: Updater<T> }
  | { type: "commit"; payload: Updater<T> }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "checkpoint" }
  | { type: "reset"; payload: T };

function reducer<T>(state: HistState<T>, action: Action<T>): HistState<T> {
  switch (action.type) {
    case "transient":
      return { ...state, present: resolve(action.payload, state.present) };
    case "commit": {
      const present = resolve(action.payload, state.present);
      if (Object.is(present, state.present)) return state;
      return { past: [...state.past, state.present].slice(-MAX), present, future: [] };
    }
    case "undo": {
      if (!state.past.length) return state;
      const previous = state.past[state.past.length - 1];
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
    }
    case "redo": {
      if (!state.future.length) return state;
      const next = state.future[0];
      return { past: [...state.past, state.present], present: next, future: state.future.slice(1) };
    }
    case "checkpoint":
      // 드래그 시작 등에서 현재 상태를 과거로 적립(present는 유지) → 이후 transient 이동을 undo로 되돌림.
      return { ...state, past: [...state.past, state.present].slice(-MAX), future: [] };
    case "reset":
      return { past: [...state.past, state.present].slice(-MAX), present: action.payload, future: [] };
    default:
      return state;
  }
}

export function useHistory<T>(initial: T) {
  const [hist, dispatch] = useReducer(reducer<T>, { past: [], present: initial, future: [] });
  const setTransient = useCallback((p: Updater<T>) => dispatch({ type: "transient", payload: p }), []);
  const commit = useCallback((p: Updater<T>) => dispatch({ type: "commit", payload: p }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const checkpoint = useCallback(() => dispatch({ type: "checkpoint" }), []);
  const reset = useCallback((next: T) => dispatch({ type: "reset", payload: next }), []);
  return {
    state: hist.present,
    canUndo: hist.past.length > 0,
    canRedo: hist.future.length > 0,
    setTransient,
    commit,
    checkpoint,
    undo,
    redo,
    reset,
  };
}
