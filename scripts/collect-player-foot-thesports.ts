// 축구 선수 주발·계약만료 전수 수집 — ts football/player/with_stat/list 페이지 순회 → data/player-foot.json + data/player-contract.json.
//   위키데이터 P8006 은 커버 3%(118명)뿐이라 ts 로 교체. 교차검증 24/24 일치 (1=왼발 2=오른발 3=양발).
//   TheSportsPlayer 에 있는 id 만 저장(현재 45k). 700ms/페이지·1000명/페이지 ≈ 1,268페이지.
//   ts 가 주발을 모르는 선수는 "?" 로 기록 — 화면 미표시(FOOT_KO 미등재)이자 --missing 재조회 방지.
//   중단돼도 결과 파일은 남는다 — 재실행하면 data/.player-foot-progress.json 의 다음 페이지부터.
//   npx tsx scripts/collect-player-foot-thesports.ts          # 이어서
//   npx tsx scripts/collect-player-foot-thesports.ts --from 1 # 처음부터
//   npx tsx scripts/collect-player-foot-thesports.ts --missing # 미보유 선수만 단건 보충 (주간 러너용)
import "../src/lib/env";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const prisma = new PrismaClient();
const USER = process.env.THESPORTS_USER!;
const SECRET = process.env.THESPORTS_SECRET!;
const FOOT_PATH = "data/player-foot.json";
const CONTRACT_PATH = "data/player-contract.json";
const PROGRESS_PATH = "data/.player-foot-progress.json";
const FOOT_BY_CODE: Record<number, string> = { 1: "L", 2: "R", 3: "B" };
const UNKNOWN = "?"; // ts 가 주발을 모르는 선수 — 화면 미표시 + 주간 재조회 제외
const MISSING_LIMIT = 800; // --missing 1회 상한 (700ms/콜 ≈ 10분)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TsPlayer { id?: string; preferred_foot?: number; contract_until?: number }

const readJson = <T>(p: string, fallback: T): T =>
  fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf-8")) as T) : fallback;

async function fetchTs(key: "page" | "uuid", value: string): Promise<TsPlayer[]> {
  const url = new URL("https://api.thesports.com/v1/football/player/with_stat/list");
  url.searchParams.set("user", USER);
  url.searchParams.set("secret", SECRET);
  url.searchParams.set(key, value);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const d = (await (await fetch(url, { signal: AbortSignal.timeout(30000) })).json()) as { code: number; results?: TsPlayer[] };
      if (d.code !== 0) throw new Error(`code=${d.code}`);
      return d.results ?? [];
    } catch (e) {
      console.warn(`\n  ${key}=${value} 실패(${(e as Error).message}) — 5s 후 재시도`);
      await sleep(5000);
    }
  }
  throw new Error(`${key}=${value} 3회 실패 — 중단(재실행하면 이어서)`);
}

/** ts 응답 1건을 결과 맵에 반영. 주발 미상은 "?" 로 남겨 재조회를 막되 기존 값은 덮지 않는다. */
function apply(r: TsPlayer, foot: Record<string, string>, contract: Record<string, number>) {
  if (!r.id) return;
  const f = FOOT_BY_CODE[r.preferred_foot ?? 0];
  if (f) foot[r.id] = f;
  else if (!foot[r.id]) foot[r.id] = UNKNOWN;
  if (r.contract_until && r.contract_until > 0) contract[r.id] = r.contract_until;
}

const save = (foot: Record<string, string>, contract: Record<string, number>) => {
  fs.writeFileSync(FOOT_PATH, JSON.stringify(foot, null, 0) + "\n");
  fs.writeFileSync(CONTRACT_PATH, JSON.stringify(contract, null, 0) + "\n");
};
const known = (foot: Record<string, string>) => Object.values(foot).filter((v) => v !== UNKNOWN).length;

async function main() {
  const fromArg = process.argv.indexOf("--from");
  const missingMode = process.argv.includes("--missing");
  const ours = (await prisma.theSportsPlayer.findMany({ select: { id: true } })).map((p) => p.id);
  await prisma.$disconnect();

  const foot = readJson<Record<string, string>>(FOOT_PATH, {});
  const contract = readJson<Record<string, number>>(CONTRACT_PATH, {});

  if (missingMode) {
    const targets = ours.filter((id) => !foot[id]).slice(0, MISSING_LIMIT);
    console.log(`미보유 ${ours.filter((id) => !foot[id]).length}명 중 ${targets.length}명 조회`);
    for (let i = 0; i < targets.length; i++) {
      for (const r of await fetchTs("uuid", targets[i])) apply(r, foot, contract);
      if (i % 50 === 0) save(foot, contract);
      await sleep(700);
    }
    save(foot, contract);
    console.log(`완료 — 주발 ${known(foot)}명 (대상 ${ours.length})`);
    return;
  }

  const ourSet = new Set(ours);
  const startPage = fromArg >= 0 ? Number(process.argv[fromArg + 1]) : readJson<{ page: number }>(PROGRESS_PATH, { page: 0 }).page + 1;
  console.log(`대상 선수 ${ourSet.size}명 | 기존 주발 ${known(foot)} · 계약 ${Object.keys(contract).length} | page ${startPage} 부터`);

  let page = startPage;
  let scanned = 0;
  for (;;) {
    const rows = await fetchTs("page", String(page));
    if (rows.length === 0) break;
    scanned += rows.length;
    for (const r of rows) if (r.id && ourSet.has(r.id)) apply(r, foot, contract);
    if (page % 25 === 0) {
      save(foot, contract);
      fs.writeFileSync(PROGRESS_PATH, JSON.stringify({ page }) + "\n");
    }
    process.stdout.write(`\rpage ${page} | 스캔 ${scanned} | 주발 ${known(foot)} · 계약 ${Object.keys(contract).length}`);
    page++;
    await sleep(700);
  }

  save(foot, contract);
  if (fs.existsSync(PROGRESS_PATH)) fs.unlinkSync(PROGRESS_PATH);
  console.log(`\n완료 — 주발 ${known(foot)}명 · 계약만료 ${Object.keys(contract).length}명 (대상 ${ourSet.size})`);
}

main();
