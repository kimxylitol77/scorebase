// KBO 풀 — 공식 기록실(koreabaseball.com BasicOld) 1982~. ASP.NET 폼이라 시즌→포지션/팀 순으로 postback 한다.
//   타자는 포지션 필터(포수·내야수·외야수)로, 투수는 팀 필터로 전원을 받는다.
import * as cheerio from "cheerio";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pctRanks, round1, sleep, standardizeFame, zscores, type Built } from "./common";
import type { PoolCard, PoolTeam, Pos } from "../../src/lib/draft/types";

const BASE = "https://www.koreabaseball.com";
const P = "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15", Accept: "text/html,application/xhtml+xml" };
const CACHE = join(tmpdir(), "draft-pool-cache", "kbo");
mkdirSync(CACHE, { recursive: true });
const FIRST = Number(process.env.KBO_FIRST ?? 1982);
const LAST = Number(process.env.KBO_LAST ?? new Date().getFullYear());
const SCALE = 2.2;

// [계보 키, 현재 이름, 그 계보의 역대 팀명(기록실 표기), 팀 색]
const FRANCHISES: Array<[string, string, string[], string]> = [
  ["SS", "삼성 라이온즈", ["삼성"], "#074CA1"],
  ["LT", "롯데 자이언츠", ["롯데"], "#041E42"],
  ["HT", "KIA 타이거즈", ["KIA", "해태"], "#EA0029"],
  ["OB", "두산 베어스", ["두산", "OB"], "#131230"],
  ["LG", "LG 트윈스", ["LG", "MBC"], "#C30452"],
  ["HH", "한화 이글스", ["한화", "빙그레"], "#FF6600"],
  ["SK", "SSG 랜더스", ["SSG", "SK"], "#CE0E2D"],
  ["WO", "키움 히어로즈", ["키움", "넥센", "히어로즈", "우리"], "#570514"],
  ["NC", "NC 다이노스", ["NC"], "#315288"],
  ["KT", "KT 위즈", ["KT", "kt"], "#000000"],
  ["HD", "현대 유니콘스", ["현대", "태평양", "청보", "삼미"], "#006A4E"],
  ["SB", "쌍방울 레이더스", ["쌍방울"], "#1C3F94"],
];
const franchiseOf = new Map<string, string>();
for (const [key, , names] of FRANCHISES) for (const n of names) franchiseOf.set(n, key);

interface Row {
  cells: Record<string, string>;
  pid: string;
  name: string;
  team: string;
}

function hidden(html: string) {
  const $ = cheerio.load(html);
  return {
    __VIEWSTATE: $('input[name="__VIEWSTATE"]').attr("value") ?? "",
    __VIEWSTATEGENERATOR: $('input[name="__VIEWSTATEGENERATOR"]').attr("value") ?? "",
    __EVENTVALIDATION: $('input[name="__EVENTVALIDATION"]').attr("value") ?? "",
  };
}

function parse(html: string): Row[] {
  const $ = cheerio.load(html);
  const table = $("table").filter((_, t) => $(t).find("th").text().includes("선수명")).first();
  const headers = table.find("thead th, tr:first-child th").map((_, th) => $(th).text().trim()).get();
  const rows: Row[] = [];
  table.find("tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    const cells: Record<string, string> = {};
    tds.each((i, td) => {
      if (headers[i]) cells[headers[i]] = $(td).text().trim();
    });
    const m = ($(tr).find("a[href*='playerId=']").attr("href") ?? "").match(/playerId=(\d+)/);
    if (m && cells["선수명"]) rows.push({ cells, pid: m[1], name: cells["선수명"], team: cells["팀명"] ?? "" });
  });
  return rows;
}

/** 한 시즌의 기록 페이지 세션 — 시즌을 고른 뒤 필터(팀·포지션)를 바꿔 가며 표를 받는다 */
class Session {
  private cookie = "";
  private html = "";
  constructor(private url: string, private season: number, private orderCol: string, private order: string, private hasPos: boolean) {}

  private fields(team: string, pos: string, page: number): Record<string, string> {
    return {
      [`${P}ddlSeason$ddlSeason`]: String(this.season),
      [`${P}ddlSeries$ddlSeries`]: "0",
      [`${P}ddlTeam$ddlTeam`]: team,
      ...(this.hasPos ? { [`${P}ddlPos$ddlPos`]: pos } : {}),
      [`${P}hfPage`]: String(page),
      [`${P}hfOrderByCol`]: this.orderCol,
      [`${P}hfOrderBy`]: this.order,
    };
  }

