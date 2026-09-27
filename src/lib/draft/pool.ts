// 드래프트 선수-시즌 풀 로더 — data/draft-pool-*.json 을 서버에서만 읽는다 (수치가 클라이언트로 가면 안 됨)
import "server-only";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { MODES, type DraftMode } from "./modes";
import type { PoolFile } from "./types";

// 경로를 글자 그대로 적는다 — 배포 번들러가 파일을 찾아 함수에 같이 싣는 단서가 이 리터럴이다
const FILES: Record<DraftMode, string> = {
  nba: path.join(process.cwd(), "data/draft-pool-nba.json"),
  kbl: path.join(process.cwd(), "data/draft-pool-kbl.json"),
  kbo: path.join(process.cwd(), "data/draft-pool-kbo.json"),
  mlb: path.join(process.cwd(), "data/draft-pool-mlb.json"),
  epl: path.join(process.cwd(), "data/draft-pool-epl.json"),
  kleague: path.join(process.cwd(), "data/draft-pool-kleague.json"),
};

const cache = new Map<DraftMode, PoolFile>();

export function getPool(mode: DraftMode): PoolFile {
  const hit = cache.get(mode);
  if (hit) return hit;
  const pool = JSON.parse(readFileSync(FILES[mode], "utf-8")) as PoolFile;
  cache.set(mode, pool);
  return pool;
}

/** 풀 파일이 있는 모드만 — 데이터가 아직 없는 리그는 화면에 내지 않는다 */
export function availableModes(): DraftMode[] {
  return (Object.keys(MODES) as DraftMode[]).filter((m) => existsSync(FILES[m]));
}
