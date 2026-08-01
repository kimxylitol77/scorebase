// FIFA 남자 랭킹 자동 갱신 — TheSports ranking/fifa/men → src/lib/sports/fifa-rankings.json.
//
//   npm run refresh:fifa-rankings              # dry-run (기본)
//   npm run refresh:fifa-rankings -- --write   # 파일 기록
//
// 왜 정적 JSON 을 갱신하나 (DB 캐시가 아니라).
//   getFifaRank/fifaFlag/fifaCountryKo 소비처가 26개 파일(동기 lib·클라이언트 포함)이라
//   전부 DB 조회로 바꾸는 건 회귀 위험이 크다. JSON 을 봇이 갱신·push 하면 push 가 곧
//   재배포라 페이지·메타데이터·매치 카드 칩까지 한 번에 최신이 된다 (repo 확립 패턴 —
//   weekly-static-refresh 의 data/*.json 과 동일 원리).
//
// 안전선: ① 200개국 미만이면 중단 ② 기존 표기로 못 옮긴 이름 5% 초과 시 중단
//        ③ 발표일이 현재 파일보다 과거면 중단(역행 방지) ④ dry-run 기본.
//
// ⚠ TheSports IP whitelist 필요 (맥미니·맥북 등록됨).

import { readFileSync, writeFileSync } from "fs";
import path from "path";

const JSON_FILE = path.join(process.cwd(), "src/lib/sports/fifa-rankings.json");
const META_FILE = path.join(process.cwd(), "src/lib/sports/fifa-rankings-meta.json");

// TheSports 국가명 → 기존 FIFA 공식 표기 (fifaCountryKo/fifaFlag 사전 키와 일치시킨다).
// 2026-08-01 실측 211개국 중 19개 불일치 전수 대조로 확정.
const NAME_ALIASES: Record<string, string> = {
  "Turkiye": "Turkey",
  "Cote d'Ivoire": "Côte d'Ivoire",
  "South Korea": "Korea Republic",
  "North Korea": "Korea DPR",
  "Democratic Republic of the Congo": "Congo DR",
  "Ireland": "Republic of Ireland",
  "Curacao": "Curaçao",
  "China": "China PR",
  "Kyrgyzstan": "Kyrgyz Republic",
  "Gambia": "The Gambia",
  "Guinea Bissau": "Guinea-Bissau",
  "Republic of the Congo": "Congo",
  "Saint Kitts and Nevis": "St Kitts and Nevis",
  "Hong Kong": "Hong Kong, China",
  "Saint Lucia": "St Lucia",
  "Saint Vincent and the Grenadines": "St Vincent and the Grenadines",
  "Macau of China": "Macau",
  "Sao Tome and Principe": "São Tomé and Príncipe",
  "Timor Leste": "Timor-Leste",
  "Guam Island": "Guam",
};

const write = process.argv.includes("--write");

async function main() {
  const user = process.env.THESPORTS_USER;
  const secret = process.env.THESPORTS_SECRET;
  if (!user || !secret) throw new Error("THESPORTS_USER / THESPORTS_SECRET 미설정");

  const u = new URL("https://api.thesports.com/v1/football/ranking/fifa/men");
  u.searchParams.set("user", user);
  u.searchParams.set("secret", secret);
  const d = (await (await fetch(u, { signal: AbortSignal.timeout(20000) })).json()) as {
    code: number;
    results?: { pub_time?: number; items?: Array<{ ranking: number; team?: { name?: string } }> };
  };
  if (d.code !== 0) throw new Error(`ts code=${d.code}`);
  const items = d.results?.items ?? [];
  const pubDate = d.results?.pub_time
    ? new Date(d.results.pub_time * 1000).toISOString().slice(0, 10)
    : null;
  if (!pubDate) throw new Error("pub_time 없음");

  const current = JSON.parse(readFileSync(JSON_FILE, "utf-8")) as Array<{ rank: number; name: string }>;
  const knownNames = new Set(current.map((r) => r.name));
  let curDate = "0000-00-00";
  try {
    curDate = (JSON.parse(readFileSync(META_FILE, "utf-8")) as { pubDate: string }).pubDate;
  } catch { /* meta 파일 도입 전 — 첫 실행 */ }

  const next = items
    .map((i) => ({ rank: i.ranking, name: NAME_ALIASES[i.team?.name ?? ""] ?? i.team?.name ?? "" }))
    .filter((r) => r.name && r.rank > 0)
    .sort((a, b) => a.rank - b.rank);

  const unknown = next.filter((r) => !knownNames.has(r.name)).map((r) => r.name);
  console.log(`발표 ${pubDate} (현재 파일 ${curDate}) · ${next.length}개국 · 미확인 표기 ${unknown.length}건`);
  if (unknown.length > 0) console.log("  미확인:", unknown.slice(0, 10).join(", "));

  // ── 가드 ──
  if (next.length < 200) throw new Error(`국가 수 비정상 ${next.length} — 중단`);
  if (unknown.length > next.length * 0.05)
    throw new Error(`미확인 표기 ${unknown.length}건(5% 초과) — 별칭 사전 보강 필요, 중단`);
  if (pubDate < curDate) throw new Error(`발표일 역행 ${curDate} → ${pubDate} — 중단`);
  if (pubDate === curDate) {
    console.log("발표일 동일 — 갱신할 것 없음");
    return;
  }

  const korea = next.find((r) => r.name === "Korea Republic");
  console.log(
    `1위 ${next[0]?.name} · 대한민국 ${korea?.rank ?? "?"}위 · ${curDate} → ${pubDate}`,
  );

  if (!write) {
    console.log("\nDRY-RUN — 기록하려면 --write");
    return;
  }
  writeFileSync(JSON_FILE, JSON.stringify(next, null, 2) + "\n", "utf-8");
  writeFileSync(META_FILE, JSON.stringify({ pubDate }, null, 2) + "\n", "utf-8");
  console.log(`갱신 완료 — ${JSON_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
