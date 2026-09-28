// NPB 경기 라인업 — npb.jp 박스스코어(선발 타순·수비 위치)와 벤치 입성 명단(roster.html: 등번호·투타)으로 네이버형 2열 라인업 데이터를 만든다.
// npb.jp 는 경기 전 스타팅 멤버를 주지 않아(9/28 경기 전 실측) 발표 전에는 팀별 직전 경기 선발 타순을 예상 라인업으로 쓴다.
import { unstable_cache } from "next/cache";
import * as cheerio from "cheerio";
import { NPB_TEAMS } from "@/lib/sports/npb-official";
import { fetchNpbScheduleLinks } from "@/lib/sports/npb-box";
import { npbPlayerKo, npbPlayerPhoto } from "@/lib/sports/npb-player-ko";
import { shortDate, type GameLineup, type LineupPlayer, type TeamLineup } from "@/lib/sports/baseball-lineup";

const BASE = "https://npb.jp";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15";

// box.html h4 · roster.html h5 의 일본어 팀 정식명 → 팀 코드 (경로 /scores/{Y}/{MMDD}/{home}-{away}-{n}/ 의 코드와 같다)
const JP_FULL_TO_CODE: Record<string, string> = {
  読売ジャイアンツ: "g", 阪神タイガース: "t", 横浜DeNAベイスターズ: "db", 広島東洋カープ: "c",
  中日ドラゴンズ: "d", 東京ヤクルトスワローズ: "s", 福岡ソフトバンクホークス: "h", 北海道日本ハムファイターズ: "f",
  千葉ロッテマリーンズ: "m", "オリックス・バファローズ": "b", 東北楽天ゴールデンイーグルス: "e", 埼玉西武ライオンズ: "l",
};
const POS_KO: Record<string, string> = {
  投: "투수", 捕: "포수", 一: "1루수", 二: "2루수", 三: "3루수", 遊: "유격수", 左: "좌익수", 中: "중견수", 右: "우익수", 指: "지명타자",
};
const GROUP_KO: Record<string, string> = { 投手: "투수", 捕手: "포수", 内野手: "내야수", 外野手: "외야수" };

interface Starter { pid: string; name: string; pos: string }
interface RosterEntry { pid: string; name: string; num: string; group: string; throwBat: string }

