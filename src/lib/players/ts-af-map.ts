// ts↔af 선수 id 매핑 로더 — 축구 선수 페이지 단일화 (2026-06-10).
// data/ts-af-player-map.json (build-ts-af-player-map 산출, 시즌 스탯 지문+이름 매칭).
// 소비처: transfers 대회별 스탯(ts→af), /players 축구 redirect(af→ts).

import { readFileSync } from "fs";
import path from "path";

interface MapFile {
  tsToAf: Record<string, number>;
  afToTs: Record<string, string>;
}

let cached: MapFile | null = null;
function load(): MapFile | null {
  if (cached) return cached;
  try {
    cached = JSON.parse(
      readFileSync(path.join(process.cwd(), "data/ts-af-player-map.json"), "utf-8"),
    );
    return cached;
  } catch {
    return null; // 맵 미생성 — 호출측 자동 미적용
  }
}

export function tsPlayerToAf(tsId: string): number | null {
  return load()?.tsToAf[tsId] ?? null;
}

export function afPlayerToTs(afId: number | string): string | null {
  return load()?.afToTs[String(afId)] ?? null;
}

/** 매핑 전체 [tsId, afId][] — 전 선수 순회 잡(트로피 수집 등)용. */
export function tsAfEntries(): [string, number][] {
  return Object.entries(load()?.tsToAf ?? {});
}
