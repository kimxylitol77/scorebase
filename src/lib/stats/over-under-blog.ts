// 오버/언더 허브 블로그 글 본문 생성·저장 — 스크립트와 주간 cron 이 공유한다.
// 숫자와 표를 전부 DB 집계로 만들기 때문에 다시 실행하면 서술과 표가 함께 최신이 된다.
// 상세 데이터는 /over-under/[league] 페이지가 실시간으로 보여주고, 이 글은 그 입구 역할이다.
import { prisma } from "@/lib/db";
import { computeAllLeaguesOverUnder, computeLeagueOverUnder, pct } from "@/lib/stats/over-under";
import { LEAGUE_DISPLAY, COUNTRY_BY_LEAGUE } from "@/lib/sports/sport-leagues";

const SITE = "https://www.scorebase.kr";
const slug = "football-over-under-stats-by-league";

/** 본문에서 팀 표를 함께 보여줄 대표 리그 — 한국 검색 수요가 있는 순서로. */
const FEATURED = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "BUNDESLIGA_2", "CHAMPIONSHIP",
];

const f1 = (v: number) => v.toFixed(1);
const ko = (lg: string) => LEAGUE_DISPLAY[lg] ?? lg;

const H2 = 'style="font-size:24px;margin:0 0 14px;font-weight:800;"';
const H3 = 'style="font-size:19px;margin:26px 0 10px;font-weight:700;"';
const HR = '<hr style="border:none;border-top:1px solid #eee;margin:32px 0;">';
// 다크 테마에서 흰 배경 블록의 글자색이 상속돼 흐려지므로 color 를 명시한다.
const TH = 'style="padding:9px 8px;border-bottom:2px solid #333;text-align:left;font-weight:700;color:#111;"';
const TD = 'style="padding:8px;border-bottom:1px solid #e3e6ea;color:#222;"';
// 흰 표 안의 링크 — 다크 테마 링크색(밝음)이 상속되면 흰 배경에서 사라진다(8/22 실측). 색을 박는다.
const A_IN_TABLE = 'style="color:#1d4ed8;text-decoration:underline;"';
const TABLE =
  'style="width:100%;border-collapse:collapse;font-size:15px;background:#fff;color:#222;margin:12px 0;"';
const BOX =
  'style="background:#f6f8fa;border-left:4px solid #ea7317;padding:14px 16px;margin:20px 0;border-radius:4px;color:#222;"';

