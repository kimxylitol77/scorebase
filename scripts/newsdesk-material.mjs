// 헤르메스 글감 편집장(newsdesk) 재료 — 36h 해외 기사 스토리 클러스터 + 등장 팀의 스코어베이스 데이터를 JSON 으로 출력.
// 읽기 전용. 헤르메스 cron --script 가 stdout 을 에이전트 프롬프트에 주입한다 (docs/hermes-newsdesk/plan.md).
// 실행: node --env-file=.env.local scripts/newsdesk-material.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const WINDOW_H = 36;
const MAX_STORIES = 8; // 프롬프트 폭주 방지
const MAX_TEAMS_PER_STORY = 3;
const US_LEAGUES = new Set(["NBA", "NHL", "MLB"]);
// 축구 팀명 첫 단어로 매칭할 때 여러 팀이 공유하는 단어는 버린다 ("manchester" → 시티/유나이티드).
const AMBIGUOUS_FIRST = new Set(["manchester", "real", "athletic", "atletico", "inter", "sporting", "borussia", "bayer", "west", "new", "los", "san", "saint", "red", "club"]);

const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// storyKey 클러스터 — 매체 여러 곳이 다룬 이슈 우선, 굿즈·통계 페이지류(score 0~1)는 제외.
const stories = await prisma.$queryRaw`
  SELECT "storyKey", sport, max(league) AS league,
         count(*)::int AS articles,
         count(DISTINCT "sourceName")::int AS sources,
         max(coalesce(substring(note from 'score=(\\d+)')::int, 0)) AS score,
         bool_or(status = 'PUBLISHED') AS "alreadyBriefed",
         (array_agg(title ORDER BY "publishedAt" DESC))[1:3] AS titles,
         (array_agg(DISTINCT "sourceName"))[1:4] AS "sourceNames",
         (array_agg("sourceUrl" ORDER BY "publishedAt" DESC))[1:3] AS urls,
         max("publishedAt") AS "latestAt"
  FROM "NewsBriefing"
  WHERE "createdAt" >= now() - make_interval(hours => ${WINDOW_H}::int)
    AND "storyKey" IS NOT NULL
  GROUP BY "storyKey", sport
  HAVING max(coalesce(substring(note from 'score=(\\d+)')::int, 0)) >= 2
     AND (max(coalesce(substring(note from 'score=(\\d+)')::int, 0)) >= 4
          OR count(DISTINCT "sourceName") >= 2)
  ORDER BY sources DESC, articles DESC, score DESC
  LIMIT ${MAX_STORIES}
`;

const leagues = [...new Set(stories.map((s) => s.league).filter(Boolean))];

// 리그별 현역 팀 — 최근 1년 경기 있는 row 만 (중복 row·해체 팀 배제).
// Team.eloRating 은 싣지 않는다 — 전 리그 기본값 1500 그대로라(2026-09-13 실측) 틀린 순위가 된다.
const teamRows = leagues.length === 0 ? [] : await prisma.$queryRaw`
  SELECT t.id, t.name, t."nameKo", t.league
  FROM "Team" t
  WHERE t.league = ANY(${leagues})
    AND EXISTS (
      SELECT 1 FROM "Match" m
      WHERE (m."homeTeamId" = t.id OR m."awayTeamId" = t.id)
        AND m."startTime" >= now() - interval '365 days'
    )
`;

function matchTeams(story) {
  const key = story.storyKey;
  const keyTokens = new Set(key.split("-"));
  const text = story.titles.join(" ").toLowerCase();
  const hits = [];
  for (const t of teamRows) {
    if (t.league !== story.league) continue;
    const full = slug(t.name);
    const tokens = full.split("-");
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    const ok =
      key.includes(full) ||
      text.includes(t.name.toLowerCase()) ||
      (US_LEAGUES.has(t.league) && last.length >= 4 && (keyTokens.has(last) || new RegExp(`\\b${last}\\b`).test(text))) ||
      (!US_LEAGUES.has(t.league) && first.length >= 5 && !AMBIGUOUS_FIRST.has(first) && keyTokens.has(first));
    if (ok) hits.push(t);
  }
  return hits.slice(0, MAX_TEAMS_PER_STORY);
}

async function teamData(t) {
  const recent = await prisma.$queryRaw`
    SELECT m."startTime", m.league, m."homeTeamId", m."homeScore", m."awayScore",
           h."nameKo" AS "homeKo", h.name AS home, a."nameKo" AS "awayKo", a.name AS away
    FROM "Match" m JOIN "Team" h ON h.id = m."homeTeamId" JOIN "Team" a ON a.id = m."awayTeamId"
    WHERE (m."homeTeamId" = ${t.id} OR m."awayTeamId" = ${t.id})
      AND m.status = 'FINISHED' AND m."homeScore" IS NOT NULL
    ORDER BY m."startTime" DESC LIMIT 5
  `;
  const [next] = await prisma.$queryRaw`
    SELECT m."startTime", m.league, h."nameKo" AS "homeKo", h.name AS home, a."nameKo" AS "awayKo", a.name AS away
    FROM "Match" m JOIN "Team" h ON h.id = m."homeTeamId" JOIN "Team" a ON a.id = m."awayTeamId"
    WHERE (m."homeTeamId" = ${t.id} OR m."awayTeamId" = ${t.id})
      AND m.status = 'SCHEDULED' AND m."startTime" > now()
    ORDER BY m."startTime" ASC LIMIT 1
  `;
  const kst = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const label = (ko, en) => ko ?? en;
  return {
    team: label(t.nameKo, t.name),
    teamEn: t.name,
    page: `/teams/${t.id}`,
    last5: recent.map((m) => {
      const home = m.homeTeamId === t.id;
      const [f, a] = home ? [m.homeScore, m.awayScore] : [m.awayScore, m.homeScore];
      const opp = home ? label(m.awayKo, m.away) : label(m.homeKo, m.home);
      const r = f > a ? "승" : f < a ? "패" : "무";
      return `${kst(m.startTime)} [${m.league}] ${home ? "홈" : "원정"} vs ${opp} ${f}-${a} ${r}`;
    }),
    next: next ? `${kst(next.startTime)} [${next.league}] ${label(next.homeKo, next.home)} vs ${label(next.awayKo, next.away)}` : null,
  };
}

const out = [];
for (const s of stories) {
  const teams = [];
  for (const t of matchTeams(s)) teams.push(await teamData(t));
  out.push({
    storyKey: s.storyKey,
    sport: s.sport,
    league: s.league,
    articles: s.articles,
    sources: s.sources,
    score: s.score,
    alreadyBriefed: s.alreadyBriefed,
    sourceNames: s.sourceNames,
    headlines: s.titles,
    urls: s.urls.map((u) => u.replaceAll("&amp;", "&")),
    scorebaseData: teams,
  });
}

console.log(JSON.stringify({
  window: `최근 ${WINDOW_H}시간`,
  note: "headlines 는 원문 제목(영문)이다. 번역·요약 대상이 아니라 이슈 식별용. 사실·수치는 scorebaseData 와 headlines 에 있는 것만 쓸 것.",
  stories: out,
}, null, 2));

await prisma.$disconnect();
