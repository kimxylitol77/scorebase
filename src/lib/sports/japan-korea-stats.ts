// 일본 야구(NPB 2군·BC리그 독립리그) 한국 선수 시즌 성적 — npb.jp 팀별 2군 성적표·bc-l-data.jp 팀 페이지를 런타임 6h 캐시로 파싱.
// 명단은 data/baseball-korea-manual.json 의 stats 소스로 지정한다. 원천 실패·선수 미등장이면 그 줄만 빠진다.

export type JapanStatSource =
  | { src: "npb-farm"; team: string; label: string } // npb.jp/bis/{season}/stats/idb2_{team}.html (투수는 idp2_)
  | { src: "bcl"; team: number; id: number; label: string }; // bc-l-data.jp/teams/{team} 공식전 표, 선수 id 로 매칭

export interface JapanStatLine { label: string; text: string }

const UA = { "user-agent": "Mozilla/5.0 (compatible; scorebase)" };
async function getText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { next: { revalidate: 6 * 3600 }, headers: UA });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

type Row = Record<string, string>;
const clean = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, "").replace(/　/g, "");

/** npb.jp 성적표 — 헤더 행 기준으로 선수 이름(공백·좌타 * 제거) 행을 찾는다. */
export function parseNpbStatsTable(html: string, nameJa: string): Row | null {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => clean(c[1])));
  const head = rows.find((r) => r[0] === "選手");
  const want = nameJa.replace(/[\s　*+]/g, "");
  const hit = rows.find((r) => r[0]?.replace(/[*+]/g, "") === want);
  if (!head || !hit) return null;
  return Object.fromEntries(head.map((h, i) => [h, hit[i] ?? ""]));
}

/** bc-l-data.jp 팀 페이지 — Google Charts arrayToDataTable 의 dataN 블록(1=타자·2=투수 공식전)에서 선수 id 행. */
export function parseBclTeamTable(html: string, block: "data1" | "data2", playerId: number): Row | null {
  const m = html.match(new RegExp(`var ${block} = google\\.visualization\\.arrayToDataTable\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!m) return null;
  const lines = m[1].split(/\n\s*(?=\[)/).map((s) => s.trim().replace(/,$/, "")).filter(Boolean);
  const toCells = (s: string): string[] | null => {
    const json = s
      .replace(/\{v:[^,]*,f:"([^"]*)"\}/g, '"$1"')
      .replace(/'<a href="[^"]*\/players\/(\d+)\/\d+">[^<]*<\/a>'/g, '"$1"');
    try { return (JSON.parse(json) as unknown[]).map(String); } catch { return null; }
  };
  const head = toCells(lines[0]);
  const hit = lines.slice(1).map(toCells).find((c) => c?.[1] === String(playerId));
  if (!head || !hit) return null;
  return Object.fromEntries(head.map((h, i) => [h.replace(/\s|　/g, ""), hit[i] ?? ""]));
}

const num = (x: string | undefined) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const rate = (x: string | undefined) => (x && x !== "-" ? x : "-");
const ops = (obp: string | undefined, slg: string | undefined) => {
  const v = num(obp) + num(slg);
  return obp && slg ? (v >= 1 ? v.toFixed(3) : v.toFixed(3).slice(1)) : "-";
};

export function formatBat(g: number, avg: string, hr: number, rbi: number, opsV: string): string {
  return `${g}경기 · 타율 ${avg} · ${hr}홈런 ${rbi}타점 · OPS ${opsV}`;
}
export function formatPit(g: number, w: number, l: number, sv: number, era: string, ip: string, so: number): string {
  return `${g}경기 ${w}승 ${l}패${sv ? ` ${sv}세` : ""} · ERA ${era} · ${ip}이닝 ${so}K`;
}

async function lineOf(s: JapanStatSource, nameJa: string, pitcher: boolean, season: number): Promise<JapanStatLine | null> {
  if (s.src === "npb-farm") {
    const html = await getText(`https://npb.jp/bis/${season}/stats/id${pitcher ? "p" : "b"}2_${s.team}.html`);
    const r = html ? parseNpbStatsTable(html, nameJa) : null;
    if (!r) return null;
    const text = pitcher
      ? formatPit(num(r["登板"]), num(r["勝利"]), num(r["敗北"]), num(r["セーブ"]), rate(r["防御率"]), r["投球回"] || "0", num(r["三振"]))
      : formatBat(num(r["試合"]), rate(r["打率"]), num(r["本塁打"]), num(r["打点"]), ops(r["出塁率"], r["長打率"]));
    return { label: s.label, text };
  }
  const html = await getText(`https://bc-l-data.jp/teams/${s.team}`);
  const r = html ? parseBclTeamTable(html, pitcher ? "data2" : "data1", s.id) : null;
  if (!r) return null;
  const text = pitcher
    ? formatPit(num(r["試合"]), num(r["勝"]), num(r["負"]), num(r["セーブ"]), rate(r["防御率"]), r["投球回数"] || "0", num(r["奪三振"]))
    : formatBat(num(r["試合数"]), rate(r["打率"]), num(r["本塁打"]), num(r["打点"]), rate(r["OPS"]));
  return { label: s.label, text };
}

/** 선수 1명의 소스별 성적 줄 — 실패한 소스는 조용히 빠진다(페이지는 "기록 없음"으로 표시). */
export async function getJapanStatLines(sources: JapanStatSource[], nameJa: string, pitcher: boolean, season: number): Promise<JapanStatLine[]> {
  const lines = await Promise.all(sources.map((s) => lineOf(s, nameJa, pitcher, season)));
  return lines.filter((x): x is JapanStatLine => x != null);
}