export async function buildAndSaveOverUnderBlog(): Promise<{ slug: string; id: number; leagues: number; matches: number; chars: number }> {
  const all = await computeAllLeaguesOverUnder();
  const matches = all.reduce((a, l) => a + l.matches, 0);
  const avg = all.reduce((a, l) => a + l.over25Pct * l.matches, 0) / matches;
  const top = all[0]!;
  const bottom = all.at(-1)!;

  const overTop10 = all.slice(0, 10);
  const underTop10 = [...all].reverse().slice(0, 10);

  // 대표 리그의 팀 표 — 오버 1위와 언더 1위만 뽑아 요약한다.
  const featured = (
    await Promise.all(
      FEATURED.map(async (lg) => {
        const d = await computeLeagueOverUnder(lg);
        if (!d || !d.teams.length) return null;
        const ranked = [...d.teams].sort((a, b) => pct(b.over25, b.matches) - pct(a.over25, a.matches));
        return { lg, d, over: ranked[0]!, under: ranked.at(-1)! };
      }),
    )
  ).filter((x): x is NonNullable<typeof x> => x !== null);

  const leagueRows = (rows: typeof all) =>
    rows
      .map(
        (l, i) => `      <tr>
        <td ${TD}>${i + 1}</td>
        <td ${TD}><a ${A_IN_TABLE} href="${SITE}/over-under/${l.league}">${ko(l.league)}</a>${
          COUNTRY_BY_LEAGUE[l.league] ? ` <span style="color:#888;font-size:13px;">${COUNTRY_BY_LEAGUE[l.league]}</span>` : ""
        }</td>
        <td ${TD} align="right"><strong>${f1(l.over25Pct)}%</strong></td>
        <td ${TD} align="right">${f1(100 - l.over25Pct)}%</td>
        <td ${TD} align="right">${l.goalsPerMatch.toFixed(2)}</td>
        <td ${TD} align="right">${l.matches.toLocaleString()}</td>
      </tr>`,
      )
      .join("\n");

  const featuredBlocks = featured
    .map(({ lg, d, over, under }) => {
      const leagueOver = pct(d.over25, d.matches);
      return `  <h3 ${H3}>${ko(lg)}</h3>
  <p>
    ${d.matches.toLocaleString()}경기 기준 오버 2.5 비율은 <strong>${f1(leagueOver)}%</strong>, 경기당 평균
    ${(d.goals / d.matches).toFixed(2)}골입니다.
    오버가 가장 잦은 팀은 <strong>${over.nameKo}</strong>(${over.matches}경기 중 ${over.over25}경기,
    ${f1(pct(over.over25, over.matches))}%)이고, 언더가 가장 잦은 팀은 <strong>${under.nameKo}</strong>(언더
    ${f1(100 - pct(under.over25, under.matches))}%)입니다.
    <a href="${SITE}/over-under/${lg}">${ko(lg)} 팀별 전체 표 보기</a>
  </p>`;
    })
    .join("\n\n");

  const content = `<article class="sb-post" style="max-width:820px;margin:0 auto;line-height:1.75;font-size:17px;">

  <p>
    축구에서 <strong>오버 2.5</strong>는 한 경기 총득점이 3골 이상인 경우를 말합니다. 반대로 2골 이하로 끝나면 언더입니다.
    같은 축구라도 리그마다 이 비율이 크게 다릅니다. 스코어베이스가 집계하는
    <strong>${all.length}개 리그 ${matches.toLocaleString()}경기</strong>에서 가장 오버가 잦은 리그와 가장 언더가 잦은 리그의 차이는
    ${f1(top.over25Pct - bottom.over25Pct)}%포인트에 달합니다.
  </p>

  <p>
    이 글은 1부 리그뿐 아니라 <strong>2부·3부 등 하부리그까지</strong> 포함한 오버 언더 기록을 정리한 것입니다.
    경기가 끝날 때마다 집계가 다시 계산되므로, 아래 표와 링크된 리그별 페이지는 항상 최신 상태입니다.
  </p>

  <div ${BOX}>
    <strong>한눈에 보는 결론.</strong><br>
    전체 평균 오버 2.5 비율 <strong>${f1(avg)}%</strong> · 집계 리그 ${all.length}개 · 누적 ${matches.toLocaleString()}경기<br>
    오버가 가장 잦은 리그 <strong>${ko(top.league)} ${f1(top.over25Pct)}%</strong> (경기당 ${top.goalsPerMatch.toFixed(2)}골)<br>
    언더가 가장 잦은 리그 <strong>${ko(bottom.league)} 언더 ${f1(100 - bottom.over25Pct)}%</strong> (경기당 ${bottom.goalsPerMatch.toFixed(2)}골)
  </div>

  ${HR}

  <h2 ${H2}>오버가 가장 많이 나는 리그 TOP 10</h2>
  <p>
    골이 많이 터지는 리그입니다. 상위권은 북유럽과 소규모 리그가 차지하는 경우가 많습니다. 리그 이름을 누르면 그 리그의
    팀별 오버 언더 표로 이동합니다.
  </p>
  <div style="overflow-x:auto;">
  <table ${TABLE}>
    <thead><tr><th ${TH}>#</th><th ${TH}>리그</th><th ${TH}>오버 2.5</th><th ${TH}>언더</th><th ${TH}>경기당 골</th><th ${TH}>경기</th></tr></thead>
    <tbody>
${leagueRows(overTop10)}
    </tbody>
  </table>
  </div>

  <h2 ${H2}>언더가 가장 많이 나는 리그 TOP 10</h2>
  <p>
    반대로 골이 잘 나지 않는 리그입니다. 수비적인 리그이거나 경기 템포가 느린 리그가 여기에 모입니다.
  </p>
  <div style="overflow-x:auto;">
  <table ${TABLE}>
    <thead><tr><th ${TH}>#</th><th ${TH}>리그</th><th ${TH}>오버 2.5</th><th ${TH}>언더</th><th ${TH}>경기당 골</th><th ${TH}>경기</th></tr></thead>
    <tbody>
${leagueRows(underTop10)}
    </tbody>
  </table>
  </div>

  ${HR}

  <h2 ${H2}>주요 리그별 오버 언더 — 어느 팀이 오버가 잦은가</h2>
  <p>
    한국에서 많이 찾는 리그를 추려 오버가 가장 잦은 팀과 언더가 가장 잦은 팀을 정리했습니다.
    각 리그의 전체 팀 표와 홈·원정 분해는 링크된 페이지에서 볼 수 있습니다.
  </p>

${featuredBlocks}

  ${HR}

  <h2 ${H2}>하부리그까지 전부 보기</h2>
  <p>
    위에 나오지 않은 리그도 모두 집계돼 있습니다. 2부·3부 리그와 아시아·남미·동유럽 리그를 포함해
    <a href="${SITE}/over-under">축구 오버 언더 통계 페이지</a>에서 ${all.length}개 리그를 한 번에 볼 수 있습니다.
    각 리그 페이지에는 팀별 오버 1.5·2.5·3.5, 양 팀 모두 득점 비율, 홈과 원정을 나눈 기록이 함께 있습니다.
  </p>

  <h2 ${H2}>이 숫자를 읽을 때 주의할 점</h2>
  <p>
    비율은 표본이 쌓일수록 안정됩니다. 시즌 초에는 경기 수가 적어 특정 팀의 오버 비율이 크게 흔들릴 수 있습니다.
    그래서 8경기 미만인 팀은 표에서 제외했고, 팀당 경기 수가 적은 컵 대회와 친선 경기도 집계에서 뺐습니다.
  </p>
  <p>
    또한 오버 비율이 높다는 것이 곧 다음 경기에도 골이 많이 난다는 뜻은 아닙니다. 감독 교체, 부상, 일정 밀집처럼
    득점 흐름을 바꾸는 요인이 많습니다. 과거 기록은 참고 자료일 뿐이며, 예측이 아닙니다.
  </p>

  <h2 ${H2}>자주 묻는 질문</h2>
  <p><strong>Q. 오버 2.5가 정확히 무슨 뜻인가요?</strong> 한 경기에서 두 팀이 넣은 골을 합쳐 3골 이상이면 오버 2.5입니다. 2골 이하면 언더 2.5입니다. 2.5라는 숫자는 딱 떨어지는 무승부를 없애기 위한 기준선입니다.</p>
  <p><strong>Q. 오버가 가장 많이 나는 리그는 어디인가요?</strong> 현재 집계로는 ${ko(top.league)}가 ${f1(top.over25Pct)}%로 가장 높습니다. 경기당 평균 ${top.goalsPerMatch.toFixed(2)}골이 나옵니다.</p>
  <p><strong>Q. 언더가 가장 많이 나는 리그는 어디인가요?</strong> ${ko(bottom.league)}로 언더 비율이 ${f1(100 - bottom.over25Pct)}%입니다. 경기당 평균 득점이 ${bottom.goalsPerMatch.toFixed(2)}골에 그칩니다.</p>
  <p><strong>Q. 통계는 얼마나 자주 갱신되나요?</strong> 리그별 페이지는 경기가 끝나면 다시 계산됩니다. 이 글의 표도 주기적으로 다시 작성돼 최신 기록을 반영합니다.</p>
  <p><strong>Q. 하부리그 기록도 볼 수 있나요?</strong> 볼 수 있습니다. 독일 2부, 잉글랜드 3부, K리그2를 비롯해 ${all.length}개 리그가 모두 집계 대상입니다.</p>

  ${HR}

  <p style="font-size:15px;color:#666;">
    집계 기준. 스코어베이스 경기 결과 데이터베이스의 종료 경기 ${matches.toLocaleString()}건(축구 ${all.length}개 리그).
    컵 대회·친선 경기 제외, 팀당 8경기 이상. 최종 갱신 ${new Date().toISOString().slice(0, 10)}.
  </p>

</article>`;

  const title = `축구 오버 언더 통계 — 오버 많이 나는 리그·팀 순위 (${all.length}개 리그)`;
  const excerpt =
    `축구 ${all.length}개 리그 ${matches.toLocaleString()}경기의 오버 언더 기록입니다. 오버가 가장 잦은 리그는 ${ko(top.league)} ${f1(top.over25Pct)}%, ` +
    `언더가 가장 잦은 리그는 ${ko(bottom.league)}입니다. 하부리그까지 팀별로 오버 많이 나는 팀을 정리했습니다.`;
  const tags = [
    "축구 오버언더", "오버 2.5", "오버 많이 나는 팀", "언더 많이 나는 팀", "오버 많이 나는 리그",
    "언더 많이 나는 리그", "분데스리가 오버", "K리그 오버언더", "프리미어리그 오버", "축구 경기당 득점",
    "리그별 득점 통계", "하부리그 통계",
  ].join(", ");

  const saved = await prisma.blog.upsert({
    where: { slug },
    update: { title, excerpt, content, tags, publishedAt: new Date() },
    create: { slug, title, excerpt, content, tags },
  });

  const plain = content.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
  return { slug, id: saved.id, leagues: all.length, matches, chars: plain.length };
}