async function fetchHtml(path: string): Promise<string | null> {
  const r = await fetch(`${BASE}${path}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  return r.ok ? r.text() : null;
}

/** box.html → 팀코드별 선발 9명(타순 칸 숫자 + 수비 칸이 "(遊)" 로 시작). 경기 중 이동하면 "(中)左" 처럼 뒤에 붙는다.
 *  교체 행은 타순 칸이 비고 수비 칸에 괄호가 없다. */
async function fetchBoxStarters(gamePath: string): Promise<Map<string, Starter[]>> {
  const html = await fetchHtml(`${gamePath}box.html`);
  const out = new Map<string, Starter[]>();
  if (!html) return out;
  const $ = cheerio.load(html);
  let code: string | null = null;
  $("h4, table").each((_, el) => {
    const $el = $(el);
    if (el.type === "tag" && el.name === "h4") {
      code = JP_FULL_TO_CODE[$el.text().trim()] ?? null;
      return;
    }
    if (!code || $el.hasClass("table_inning")) return;
    const heads = $el.find("thead th").map((_, th) => $(th).text().trim()).get();
    if (!heads.includes("打数")) return;
    const list: Starter[] = [];
    $el.find("> tbody > tr").each((_, tr) => {
      const tds = $(tr).children("td");
      const order = tds.eq(0).text().trim();
      const pos = tds.eq(1).text().trim().match(/^\((.)\)/)?.[1];
      const a = $(tr).find('a[href*="/bis/players/"]').first();
      const pid = (a.attr("href") ?? "").match(/(\d+)\.html/)?.[1];
      if (/^\d$/.test(order) && pos && pid) list.push({ pid, name: a.text().trim(), pos });
    });
    if (list.length >= 9) out.set(code, list.slice(0, 9));
  });
  return out;
}

/** roster.html (ベンチ入り選手) → 팀코드별 명단. 경기 전에는 비어 있을 수 있다. */
async function fetchRoster(gamePath: string): Promise<Map<string, RosterEntry[]>> {
  const html = await fetchHtml(`${gamePath}roster.html`);
  const out = new Map<string, RosterEntry[]>();
  if (!html) return out;
  const $ = cheerio.load(html);
  $(".roster_section").each((_, sec) => {
    const code = JP_FULL_TO_CODE[$(sec).find("h5").first().text().trim()];
    if (!code) return;
    let group = "";
    const list: RosterEntry[] = [];
    $(sec).find("tr").each((_, tr) => {
      const th = $(tr).find("th").first().text().trim();
      if (th) { group = th; return; }
      const a = $(tr).find('a[href*="/bis/players/"]').first();
      const pid = (a.attr("href") ?? "").match(/(\d+)\.html/)?.[1];
      if (!pid) return;
      list.push({ pid, name: a.text().trim(), num: $(tr).find("td.num").text().trim(), group, throwBat: $(tr).find("td").last().text().trim() });
    });
    if (list.length) out.set(code, list);
  });
  return out;
}

const splitThrowBat = (s: string) => ({
  throw: s.startsWith("右投") ? "우투" : s.startsWith("左投") ? "좌투" : null,
  bat: /両打/.test(s) ? "양타" : /右打/.test(s) ? "우타" : /左打/.test(s) ? "좌타" : null,
});

/** 경로 목록에서 팀의 기준일 이전 경기들 (최근 순) */
function priorPaths(links: { path: string; mmdd: string }[], code: string, mmdd: string): string[] {
  return links
    .filter((l) => l.mmdd < mmdd && new RegExp(`/(${code})-|-(${code})-\\d+/$`).test(l.path))
    .map((l) => l.path)
    .reverse();
}

async function loadNpbGameLineup(
  homeName: string, awayName: string, startIso: string,
  starters: { home: { pid?: string; name?: string } | null; away: { pid?: string; name?: string } | null },
): Promise<GameLineup | null> {
  const hcode = NPB_TEAMS.find((t) => t.korName === homeName)?.code;
  const acode = NPB_TEAMS.find((t) => t.korName === awayName)?.code;
  if (!hcode || !acode) return null;
  const jst = new Date(new Date(startIso).getTime() + 9 * 3600_000);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth() + 1;
  const mmdd = `${String(month).padStart(2, "0")}${String(jst.getUTCDate()).padStart(2, "0")}`;
  const links = [
    ...(month > 1 ? await fetchNpbScheduleLinks(year, month - 1) : []),
    ...(await fetchNpbScheduleLinks(year, month)),
  ];
  const today = links.find((l) => l.mmdd === mmdd && l.path.includes(`/${hcode}-${acode}-`));
  if (!today) return null;

  const [todayBox, todayRoster] = await Promise.all([fetchBoxStarters(today.path), fetchRoster(today.path)]);

  // 팀별: 오늘 박스에 선발 9명이 있으면 확정, 없으면 직전 경기 박스(최근 3경기 안에서 첫 성공)
  const sideData = async (code: string) => {
    const t = todayBox.get(code);
    const r = todayRoster.get(code);
    if (t) return { starters: t, roster: r ?? [], basis: null as string | null };
    for (const p of priorPaths(links, code, mmdd).slice(0, 3)) {
      const s = (await fetchBoxStarters(p)).get(code);
      if (!s) continue;
      const pr = r ?? (await fetchRoster(p)).get(code) ?? [];
      const md = p.match(/\/\d{4}\/(\d{2})(\d{2})\//);
      return { starters: s, roster: pr, basis: md ? `${year}-${md[1]}-${md[2]}` : null };
    }
    return { starters: [] as Starter[], roster: r ?? [], basis: null };
  };
  const [hd, ad] = await Promise.all([sideData(hcode), sideData(acode)]);

  const build = (d: Awaited<ReturnType<typeof sideData>>, sp: { pid?: string; name?: string } | null): TeamLineup => {
    const byPid = new Map(d.roster.map((e) => [e.pid, e]));
    const mk = (pid: string, jpName: string, position: string, hand: string | null, order?: number): LineupPlayer => {
      const num = byPid.get(pid)?.num;
      return {
        name: npbPlayerKo(pid, jpName), position, hand, order,
        photo: npbPlayerPhoto(pid) ?? (num ? `https://p.npb.jp/players_photo/${year}/180/s/${num.padStart(3, "0")}_${pid}.jpg` : null),
        href: `/players/${pid}?league=NPB`,
      };
    };
    const spPid = sp?.pid ? String(sp.pid) : null;
    // 예상 라인업의 투수 타순(센트럴리그 DH 없음)은 어제 투수가 아니라 오늘 선발 자리다
    const batters = d.starters.map((s, i) => {
      if (d.basis != null && s.pos === "投") {
        return spPid
          ? mk(spPid, sp?.name ?? "", "투수", splitThrowBat(byPid.get(spPid)?.throwBat ?? "").bat, i + 1)
          : { name: "선발투수", position: "투수", hand: null, order: i + 1, photo: null, href: null };
      }
      return mk(s.pid, s.name, POS_KO[s.pos] ?? s.pos, splitThrowBat(byPid.get(s.pid)?.throwBat ?? "").bat, i + 1);
    });
    const inLineup = new Set(d.starters.map((s) => s.pid));
    const bench = d.roster
      .filter((e) => e.group !== "投手" && !inLineup.has(e.pid))
      .map((e) => mk(e.pid, e.name, GROUP_KO[e.group] ?? e.group, splitThrowBat(e.throwBat).bat));
    const bullpen = d.roster
      .filter((e) => e.group === "投手" && e.pid !== spPid)
      .map((e) => {
        const th = splitThrowBat(e.throwBat).throw;
        return mk(e.pid, e.name, th === "좌투" ? "좌완투수" : th === "우투" ? "우완투수" : "투수", null);
      });
    const starter = spPid ? mk(spPid, sp?.name ?? "", "선발", splitThrowBat(byPid.get(spPid)?.throwBat ?? "").throw) : null;
    return { starter, batters, bench, bullpen };
  };

  const home = build(hd, starters.home);
  const away = build(ad, starters.away);
  if (home.batters.length === 0 && away.batters.length === 0) return null;
  const confirmed = hd.basis == null && ad.basis == null;
  const bases = [...new Set([hd.basis, ad.basis].filter((b): b is string => !!b))];
  return {
    confirmed,
    note: confirmed ? "NPB 공식 · 오늘 선발" : `경기 전 · 직전 경기${bases.length === 1 ? `(${shortDate(bases[0])})` : ""} 선발 기준`,
    home, away,
  };
}

/** 우리 NPB Match(팀 한글 정식명·시작 시각·DB 선발투수) → 네이버형 라인업. 경기 전이면 confirmed=false. 10분 캐시. */
export async function getNpbGameLineup(
  homeName: string, awayName: string, startTime: Date,
  starters: { home: { pid?: string; name?: string } | null; away: { pid?: string; name?: string } | null },
): Promise<GameLineup | null> {
  return unstable_cache(loadNpbGameLineup, ["npb-game-lineup-v1"], { revalidate: 600 })(homeName, awayName, startTime.toISOString(), starters)
    .catch(() => null);
}
