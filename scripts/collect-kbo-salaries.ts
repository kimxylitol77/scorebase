// KBO 전 선수 연봉 수집 — 팀별 전체 명단 → 공식 프로필 → data/kbo-salaries.json 커밋용.
//
// KBO 연봉은 연 1회(1~3월) 발표 후 시즌 내내 불변 → cron 이 아니라 사람이 연 1회 실행하고 결과를 커밋한다.
// 실행: npx tsx scripts/collect-kbo-salaries.ts   (약 700건 요청, 5~8분)
//
// 명단 소스 = /Player/Search.aspx (팀 선택 POST + 페이저).
//   기록 페이지 인덱스(PitcherBasic/HitterBasic)를 쓰지 않는 이유 — 그쪽은 "시즌 출장 기록이 있는 선수"만이라
//   부상·재활로 결장 중인 고액 연봉자(김광현 15억 등)가 통째로 빠진다. Search 는 퓨처스 포함 전원.
//
// ⚠️ 외국인 선수는 달러 공시("700000달러") → 통화가 달라 원화와 한 랭킹에 못 섞는다. `foreign` 배열로 분리 저장.

import { writeFileSync } from "fs";
import { resolve } from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { fetchKboPitcherProfile } from "../src/lib/sports/kbo-official";

const BASE = "https://www.koreabaseball.com";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15",
  Accept: "text/html,application/xhtml+xml",
};
const P = "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$";
// Search.aspx ddlTeam 값 → 표시 팀명
const TEAMS: Record<string, string> = {
  SS: "삼성", KT: "KT", LG: "LG", HT: "KIA", OB: "두산",
  HH: "한화", NC: "NC", LT: "롯데", SK: "SSG", WO: "키움",
};

interface RosterEntry {
  kboId: string;
  playerName: string;
  teamName: string;
  position: string; // 투수 | 포수 | 내야수 | 외야수
  birthday?: string; // "YYYY-MM-DD"
}

interface CollectedSalary extends RosterEntry {
  salary: number; // 국내=만원 / 외국인=달러
  signingBonus?: number; // 같은 통화
  draft?: string; // "22 한화 2차 1라운드 1순위" (외국인은 "24 한화 자유선발")
}

/** ASP.NET hidden state */
function hidden($: cheerio.CheerioAPI) {
  return {
    __VIEWSTATE: $('input[name="__VIEWSTATE"]').attr("value") ?? "",
    __VIEWSTATEGENERATOR: $('input[name="__VIEWSTATEGENERATOR"]').attr("value") ?? "",
    __EVENTVALIDATION: $('input[name="__EVENTVALIDATION"]').attr("value") ?? "",
  };
}

/** 명단 표 파싱 — 등번호|선수명|팀명|포지션|생년월일|체격|출신교, playerId 링크 있는 행만. */
function parseRoster($: cheerio.CheerioAPI, teamName: string): RosterEntry[] {
  const out: RosterEntry[] = [];
  $("table tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    const href = $(tr).find("a[href*='playerId=']").first().attr("href") ?? "";
    const m = href.match(/playerId=(\d+)/);
    if (!m || tds.length < 5) return;
    const birthday = tds.eq(4).text().trim();
    out.push({
      kboId: m[1],
      playerName: tds.eq(1).text().trim(),
      // 표의 팀명 컬럼은 2군 연고지를 주기도 한다(키움 2군 = "고양") → 조회한 구단명으로 고정.
      teamName,
      position: tds.eq(3).text().trim(),
      birthday: /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? birthday : undefined,
    });
  });
  return out;
}

/** 한 팀 전체 명단 — ddlTeam POST 후 페이저 버튼을 끝까지 순회. */
async function fetchTeamRoster(teamCode: string): Promise<RosterEntry[]> {
  const url = `${BASE}/Player/Search.aspx`;
  const teamName = TEAMS[teamCode];
  const getRes = await axios.get<string>(url, { headers: HEADERS, timeout: 15000, responseType: "text" });
  const cookie = (getRes.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]).join("; ");
  const post = async (target: string, state: Record<string, string>, page: string) => {
    const body = new URLSearchParams({
      __EVENTTARGET: target,
      __EVENTARGUMENT: "",
      __LASTFOCUS: "",
      ...state,
      [`${P}ddlTeam`]: teamCode,
      [`${P}ddlPosition`]: "",
      [`${P}txtSearchPlayerName`]: "",
      [`${P}hfPage`]: page,
    });
    const r = await axios.post<string>(url, body.toString(), {
      headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded", Referer: url, Origin: BASE, Cookie: cookie },
      timeout: 15000,
      responseType: "text",
    });
    return cheerio.load(r.data);
  };

  let $ = await post(`${P}ddlTeam`, hidden(cheerio.load(getRes.data)), "1");
  const merged = new Map<string, RosterEntry>();
  for (const e of parseRoster($, teamName)) merged.set(e.kboId, e);

  // 페이저에 노출된 번호 버튼(btnNo2, btnNo3…)을 순차 클릭. 직전 응답의 viewstate 를 그대로 이어써야 한다.
  const pageNos = [
    ...new Set(
      $("a[href*='ucPager$btnNo']")
        .map((_, a) => ($(a).attr("href") ?? "").match(/btnNo(\d+)/)?.[1])
        .get()
        .filter((n): n is string => Boolean(n)),
    ),
  ].filter((n) => n !== "1");
  for (const no of pageNos) {
    $ = await post(`${P}ucPager$btnNo${no}`, hidden($), no);
    for (const e of parseRoster($, teamName)) merged.set(e.kboId, e);
  }
  return [...merged.values()];
}