  private async post(target: string, fields: Record<string, string>): Promise<string> {
    for (let i = 0; ; i++) {
      try {
        const body = new URLSearchParams({ __EVENTTARGET: target, __EVENTARGUMENT: "", __LASTFOCUS: "", ...hidden(this.html), ...fields });
        const r = await fetch(this.url, {
          method: "POST",
          headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded", Referer: this.url, Origin: BASE, Cookie: this.cookie },
          body: body.toString(),
          signal: AbortSignal.timeout(30_000),
        });
        if (!r.ok) throw new Error(`${r.status} ${this.url}`);
        this.html = await r.text();
        await sleep(450);
        return this.html;
      } catch (e) {
        if (i >= 2) throw e;
        await sleep(2000);
      }
    }
  }

  async open(): Promise<string[]> {
    const r = await fetch(this.url, { headers: UA, signal: AbortSignal.timeout(30_000) });
    this.cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    this.html = await r.text();
    await this.post(`${P}ddlSeason$ddlSeason`, this.fields("", "", 1));
    const $ = cheerio.load(this.html);
    return $('select[name$="ddlTeam"] option').map((_, o) => $(o).attr("value") ?? "").get().filter(Boolean);
  }

  /** 필터 하나를 고르고 모든 쪽을 받는다 */
  async table(target: "ddlTeam" | "ddlPos", team: string, pos: string): Promise<Row[]> {
    let html = await this.post(`${P}${target}$${target}`, this.fields(team, pos, 1));
    const rows = parse(html);
    for (let n = 2; n <= 8; n++) {
      if (!cheerio.load(html)(`[id$="ucPager_btnNo${n}"]`).length) break;
      html = await this.post(`${P}ucPager$btnNo${n}`, this.fields(team, pos, n));
      rows.push(...parse(html));
    }
    return rows;
  }
}

interface SeasonData {
  hitters: Array<Row & { pos: string }>;
  pitchers: Row[];
}

