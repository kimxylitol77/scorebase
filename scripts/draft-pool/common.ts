// 드래프트 풀 빌드 공용 — 원본 응답 디스크 캐시, 한글 이름 폴백, z 점수, 풀 파일 마무리(기준선 모의 포함)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { toKoreanPlayerName } from "../../src/lib/player-names";
import { simulateBaseline, type Baseline } from "../../src/lib/draft/baseline";
import type { DraftMode, PoolCard, PoolFile, PoolTeam } from "../../src/lib/draft/types";

const CACHE = join(tmpdir(), "draft-pool-cache");
mkdirSync(CACHE, { recursive: true });
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const round1 = (v: number) => Math.round(v * 10) / 10;

export async function cachedJson<T>(key: string, url: string, headers?: Record<string, string>, waitMs = 300): Promise<T> {
  const file = join(CACHE, `${key}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as T;
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      const d = (await r.json()) as T;
      writeFileSync(file, JSON.stringify(d));
      await sleep(waitMs);
      return d;
    } catch (e) {
      lastErr = e;
      await sleep(1500);
    }
  }
  throw lastErr;
}

/** 공용 사전에 없는 옛 선수 이름 — scripts/build-draft-names.ts 산출물 (모드별 파일) */
export function nameResolver(mode: DraftMode): (en: string) => string {
  const file = resolve(`data/draft-names-${mode}.json`);
  const extra: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  return (en) => {
    const ko = toKoreanPlayerName(en);
    if (!/[가-힣]/.test(ko)) return extra[en] ?? en;
    // 공용 사전은 현역 기준이라 아버지("Vladimir Guerrero")가 아들 이름("게레로 주니어")으로 나온다 — 원문에 없는 접미사는 뗀다
    return /\b(Jr\.?|II|III)\s*$/.test(en) ? ko : ko.replace(/\s*(주니어|2세|3세)$/, "");
  };
}

export function zscores(xs: number[]): number[] {
  if (xs.length === 0) return [];
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1;
  return xs.map((x) => (x - m) / sd);
}

/** 0~1 백분위 (나보다 작은 값의 비율) */
export function pctRanks(xs: number[]): number[] {
  if (xs.length <= 1) return xs.map(() => 0.5);
  return xs.map((x) => Math.round((xs.filter((y) => y < x).length / (xs.length - 1)) * 100) / 100);
}

/** 그룹 키별로 fame 을 z 점수로 바꾼다 — 타자와 투수처럼 눈금이 다른 값을 한 풀에서 비교하려고 */
export function standardizeFame<T extends { fame: number }>(cards: T[], groupOf: (c: T) => string): void {
  const groups = new Map<string, T[]>();
  for (const c of cards) groups.set(groupOf(c), [...(groups.get(groupOf(c)) ?? []), c]);
  for (const g of groups.values()) {
    const z = zscores(g.map((c) => c.fame));
    g.forEach((c, i) => (c.fame = Math.round(z[i] * 100) / 100));
  }
}

export interface Built {
  teams: PoolTeam[];
  cards: PoolCard[];
  seasons: [number, number];
  fixedNorm?: Baseline["norm"];
}

export function finalize(mode: DraftMode, b: Built): void {
  // 음역이 안 된 축구 이름 키("약칭 | 본명")는 약칭만 남긴다
  const untranslated = new Set(b.cards.filter((c) => !/[가-힣]/.test(c.name)).map((c) => c.name));
  for (const c of b.cards) if (c.name.includes(" | ")) c.name = c.name.split(" | ")[0];
  const base = simulateBaseline({ teams: b.teams, cards: b.cards }, mode, 10_000, b.fixedNorm);
  const file: PoolFile = {
    meta: {
      mode,
      updatedAt: new Date().toISOString().slice(0, 10),
      seasons: b.seasons,
      cards: b.cards.length,
      lockdown: base.lockdown,
      norm: base.norm,
      quantiles: base.quantiles,
    },
    teams: b.teams,
    cards: b.cards,
  };
  const out = resolve(`data/draft-pool-${mode}.json`);
  writeFileSync(out, JSON.stringify(file));
  // 음역 스크립트(build-draft-names.ts)가 읽을 목록 — 풀 파일에는 약칭만 남아 본명을 잃는다
  writeFileSync(join(CACHE, `untranslated-${mode}.json`), JSON.stringify([...untranslated]));
  const q = base.quantiles;
  console.log(`\n${mode.toUpperCase()} → ${out}`);
  console.log(`  카드 ${b.cards.length}장 · 철벽 기준 ${base.lockdown} · 균형 눈금 ${base.norm.off}/${base.norm.def} · 점수 p10 ${q[10]} p50 ${q[50]} p90 ${q[90]} p99 ${q[99]}`);
  const top = (k: "off" | "def") =>
    [...b.cards].sort((x, y) => y[k] - x[k]).slice(0, 8).map((c) => `${c.name} ${c.season} ${c[k]}`).join(" · ");
  console.log("  off 상위:", top("off"));
  console.log("  def 상위:", top("def"));
  const byPos = new Map<string, number>();
  for (const c of b.cards) for (const p of c.pos) byPos.set(p, (byPos.get(p) ?? 0) + 1);
  console.log("  포지션별:", [...byPos].map(([p, n]) => `${p} ${n}`).join(" · "));
  console.log(`  영문 이름 선수 ${untranslated.size}명 · 사진 없는 카드 ${b.cards.filter((c) => !c.photo).length}장`);
  const small = b.teams.map((t) => ({ t, n: new Set(b.cards.filter((c) => c.team === t.key).map((c) => c.pid)).size }));
  console.log(`  구단 ${small.length}개 · 21명 이상 ${small.filter((x) => x.n >= 21).length}개 (미만: ${small.filter((x) => x.n < 21).map((x) => `${x.t.name} ${x.n}`).join(", ") || "없음"})`);
}
