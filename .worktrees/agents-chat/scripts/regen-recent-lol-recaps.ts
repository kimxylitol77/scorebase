// 최근 LoL RECAP 일괄 재발행 — BDL quota 회복 위해 매치 간 60초 sleep.
// 사용: npx tsx scripts/regen-recent-lol-recaps.ts
import "@/lib/env";
import { regenerateLolRecap } from "@/jobs/regenerate-lol-recap";

const IDS = [604, 603, 602, 601, 600, 599, 598, 597];
const SLEEP_BETWEEN_MS = 60_000;

async function main() {
  console.log(`[bulk-regen] 대상 ${IDS.length}건 — 시작`);
  const start = Date.now();
  const results: Array<{ id: number; ok: boolean; bodyLength?: number; error?: string }> = [];

  for (let i = 0; i < IDS.length; i++) {
    const id = IDS[i];
    const t0 = Date.now();
    console.log(`\n[${i + 1}/${IDS.length}] regenerate #${id} ...`);
    try {
      const r = await regenerateLolRecap(id);
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      if (r.ok) {
        console.log(`  ✅ #${id} ${r.bodyLength}자 (${dt}s)`);
        results.push({ id, ok: true, bodyLength: r.bodyLength });
      } else {
        console.log(`  ❌ #${id} ${r.error}`);
        results.push({ id, ok: false, error: r.error });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ❌ #${id} 예외: ${msg}`);
      results.push({ id, ok: false, error: msg });
    }
    if (i < IDS.length - 1) {
      console.log(`  ⏳ 다음 매치까지 ${SLEEP_BETWEEN_MS / 1000}s 대기...`);
      await new Promise((r) => setTimeout(r, SLEEP_BETWEEN_MS));
    }
  }

  const total = ((Date.now() - start) / 1000 / 60).toFixed(1);
  console.log(`\n[bulk-regen] 완료 — ${total}분`);
  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  console.log(`성공 ${ok.length}건 / 실패 ${fail.length}건`);
  if (ok.length > 0) {
    const avg = Math.round(ok.reduce((a, b) => a + (b.bodyLength ?? 0), 0) / ok.length);
    console.log(`성공 평균 본문 길이: ${avg}자`);
  }
  for (const r of fail) console.log(`  실패 #${r.id}: ${r.error}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
