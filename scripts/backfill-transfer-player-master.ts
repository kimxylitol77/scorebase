// 이적 피드(FootballTransfer)에 등장하나 TheSportsPlayer 에 없는 선수의 마스터를 생성한다.
//   backfill-missing-player-master.ts(PMV 기준)의 이적 창 변형 — 이적 창의 익명 "선수" 행은
//   빅딜·최신 뷰에서 비노출되므로, player/with_stat/list(인가)로 name·logo·position 을 만들고
//   Haiku 음역으로 nameKo 까지 채워 즉시 재노출시킨다. (라인업 음역 cron 은 출전 선수만 다룸)
//   대상: 현재 이적 창(6~9월=여름/12~2월=겨울, 그 외 최근 90일) 내 유료(fee>0) 이적의 익명 선수.
//   --apply 없으면 dry-run. 페이스 700ms/콜 (ts whitelist IP 버스트 금지). 멱등.
//   실행: 화이트리스트 IP 머신(집/워커)에서 npx tsx scripts/backfill-transfer-player-master.ts --apply
import "../src/lib/env";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const USER = process.env.THESPORTS_USER!;
const SECRET = process.env.THESPORTS_SECRET!;
const APPLY = process.argv.includes("--apply");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// /transfers 의 transferWindow() 와 동일한 창 산출
function windowFrom(): number {
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
  if (m >= 6 && m <= 9) return Date.UTC(y, 5, 1) / 1000;
  if (m === 12) return Date.UTC(y, 11, 1) / 1000;
  if (m <= 2) return Date.UTC(y - 1, 11, 1) / 1000;
  return Math.floor(now.getTime() / 1000) - 90 * 86400;
}

async function fetchPlayer(uuid: string): Promise<{ name?: string; logo?: string; position?: string } | null> {
  const url = new URL("https://api.thesports.com/v1/football/player/with_stat/list");
  url.searchParams.set("user", USER);
  url.searchParams.set("secret", SECRET);
  url.searchParams.set("uuid", uuid);
  const d: { code: number; results?: { name?: string; logo?: string; position?: string }[] } =
    await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json();
  if (d.code !== 0) throw new Error(`code=${d.code}`);
  return d.results?.[0] ?? null;
}

/** player-names cron 과 동일 규칙의 Haiku 음역 — 영문명 배열 → { 영문명: 한글명 }. */
async function haikuTranslate(names: string[]): Promise<Record<string, string>> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || names.length === 0) return {};
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
  const prompt =
    `다음 축구 선수 영문 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
    `국적이 다양합니다 (한국·일본·중국·유럽·남미 등) — 각 국적의 한국어 관용 표기를 따르세요.\n` +
    `- 한국 선수: 두음법칙. Lee→이, Ryu→류. 예: "Son Heung-Min"→손흥민 (띄어쓰기 X)\n` +
    `- 일본: 일본어 발음. "Mitoma"→미토마\n` +
    `- 남미(브라질 등): 현지 발음. "Vinicius"→비니시우스. 브라질식 R→H\n` +
    `- 유럽: 관용 표기. "Mbappe"→음바페, "Haaland"→홀란드\n` +
    `- 풀네임이면 한국 미디어 핵심 표기 (보통 성 위주).\n` +
    `- 자신없으면 그 entry 제외 (틀린 음역보다 누락).\n\n` +
    `선수 list:\n` +
    names.map((n, i) => `${i + 1}. "${n}"`).join("\n") +
    `\n\n출력 — JSON 객체 한 줄만 (설명 X). key 는 위 영문 그대로:\n` +
    `{"Son Heung-Min": "손흥민", "Mbappe": "음바페"}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    const m = (data?.content?.[0]?.text ?? "").match(/\{[\s\S]*\}/);
    if (!m) return {};
    const obj = JSON.parse(m[0]) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [en, ko] of Object.entries(obj)) {
      if (typeof ko !== "string") continue;
      const s = ko.trim();
      if (!s || !/[가-힣]/.test(s)) continue; // 한글 필수
      const cjk = s.match(/[一-鿿]/g);
      if (cjk && cjk.length >= 2) continue; // 중국어 혼입 방어
      out[en] = s;
    }
    return out;
  } catch {
    return {};
  }
}

async function main() {
  const from = windowFrom();
  const rows = await prisma.footballTransfer.findMany({
    where: { league: { not: null }, transferTime: { gte: from }, transferFee: { gt: 0 } },
    select: { playerId: true, toTeamId: true },
    orderBy: { transferFee: "desc" },
  });
  const byPid = new Map<string, string | null>();
  for (const r of rows) if (!byPid.has(r.playerId)) byPid.set(r.playerId, r.toTeamId);
  const pids = [...byPid.keys()];
  const tsRows = await prisma.theSportsPlayer.findMany({
    where: { id: { in: pids } },
    select: { id: true, name: true, nameKo: true },
  });
  const named = new Set(tsRows.filter((p) => p.nameKo || p.name).map((p) => p.id));
  const missing = pids.filter((p) => !named.has(p));
  console.log(`창(${new Date(from * 1000).toISOString().slice(0, 10)}~) 유료 이적 선수 ${pids.length} · 익명 ${missing.length}`);
  if (!APPLY) {
    console.log(`\nDRY-RUN — 생성하려면 --apply. 예상 소요 ~${Math.ceil((missing.length * 0.7) / 60)}분 (700ms/콜)`);
    console.log("샘플 id:", missing.slice(0, 8).join(", "));
    return;
  }

  let created = 0, noName = 0, fail = 0;
  const createdNames: { id: string; en: string }[] = [];
  for (let i = 0; i < missing.length; i++) {
    const id = missing[i];
    try {
      const r = await fetchPlayer(id);
      if (r?.name) {
        await prisma.theSportsPlayer.upsert({
          where: { id },
          update: { name: r.name, position: r.position || null, photoUrl: r.logo || null },
          create: {
            id, name: r.name, sport: "FOOTBALL",
            position: r.position || null, photoUrl: r.logo || null, teamId: byPid.get(id) || null,
          },
        });
        createdNames.push({ id, en: r.name });
        created++;
      } else noName++;
    } catch (e) {
      fail++;
      if (fail <= 5) console.log(`  ${id} ERR ${(e as Error).message}`);
    }
    await sleep(700);
  }
  console.log(`마스터 생성 ${created} · 이름없음 ${noName} · 실패 ${fail}`);

  // 음역 — 50개 단위 배치 (player-names cron 의 BATCH 와 동일 규모)
  let koFilled = 0;
  for (let i = 0; i < createdNames.length; i += 50) {
    const chunk = createdNames.slice(i, i + 50);
    const enToKo = await haikuTranslate(chunk.map((c) => c.en));
    for (const { id, en } of chunk) {
      const ko = enToKo[en];
      if (!ko) continue;
      await prisma.theSportsPlayer.update({ where: { id }, data: { nameKo: ko } }).catch(() => {});
      koFilled++;
    }
  }
  console.log(`한글명 음역 ${koFilled}/${created} (미음역은 영문명 노출 — 라인업 등장 시 cron 이 보강)`);
}
main().catch((e) => console.log("ERR", (e as Error).message)).finally(() => prisma.$disconnect());
