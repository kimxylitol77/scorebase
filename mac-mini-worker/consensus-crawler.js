// Covers.com MLB 오버/언더 대중 베팅 컨센서스 크롤러 — 맥미니 launchd.
// Covers OU consensus 페이지를 파싱해 컨센서스 격차 큰 상위 N경기를 Vercel
// /api/internal/consensus-pick 에 분 단위 간격으로 push.
// 매칭·한국어 분석·Post 생성은 Vercel 쪽이 담당(기존 게시판 로직 재사용).
// 예의바른 크롤러: 정직한 UA, robots 존중(/consensus 허용 확인됨), 요청 간 sleep.

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const axios = require("axios");
const cheerio = require("cheerio");

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const COVERS_URL = "https://contests.covers.com/consensus/topoverunderconsensus/mlb/overall";
const TARGET_PUBLISH = 4; // 발행 목표 경기 수 (SEO·도배 방지로 소량 선별)
const PUBLISH_GAP_MS = 60 * 1000; // 글 사이 1분 간격 (분 단위 분산 발행)

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

/** Covers OU consensus HTML → 경기 배열. 오버/언더 %·기준선·픽수 추출. */
function parse(html) {
  const $ = cheerio.load(html);
  const games = [];
  $("td.covers-CoversConsensus-table--matchupColumn").each((_, td) => {
    const $cell = $(td);
    const logos = $cell.find("img.covers-CoversConsensus-mainLogo");
    if (logos.length < 2) return;

    const abbrOf = (img) => {
      const src = $(img).attr("src") || "";
      const m = src.match(/\/mlb\/([a-z0-9]+)\.(?:png|gif)/i);
      return m ? m[1].toLowerCase() : null;
    };
    const awayAbbr = abbrOf(logos[0]);
    const homeAbbr = abbrOf(logos[1]);
    if (!awayAbbr || !homeAbbr) return;

    // 같은 행의 다음 td 들: [0]=시간 [1]=오버/언더% [2]=기준선 [3]=픽수
    const sib = $cell.nextAll("td");
    const gameTimeEt = sib.eq(0).text().replace(/\s+/g, " ").trim() || null;
    const ouPcts = [...sib.eq(1).text().matchAll(/(\d+)\s*%/g)].map((m) => Number(m[1]));
    const line = Number(sib.eq(2).text().replace(/[^\d.]/g, ""));
    // 픽수는 붙어 나올 수 있어(11751) 자식 텍스트 노드 단위로 분리.
    const pickTexts = sib
      .eq(3)
      .find("*")
      .addBack()
      .contents()
      .filter((_, n) => n.type === "text")
      .map((_, n) => $(n).text().trim())
      .get()
      .filter((t) => /^\d+$/.test(t));
    const picks = pickTexts.map(Number);

    if (ouPcts.length < 2 || !Number.isFinite(line)) return; // 핵심 데이터 없으면 skip

    games.push({
      awayAbbr,
      homeAbbr,
      overPct: ouPcts[0],
      underPct: ouPcts[1],
      line,
      overPicks: Number.isFinite(picks[0]) ? picks[0] : null,
      underPicks: Number.isFinite(picks[1]) ? picks[1] : null,
      gameTimeEt,
    });
  });
  return games;
}

async function fetchCovers() {
  const { data } = await axios.get(COVERS_URL, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    timeout: 30000,
  });
  return data;
}

async function postGame(g) {
  try {
    const { data } = await axios.post(`${SITE}/api/internal/consensus-pick`, g, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 60000,
    });
    const fav = g.overPct >= g.underPct ? `O ${g.overPct}` : `U ${g.underPct}`;
    log(`${g.awayAbbr}@${g.homeAbbr} ${fav}%/line ${g.line} →`, JSON.stringify(data));
    return data;
  } catch (e) {
    log(`${g.awayAbbr}@${g.homeAbbr} POST 실패:`, e.response?.data || e.message);
    return null;
  }
}

async function main() {
  if (!TOKEN) {
    console.error("❌ INTERNAL_API_TOKEN 미설정");
    process.exit(1);
  }
  const html = await fetchCovers();
  const games = parse(html);
  log(`Covers MLB OU 파싱: ${games.length}경기`);
  // 컨센서스 격차 큰 순으로 상위 N개만 (Vercel 쪽도 55% 미만 skip).
  // 격차 큰 순. 매칭·55% 통과한 경기만 세어 목표 수까지 발행(미래·미매칭 경기는 건너뜀).
  games.sort((a, b) => Math.max(b.overPct, b.underPct) - Math.max(a.overPct, a.underPct));
  let created = 0;
  for (const g of games) {
    if (created >= TARGET_PUBLISH) break;
    const r = await postGame(g);
    if (r && r.created) {
      created++;
      await new Promise((r) => setTimeout(r, PUBLISH_GAP_MS)); // 분 단위 분산 발행
    }
  }
  log(`완료: ${created}건 발행`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { parse };
