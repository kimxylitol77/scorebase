// NPB 한자 이름+구단 → npb.jp 선수 id 사전 — 시즌 성적(BaseballPlayerSeasonStats, id 없음)에 사진·상세 링크·경기 로그를 붙이는 키.
// 12팀 로스터(rst_*.html)를 읽어 data/npb-name-ids.json 으로 저장. 실행: npx tsx --env-file=.env.local scripts/build-npb-name-ids.ts (주간)
import fs from "node:fs";
import { fetchNpbRoster } from "../src/lib/sports/npb-official";

const OUT = "data/npb-name-ids.json";
// 로스터의 한국 풀네임 → 시즌 성적 테이블의 짧은 구단명
const SHORT = ["요미우리", "한신", "요코하마", "히로시마", "주니치", "야쿠르트", "소프트뱅크", "닛폰햄", "롯데", "오릭스", "라쿠텐", "세이부"];
export const npbNameKey = (team: string, kanji: string) => `${team}|${kanji.replace(/[\s　*]/g, "")}`;

async function main() {
  const roster = await fetchNpbRoster();
  const out: Record<string, string> = {};
  let dup = 0;
  for (const r of roster) {
    const short = SHORT.find((s) => r.teamKor.includes(s));
    if (!short) { console.warn("구단 약칭 미해석:", r.teamKor); continue; }
    const k = npbNameKey(short, r.fullName);
    if (out[k] && out[k] !== r.pid) { dup++; continue; } // 같은 구단 동명이인 — 먼저 온 것 유지(드묾)
    out[k] = r.pid;
  }
  if (Object.keys(out).length < 600) throw new Error(`전멸 가드: ${Object.keys(out).length}명 — 로스터 페이지 이상 의심, 파일 유지`);
  fs.writeFileSync(OUT, JSON.stringify({ meta: { updatedAt: new Date().toISOString(), count: Object.keys(out).length }, ids: out }));
  console.log(`저장 ${Object.keys(out).length}명 (로스터 ${roster.length}, 동명 충돌 ${dup}) → ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
