// Wikidata P8006(주발) 1회 수집 — player-overrides.json 의 qid 보유 선수 → data/player-foot.json.
// 주발은 불변이라 cron 불요. enrich-players-wikidata 로 qid 가 늘면 수동 재실행.
//   npx tsx scripts/collect-player-foot.ts
import * as fs from "fs";

const UA = { "User-Agent": "scorebase/1.0 (https://scorebase.kr; player foot; kimxylitol77@gmail.com)" };
const FOOT_BY_QID: Record<string, string> = {
  Q2183543: "L", // left-footedness
  Q1843233: "R", // right-footedness
  Q457332: "B", // ambidexterity — 양발
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Ov { qid?: string }
interface WbResp { entities?: Record<string, { claims?: { P8006?: Array<{ mainsnak?: { datavalue?: { value?: { id?: string } } } }> } }> }

async function main() {
  const ov = JSON.parse(fs.readFileSync("data/player-overrides.json", "utf-8")) as Record<string, Ov>;
  const pairs = Object.entries(ov).filter(([, v]) => v.qid).map(([tsId, v]) => [tsId, v.qid!] as const);
  const byQid = new Map<string, string[]>(); // qid → tsIds (동일 qid 중복 방어)
  for (const [tsId, qid] of pairs) {
    if (!byQid.has(qid)) byQid.set(qid, []);
    byQid.get(qid)!.push(tsId);
  }
  const qids = [...byQid.keys()];
  console.log("qid 보유 선수:", pairs.length, "| 고유 qid:", qids.length);

  const out: Record<string, string> = {};
  const unknownVals = new Map<string, number>();
  for (let i = 0; i < qids.length; i += 50) {
    const chunk = qids.slice(i, i + 50);
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${chunk.join("|")}&props=claims&format=json`;
    const res = await fetch(url, { headers: UA });
    if (!res.ok) { console.warn("HTTP", res.status, "— 5s 대기 후 재시도"); await sleep(5000); i -= 50; continue; }
    const d = (await res.json()) as WbResp;
    for (const [qid, e] of Object.entries(d.entities ?? {})) {
      const valQid = e.claims?.P8006?.[0]?.mainsnak?.datavalue?.value?.id;
      if (!valQid) continue;
      const foot = FOOT_BY_QID[valQid];
      if (!foot) { unknownVals.set(valQid, (unknownVals.get(valQid) ?? 0) + 1); continue; }
      for (const tsId of byQid.get(qid) ?? []) out[tsId] = foot;
    }
    process.stdout.write(`\r${Math.min(i + 50, qids.length)}/${qids.length}`);
    await sleep(300);
  }
  console.log("\n주발 확보:", Object.keys(out).length, "명");
  if (unknownVals.size) console.log("미매핑 값 QID:", [...unknownVals.entries()]);
  fs.writeFileSync("data/player-foot.json", JSON.stringify(out, null, 0) + "\n");
  console.log("→ data/player-foot.json");
}

main();