/** "3600만원" → {만원, KRW} · "700000달러" → {달러, USD}. 형식이 다르면 null. */
function parseSalary(v: string | undefined): { amount: number; currency: "KRW" | "USD" } | null {
  if (!v) return null;
  const s = v.replace(/[,\s]/g, "");
  const krw = s.match(/^(\d+)만원$/);
  if (krw) return { amount: Number(krw[1]), currency: "KRW" };
  const usd = s.match(/^(\d+)달러$/);
  if (usd) return { amount: Number(usd[1]), currency: "USD" };
  return null;
}

/** 동시성 제한 map — KBO 서버 부담 회피. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function main() {
  console.log("[kbo-salaries] 팀별 전체 명단 수집 중...");
  const roster = new Map<string, RosterEntry>();
  for (const code of Object.keys(TEAMS)) {
    try {
      const list = await fetchTeamRoster(code);
      for (const e of list) roster.set(e.kboId, e);
      console.log(`  ${TEAMS[code]} ${list.length}명`);
    } catch (e) {
      console.warn(`  ${TEAMS[code]} 실패: ${(e as Error).message}`);
    }
  }
  const entries = [...roster.values()];
  console.log(`[kbo-salaries] 명단 ${entries.length}명 — 프로필 수집 시작`);

  let done = 0, missing = 0;
  const collected = await mapLimit(entries, 4, async (e) => {
    const p = await fetchKboPitcherProfile(e.kboId); // .player_basic 은 투수/타자/퓨처스 동일 구조
    done++;
    if (done % 100 === 0) console.log(`  ${done}/${entries.length}`);
    const parsed = parseSalary(p.salary);
    if (!parsed) {
      missing++;
      return null;
    }
    const row: CollectedSalary = { ...e, salary: parsed.amount, draft: p.draft };
    // 계약금은 연봉과 같은 통화로 공시된다 — 통화가 어긋나면 섞지 않고 버린다.
    const bonus = parseSalary(p.signingBonus);
    if (bonus && bonus.currency === parsed.currency) row.signingBonus = bonus.amount;
    return { row, currency: parsed.currency };
  });

  const byCurrency = (c: "KRW" | "USD") =>
    collected
      .filter((x): x is { row: CollectedSalary; currency: "KRW" | "USD" } => x != null && x.currency === c)
      .map((x) => x.row)
      .sort((a, b) => b.salary - a.salary || a.playerName.localeCompare(b.playerName));

  const rows = byCurrency("KRW");
  const foreign = byCurrency("USD");

  console.log(`[kbo-salaries] 국내 ${rows.length}명 · 외국인(달러) ${foreign.length}명 · 연봉 미표기 ${missing}명`);
  console.log("[kbo-salaries] 국내 TOP 5:");
  rows.slice(0, 5).forEach((r, i) =>
    console.log(`  ${i + 1}. ${r.playerName} (${r.teamName}) ${r.salary.toLocaleString()}만원`),
  );
  console.log("[kbo-salaries] 외국인 TOP 5:");
  foreign.slice(0, 5).forEach((r, i) =>
    console.log(`  ${i + 1}. ${r.playerName} (${r.teamName}) $${r.salary.toLocaleString()}`),
  );

  const out = resolve(process.cwd(), "data/kbo-salaries.json");
  writeFileSync(
    out,
    JSON.stringify(
      {
        season: String(new Date().getFullYear()),
        collectedAt: new Date().toISOString().slice(0, 10),
        players: rows,
        foreign,
      },
      null,
      1,
    ),
  );
  console.log(`[kbo-salaries] 저장: ${out} (국내 ${rows.length} · 외국인 ${foreign.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
