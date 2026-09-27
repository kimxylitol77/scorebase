// 드래프트 선수-시즌 풀 로더 — data/draft-pool-*.json 을 서버에서만 읽는다 (수치가 클라이언트로 가면 안 됨)
import "server-only";
import { readFileSync } from "fs";
import path from "path";
import type { DraftMode, PoolFile } from "./types";

const cache = new Map<DraftMode, PoolFile>();

export function getPool(mode: DraftMode): PoolFile {
  const hit = cache.get(mode);
  if (hit) return hit;
  const file = mode === "nba" ? "data/draft-pool-nba.json" : "data/draft-pool-kbl.json";
  const pool = JSON.parse(readFileSync(path.join(process.cwd(), file), "utf-8")) as PoolFile;
  cache.set(mode, pool);
  return pool;
}

export function isDraftMode(v: unknown): v is DraftMode {
  return v === "nba" || v === "kbl";
}

export const MODE_LABEL: Record<DraftMode, string> = { nba: "NBA", kbl: "KBL" };
