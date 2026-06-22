// MLB/NBA 영문 선수명 → 한국어 사전 자동 생성.
// Source: 위키피디아 ko langlinks (en wiki title → ko wiki title).
// 입력: ESPN 일정/boxscore 의 모든 선수명 + 시즌 리더 + KBO 외국인.
// 출력: src/lib/sports/mlb-player-names.ts, src/lib/sports/nba-player-names-wiki.ts
//
// 실행: tsx scripts/build-player-names-from-wiki.ts mlb 7   (MLB, 최근 7일)
//      tsx scripts/build-player-names-from-wiki.ts nba 30  (NBA, 최근 30일)

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SPORT = (process.argv[2] ?? "mlb").toLowerCase();
const DAYS = parseInt(process.argv[3] ?? "7", 10);
const UA = "scorebase-bot/1.0 (+https://scorebase.kr; admin@scorebase.kr)";

const SPORT_CONFIG = {
  mlb: {
    espnPath: "baseball/mlb",
    outPath: "src/lib/sports/mlb-player-names.ts",
    constName: "MLB_PLAYER_NAMES_KO",
    label: "MLB",
  },
  nba: {
    espnPath: "basketball/nba",
    outPath: "src/lib/sports/nba-player-names-wiki.ts",
    constName: "NBA_PLAYER_NAMES_WIKI_KO",
    label: "NBA",
  },
} as const;

const cfg = SPORT_CONFIG[SPORT as keyof typeof SPORT_CONFIG];
if (!cfg) {
  console.error(`unknown sport: ${SPORT}. supported: mlb, nba`);
  process.exit(1);
}

interface EspnScheduleResp {
  events?: Array<{
    id: string;
    status?: { type?: { state?: string } };
  }>;
}
interface EspnSummaryResp {
  boxscore?: {
    players?: Array<{
      statistics?: Array<{
        athletes?: Array<{
          athlete?: { displayName?: string };
        }>;
      }>;
    }>;
  };
}

async function collectNames(): Promise<Set<string>> {
  const names = new Set<string>();
  const today = new Date();
  for (let i = 0; i <= DAYS; i++) {
    const d = new Date(today.getTime() - i * 86400 * 1000);
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${cfg.espnPath}/scoreboard?dates=${ymd}`,
      { headers: { "user-agent": UA } },
    );
    if (!res.ok) continue;
    const data = (await res.json()) as EspnScheduleResp;
    const events = data.events ?? [];
    process.stdout.write(`[${ymd}] ${events.length} events `);
    for (const ev of events) {
      try {
        const sres = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/${cfg.espnPath}/summary?event=${ev.id}`,
          { headers: { "user-agent": UA } },
        );
        if (!sres.ok) continue;
        const sdata = (await sres.json()) as EspnSummaryResp;
        for (const team of sdata.boxscore?.players ?? []) {
          for (const grp of team.statistics ?? []) {
            for (const ath of grp.athletes ?? []) {
              const n = ath.athlete?.displayName?.trim();
              if (n) names.add(n);
            }
          }
        }
        process.stdout.write(".");
      } catch {
        process.stdout.write("x");
      }
    }
    process.stdout.write(`\n`);
  }
  return names;
}

interface WikiLangResp {
  query?: {
    pages?: Record<
      string,
      { title?: string; langlinks?: Array<{ "*"?: string }> }
    >;
    redirects?: Array<{ from: string; to: string }>;
    normalized?: Array<{ from: string; to: string }>;
  };
}

async function wikiBatch(names: string[]): Promise<Map<string, string>> {
  // Wiki API: titles= 한 번에 최대 50개. URL encode.
  const out = new Map<string, string>();
  for (let i = 0; i < names.length; i += 50) {
    const chunk = names.slice(i, i + 50);
    const titles = chunk.map((n) => n.replace(/_/g, " ")).join("|");
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&titles=${encodeURIComponent(titles)}&lllang=ko&format=json&redirects=1&lllimit=50`;
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) {
      process.stdout.write(`! ${res.status} `);
      continue;
    }
    const data = (await res.json()) as WikiLangResp;
    // wiki API 가 title 을 다르게 normalize 할 수 있음 — back-trace
    const redirected = new Map<string, string>();
    for (const r of data.query?.normalized ?? []) redirected.set(r.to, r.from);
    for (const r of data.query?.redirects ?? []) redirected.set(r.to, r.from);
    for (const p of Object.values(data.query?.pages ?? {})) {
      const ko = p.langlinks?.[0]?.["*"];
      if (!ko || !p.title) continue;
      // 최종 title → original input 역추적
      let orig = p.title;
      const seen = new Set<string>();
      while (redirected.has(orig) && !seen.has(orig)) {
        seen.add(orig);
        orig = redirected.get(orig)!;
      }
      out.set(orig, ko);
    }
    process.stdout.write(`. (${out.size}/${names.length}) `);
    await new Promise((r) => setTimeout(r, 200)); // rate limit 친화
  }
  return out;
}

function loadExistingDict(path: string): Set<string> {
  const full = resolve(path);
  if (!existsSync(full)) return new Set();
  const content = readFileSync(full, "utf8");
  const matches = content.matchAll(/"([^"]+)":\s*"[^"]+"/g);
  const keys = new Set<string>();
  for (const m of matches) keys.add(m[1]);
  return keys;
}

function writeOutput(dict: Map<string, string>) {
  const sorted = [...dict.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const body = sorted
    .map(([en, ko]) => `  "${en.replace(/"/g, '\\"')}": "${ko.replace(/"/g, '\\"')}",`)
    .join("\n");
  const file = `// ${cfg.label} 선수 영문 → 한국어 사전.
// 자동 생성: scripts/build-player-names-from-wiki.ts
// Source: 위키피디아 ko langlinks (en.wikipedia.org/w/api.php?prop=langlinks&lllang=ko)

export const ${cfg.constName}: Record<string, string> = {
${body}
};
`;
  writeFileSync(resolve(cfg.outPath), file);
  console.log(`✓ wrote ${cfg.outPath} (${sorted.length} entries)`);
}

async function main() {
  console.log(`▶ ${cfg.label} — ESPN ${DAYS}일 boxscore 수집`);
  const names = await collectNames();
  // NBA 는 시즌 종료 시 ESPN boxscore 가 비므로 nba-players.json 전체 로스터(537)도 위키 조회 대상에 포함
  if (SPORT === "nba") {
    const idxPath = resolve("data/nba-players.json");
    if (existsSync(idxPath)) {
      const idx = JSON.parse(readFileSync(idxPath, "utf8")) as Record<string, { name?: string }>;
      let added = 0;
      for (const e of Object.values(idx)) if (e?.name && !names.has(e.name)) { names.add(e.name); added++; }
      console.log(`+ nba-players.json 로스터 ${added}명 추가`);
    }
  }
  console.log(`\n수집된 선수: ${names.size}명`);

  // 기존 사전에 있는 건 skip 가능 (단, 위키 매핑 더 정확할 수 있어 옵션). 일단 전부 조회.
  const list = [...names];
  console.log(`\n▶ 위키피디아 langlinks batch lookup (chunk 50)`);
  const dict = await wikiBatch(list);
  console.log(`\n매핑됨: ${dict.size}/${list.length}`);

  writeOutput(dict);

  // 누락 출력 (top 50)
  const missing = list.filter((n) => !dict.has(n));
  console.log(`\n누락 ${missing.length}명 (sample):`);
  for (const n of missing.slice(0, 30)) console.log(`  - ${n}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