async function fetchSeason(y: number): Promise<SeasonData> {
  const file = join(CACHE, `${y}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as SeasonData;
  const hit = new Session(`${BASE}/Record/Player/HitterBasic/BasicOld.aspx`, y, "HRA_RT", "DESC", true);
  await hit.open();
  const hitters: SeasonData["hitters"] = [];
  for (const [code, pos] of [["2", "C"], ["3,4,5,6", "IF"], ["7,8,9", "OF"]] as const) {
    for (const r of await hit.table("ddlPos", "", code)) hitters.push({ ...r, pos });
  }
  const pit = new Session(`${BASE}/Record/Player/PitcherBasic/BasicOld.aspx`, y, "ERA_RT", "ASC", false);
  const teams = await pit.open();
  const pitchers: Row[] = [];
  for (const t of teams) pitchers.push(...(await pit.table("ddlTeam", t, "")));
  const data = { hitters, pitchers };
  // 빈 응답을 캐시에 굳히지 않는다 (진행 중 시즌은 매번 다시 받도록 올해는 저장 안 함)
  if (hitters.length >= 15 && pitchers.length >= 30 && y < new Date().getFullYear()) writeFileSync(file, JSON.stringify(data));
  return data;
}

const n = (v: string | undefined) => Number(v) || 0;
/** "183 1/3" · "183" · "2/3" */
const innings = (v: string | undefined) => {
  const m = (v ?? "").trim().match(/^(\d+)?\s*(?:(\d)\/3)?$/);
  return m ? Number(m[1] ?? 0) + Number(m[2] ?? 0) / 3 : 0;
};
const photo = (pid: string) => `https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/person/middle/${new Date().getFullYear()}/${pid}.jpg`;

export async function buildKbo(): Promise<Built> {
  const teams: PoolTeam[] = FRANCHISES.map(([key, name, , color]) => ({ key, name, logo: null, color }));
  const cards: PoolCard[] = [];
  const unknownTeams = new Set<string>();
  let lastWithData = FIRST;

  for (let y = FIRST; y <= LAST; y++) {
    const { hitters, pitchers } = await fetchSeason(y);
    if (hitters.length < 15 || pitchers.length < 30) {
      console.log(`KBO ${y}: 타자 ${hitters.length} 투수 ${pitchers.length} — 건너뜀`);
      continue;
    }
    lastWithData = y;
    const teamOf = (r: Row) => {
      const k = franchiseOf.get(r.team);
      if (!k) unknownTeams.add(r.team);
      return k;
    };

    // ── 타자 (시즌 최다 타석의 40% 이상) — 포지션 묶음 안에서 비교
    const woba = (c: Row["cells"]) => {
      const single = n(c.H) - n(c["2B"]) - n(c["3B"]) - n(c.HR);
      return (0.69 * n(c.BB) + 0.72 * n(c.HBP) + 0.89 * single + 1.27 * n(c["2B"]) + 1.62 * n(c["3B"]) + 2.1 * n(c.HR)) / (n(c.PA) || 1);
    };
    const maxPa = Math.max(...hitters.map((h) => n(h.cells.PA)));
    const hq = hitters.filter((h) => n(h.cells.PA) >= maxPa * 0.4 && teamOf(h));
    const lg = hq.reduce((a, h) => a + woba(h.cells) * n(h.cells.PA), 0) / hq.reduce((a, h) => a + n(h.cells.PA), 0);
    for (const g of ["C", "IF", "OF"]) {
      const grp = hq.filter((h) => h.pos === g);
      // 포수는 시즌당 규정타석이 몇 명뿐이라 그 안에서 표준화하면 값이 튄다 — 전체 타자 분포의 표준편차를 쓴다
      const all = hq.map((h) => ((woba(h.cells) - lg) / 1.2) * n(h.cells.PA));
      const sd = Math.sqrt(all.reduce((a, v) => a + v * v, 0) / all.length) || 1;
      const vals = grp.map((h) => ((woba(h.cells) - lg) / 1.2) * n(h.cells.PA) + 0.2 * n(h.cells.SB) - 0.4 * n(h.cells.CS));
      const mean = vals.reduce((a, v) => a + v, 0) / (vals.length || 1);
      const dur = pctRanks(grp.map((h) => n(h.cells.PA)));
      grp.forEach((h, i) => {
        const z = (vals[i] - (grp.length >= 8 ? mean : 0)) / sd;
        if (z < 0) return;
        const c = h.cells;
        cards.push({
          id: `${h.pid}-${y}`,
          pid: h.pid,
          name: h.name,
          season: y,
          team: teamOf(h)!,
          teamName: h.team,
          pos: [g as Pos],
          off: round1(z * SCALE),
          def: 0,
          dur: dur[i],
          line: `타율 ${c.AVG} · ${n(c.HR)}홈런 · ${n(c.RBI)}타점 · ${n(c.SB)}도루`,
          fame: n(c.HR) + 0.3 * n(c.RBI) + 150 * n(c.AVG) + 0.2 * n(c.SB),
          photo: photo(h.pid),
        });
      });
    }

    // ── 투수 (팀별 전원) — 기록실에 선발 등판 수가 없어 경기당 이닝으로 선발·불펜을 가른다
    const arms = pitchers.map((r) => ({ r, ip: innings(r.cells.IP), g: n(r.cells.G) })).filter((a) => a.ip > 0 && a.g > 0 && teamOf(a.r));
    const fipRaw = (c: Row["cells"], ip: number) => (13 * n(c.HR) + 3 * (n(c.BB) + n(c.HBP)) - 2 * n(c.SO)) / ip;
    const totIp = arms.reduce((a, x) => a + x.ip, 0);
    const lgEra = (arms.reduce((a, x) => a + n(x.r.cells.ER), 0) * 9) / totIp;
    const fipConst = lgEra - arms.reduce((a, x) => a + fipRaw(x.r.cells, x.ip) * x.ip, 0) / totIp;
    for (const role of ["SP", "RP"] as const) {
      const pool = arms.filter((a) => (role === "SP") === a.ip / a.g >= 3.5);
      const maxIp = Math.max(...pool.map((a) => a.ip));
      const grp = pool.filter((a) => a.ip >= maxIp * 0.4);
      const val = grp.map((a) => {
        const era = (n(a.r.cells.ER) * 9) / a.ip;
        return ((lgEra - (0.5 * era + 0.5 * (fipRaw(a.r.cells, a.ip) + fipConst))) / 9) * a.ip * (role === "RP" ? 1.6 : 1);
      });
      const z = zscores(val);
      const dur = pctRanks(grp.map((a) => a.ip));
      grp.forEach((a, i) => {
        if (z[i] < 0) return;
        const c = a.r.cells;
        cards.push({
          id: `${a.r.pid}-${y}-P`,
          pid: a.r.pid,
          name: a.r.name,
          season: y,
          team: teamOf(a.r)!,
          teamName: a.r.team,
          pos: [role],
          off: 0,
          def: round1(z[i] * SCALE),
          dur: dur[i],
          line:
            role === "SP"
              ? `${n(c.W)}승 ${n(c.L)}패 · 평균자책 ${c.ERA} · ${n(c.SO)}탈삼진`
              : `${n(c.SV)}세이브 ${n(c.HLD)}홀드 · 평균자책 ${c.ERA} · ${n(c.SO)}탈삼진`,
          fame: role === "SP" ? 2 * n(c.W) + 0.05 * n(c.SO) - 3 * n(c.ERA) : n(c.SV) + 0.5 * n(c.HLD) + 0.05 * n(c.SO) - 3 * n(c.ERA),
          photo: photo(a.r.pid),
        });
      });
    }
    console.log(`KBO ${y}: 타자 ${hitters.length} 투수 ${pitchers.length} → 누적 카드 ${cards.length}`);
  }
  if (unknownTeams.size) console.warn("계보 미등록 팀명:", [...unknownTeams].join(", "));
  standardizeFame(cards, (c) => c.pos[0]);
  return { teams, cards, seasons: [FIRST, lastWithData] };
}
