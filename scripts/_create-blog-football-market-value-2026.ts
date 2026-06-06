// 2026 축구 선수 몸값 순위 TOP 30 블로그 발행 (slug 으로 idempotent upsert).
//   npx tsx --env-file=.env.local scripts/_create-blog-football-market-value-2026.ts
// 데이터: /transfers DB 와 대조 검증 완료(순위·몸값·변동률·나이 100% 일치).
// 사용자 원본 HTML 기준 수정: ① 사실오류 2건(PSG 7→5명, 쿠바르시 €80M) ② 다크모드 색상.
import { prisma } from "@/lib/db";

const SITE = "https://www.scorebase.kr";
const slug = "football-player-market-value-2026";

const title = "2026 축구 선수 몸값 순위 TOP 30 — 음바페·홀란드·야말, 누가 진짜 1위일까";
const excerpt =
  "2026년 유럽 빅5 리그 선수 몸값(시장가치) 순위 TOP 30. 음바페·홀란드·야말이 €200M 공동 1위, 크바라츠헬리아·귈러 등 떡상주와 변동률, PSG 군단까지 스코어베이스 데이터로 정리했습니다.";
const tags =
  "축구 선수 몸값, 2026 몸값 순위, 시장가치, 음바페 몸값, 홀란드 몸값, 야말 몸값, 축구 이적시장, 선수 시장가치, 빅5 리그 몸값, 스코어베이스";
const thumbnailUrl = `${SITE}/blog/football-market-value-2026-hero.png`;

const content = `<article class="sb-post" style="max-width:820px;margin:0 auto;line-height:1.75;font-size:17px;word-break:keep-all;">

  <figure style="margin:0 0 28px;">
    <img src="/blog/football-market-value-2026-hero.png"
         alt="2026 축구 선수 몸값 순위 - 유럽 빅5 리그 시장가치 랭킹 (스코어베이스)"
         style="width:100%;height:auto;border-radius:12px;display:block;" loading="eager">
    <figcaption style="font-size:13px;color:#888;margin-top:8px;text-align:center;">
      2026년 유럽 빅5 리그 선수 몸값(시장가치) 순위 · 데이터: 스코어베이스
    </figcaption>
  </figure>

  <p style="color:inherit;opacity:0.75;font-size:15px;margin:0 0 28px;">
    최종 업데이트: 2026년 6월 · 데이터 기준: 유럽 빅5 리그(EPL·라리가·분데스리가·세리에 A·리그 1) 시장가치
  </p>

  <p>
    매년 이맘때면 똑같은 질문이 돌아옵니다. "지금 세계에서 제일 비싼 축구 선수는 누구야?"
    그런데 2026년 여름의 답은 예년처럼 단순하지가 않습니다. 정상에 세 명이 나란히 €200M(약 3,583억 원)으로
    붙어 있거든요. 한 명은 서른을 바라보는 검증된 득점기계, 한 명은 여전히 무릎으로 골문을 부수는 괴물,
    그리고 나머지 한 명은 <strong>이제 막 18살이 된 천재</strong>입니다.
  </p>

  <p>
    이 글에서는 스코어베이스가 매일 갱신하는 시장가치 데이터를 기준으로
    <strong>2026 축구 선수 몸값 순위 TOP 30</strong>을 정리했습니다. 단순히 숫자만 나열하지 않고,
    최근 몸값이 가장 많이 오른 선수, 반대로 떨어진 선수, 그리고 "왜 저 선수가 저 가격인가"까지 같이 짚어볼게요.
    실시간 순위는 언제든
    <a href="${SITE}/transfers" target="_blank" rel="noopener"><strong>스코어베이스 선수 몸값 랭킹</strong></a>에서 확인할 수 있습니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">한눈에 보는 결론 (요약)</h2>
  <ul style="padding-left:20px;">
    <li><strong>공동 1위(€200M):</strong> 킬리안 음바페 · 엘링 홀란드 · 라민 야말</li>
    <li><strong>역대급 떡상:</strong> 흐비차 크바라츠헬리아 <span style="color:#1a7f37;">▲56%</span>, 아르다 귈러 <span style="color:#1a7f37;">▲50%</span></li>
    <li><strong>주춤한 스타:</strong> 주드 벨링엄 <span style="color:#c0392b;">▼12%</span>, 알렉산더 이사크 <span style="color:#c0392b;">▼15%</span></li>
    <li><strong>가장 어린 톱랭커:</strong> 라민 야말(18·€200M), 파우 쿠바르시(18·€80M) — 10대들의 시대</li>
    <li><strong>최다 보유 구단:</strong> 파리 생제르맹(PSG)이 TOP 30에 5명 (+33위 하키미)</li>
  </ul>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">TOP 10 — 정상은 3파전, 그 아래는 'PSG 군단'</h2>

  <h3 style="font-size:20px;margin:24px 0 8px;">공동 1위. 음바페 · 홀란드 · 야말 (€200M / 약 3,583억 원)</h3>
  <p>
    세 선수의 1위 다툼은 성격이 완전히 다릅니다.
    <a href="${SITE}/transfers/pxwrxlhze0dryk0" target="_blank" rel="noopener">킬리안 음바페</a>(레알 마드리드)는
    이적 첫 시즌의 적응기를 끝내고 라리가 득점을 폭격하며 시장가치 <span style="color:#1a7f37;">▲11%</span> 반등에 성공했고,
    <a href="${SITE}/transfers/2y8m4zhzd27ql07" target="_blank" rel="noopener">엘링 홀란드</a>(맨체스터 시티)는
    여전히 '경기당 1골'에 가까운 효율로 자리를 지킵니다.
    가장 무서운 건 역시
    <a href="${SITE}/transfers/4jwq2ghxjzkvm0v" target="_blank" rel="noopener">라민 야말</a>입니다.
    18살에 이미 €200M이라는 게 비현실적인데, 변동폭이 0%라는 건 더 이상 오를 자리가 없을 만큼
    이미 천장을 찍었다는 뜻이기도 하죠.
  </p>

  <h3 style="font-size:20px;margin:24px 0 8px;">4~6위. 비니시우스 · 올리세 · 페드리 (€150M)</h3>
  <p>
    <a href="${SITE}/transfers/1l4rjnhe42vm7vx" target="_blank" rel="noopener">비니시우스 주니오르</a>가
    €150M으로 4위. 한때 발롱도르 0순위였던 걸 생각하면 살짝 정체된 느낌이지만 여전히 최정상권입니다.
    눈에 띄는 건 바이에른의 미카엘 올리세와 바르셀로나의 페드리가 나란히 <span style="color:#1a7f37;">▲7%</span>씩 오르며
    같은 가격대에 합류했다는 점이에요. 페드리는 부상만 없으면 향후 1~2년 안에 €200M 그룹에 들어갈 1순위 후보입니다.
  </p>

  <h3 style="font-size:20px;margin:24px 0 8px;">7~10위. PSG의 미친 뎁스 (€140M)</h3>
  <p>
    이 구간이 2026년의 진짜 이야기입니다. 주앙 네베스(<span style="color:#1a7f37;">▲27%</span>),
    비티냐(<span style="color:#1a7f37;">▲27%</span>), 흐비차 크바라츠헬리아(<span style="color:#1a7f37;">▲56%</span>)까지
    €140M 구간에만 PSG 선수가 셋입니다. 반면 같은 가격대의
    주드 벨링엄(레알)은 <span style="color:#c0392b;">▼12%</span>로 유일하게 뒷걸음질 쳤습니다.
    부상과 폼 저하가 시장가치에 그대로 반영된 케이스죠.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 16px;font-weight:800;">2026 축구 선수 몸값 순위 TOP 30 (전체 표)</h2>

  <div style="overflow-x:auto;">
  <table style="width:100%;border-collapse:collapse;font-size:15px;background:#fff;color:#1a1a1a;">
    <thead>
      <tr style="background:#0a0a0a;color:#fff;text-align:left;">
        <th style="padding:10px 8px;">#</th>
        <th style="padding:10px 8px;">선수</th>
        <th style="padding:10px 8px;">포지션</th>
        <th style="padding:10px 8px;">소속 · 리그</th>
        <th style="padding:10px 8px;">나이</th>
        <th style="padding:10px 8px;">시장가치</th>
        <th style="padding:10px 8px;">변동</th>
      </tr>
    </thead>
    <tbody>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">1</td><td style="padding:8px;">킬리안 음바페</td><td style="padding:8px;">ST</td><td style="padding:8px;">레알 마드리드 · 라리가</td><td style="padding:8px;">26</td><td style="padding:8px;">€200M (3,583억)</td><td style="padding:8px;color:#1a7f37;">▲11%</td></tr>
      <tr style="border-bottom:1px solid #eee;background:#fafafa;"><td style="padding:8px;">2</td><td style="padding:8px;">엘링 홀란드</td><td style="padding:8px;">ST</td><td style="padding:8px;">맨체스터 시티 · EPL</td><td style="padding:8px;">25</td><td style="padding:8px;">€200M (3,583억)</td><td style="padding:8px;">0%</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">3</td><td style="padding:8px;">라민 야말</td><td style="padding:8px;">FW</td><td style="padding:8px;">바르셀로나 · 라리가</td><td style="padding:8px;">18</td><td style="padding:8px;">€200M (3,583억)</td><td style="padding:8px;">0%</td></tr>
      <tr style="border-bottom:1px solid #eee;background:#fafafa;"><td style="padding:8px;">4</td><td style="padding:8px;">비니시우스 주니오르</td><td style="padding:8px;">W</td><td style="padding:8px;">레알 마드리드 · 라리가</td><td style="padding:8px;">25</td><td style="padding:8px;">€150M (2,687억)</td><td style="padding:8px;">0%</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">5</td><td style="padding:8px;">미카엘 올리세</td><td style="padding:8px;">W</td><td style="padding:8px;">바이에른 뮌헨 · 분데스리가</td><td style="padding:8px;">24</td><td style="padding:8px;">€150M (2,687억)</td><td style="padding:8px;color:#1a7f37;">▲7%</td></tr>
      <tr style="border-bottom:1px solid #eee;background:#fafafa;"><td style="padding:8px;">6</td><td style="padding:8px;">페드리</td><td style="padding:8px;">MF</td><td style="padding:8px;">바르셀로나 · 라리가</td><td style="padding:8px;">23</td><td style="padding:8px;">€150M (2,687억)</td><td style="padding:8px;color:#1a7f37;">▲7%</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">7</td><td style="padding:8px;">주앙 네베스</td><td style="padding:8px;">CM</td><td style="padding:8px;">파리 생제르맹 · 리그 1</td><td style="padding:8px;">21</td><td style="padding:8px;">€140M (2,508억)</td><td style="padding:8px;color:#1a7f37;">▲27%</td></tr>
      <tr style="border-bottom:1px solid #eee;background:#fafafa;"><td style="padding:8px;">8</td><td style="padding:8px;">비티냐</td><td style="padding:8px;">CM</td><td style="padding:8px;">파리 생제르맹 · 리그 1</td><td style="padding:8px;">26</td><td style="padding:8px;">€140M (2,508억)</td><td style="padding:8px;color:#1a7f37;">▲27%</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">9</td><td style="padding:8px;">주드 벨링엄</td><td style="padding:8px;">MF</td><td style="padding:8px;">레알 마드리드 · 라리가</td><td style="padding:8px;">22</td><td style="padding:8px;">€140M (2,508억)</td><td style="padding:8px;color:#c0392b;">▼12%</td></tr>
      <tr style="border-bottom:1px solid #eee;background:#fafafa;"><td style="padding:8px;">10</td><td style="padding:8px;">흐비차 크바라츠헬리아</td><td style="padding:8px;">W</td><td style="padding:8px;">파리 생제르맹 · 리그 1</td><td style="padding:8px;">25</td><td style="padding:8px;">€140M (2,508억)</td><td style="padding:8px;color:#1a7f37;">▲56%</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">11</td><td style="padding:8px;">데클란 라이스</td><td style="padding:8px;">DM</td><td style="padding:8px;">아스널 · EPL</td><td style="padding:8px;">27</td><td style="padding:8px;">€120M (2,150억)</td><td style="padding:8px;">0%</td></tr>
      <tr style="border-bottom:1px solid #eee;background:#fafafa;"><td style="padding:8px;">12</td><td style="padding:8px;">페데리코 발베르데</td><td style="padding:8px;">MF</td><td style="padding:8px;">레알 마드리드 · 라리가</td><td style="padding:8px;">27</td><td style="padding:8px;">€120M (2,150억)</td><td style="padding:8px;color:#c0392b;">▼8%</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">13</td><td style="padding:8px;">데지레 두에</td><td style="padding:8px;">W</td><td style="padding:8px;">파리 생제르맹 · 리그 1</td><td style="padding:8px;">20</td><td style="padding:8px;">€120M (2,150억)</td><td style="padding:8px;color:#1a7f37;">▲33%</td></tr>
      <tr style="border-bottom:1px solid #eee;background:#fafafa;"><td style="padding:8px;">14</td><td style="padding:8px;">부카요 사카</td><td style="padding:8px;">W</td><td style="padding:8px;">아스널 · EPL</td><td style="padding:8px;">24</td><td style="padding:8px;">€110M (1,971억)</td><td style="padding:8px;color:#c0392b;">▼8%</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">15</td><td style="padding:8px;">우스만 뎀벨레</td><td style="padding:8px;">ST</td><td style="padding:8px;">파리 생제르맹 · 리그 1</td><td style="padding:8px;">29</td><td style="padding:8px;">€100M (1,792억)</td><td style="padding:8px;">0%</td></tr>
      <tr style="border-bottom:1px solid #eee;background:#fafafa;"><td style="padding:8px;">16</td><td style="padding:8px;">자말 무시알라</td><td style="padding:8px;">AM</td><td style="padding:8px;">바이에른 뮌헨 · 분데스리가</td><td style="padding:8px;">23</td><td style="padding:8px;">€100M (1,792억)</td><td style="padding:8px;color:#c0392b;">▼17%</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">17</td><td style="padding:8px;">콜 파머</td><td style="padding:8px;">AM</td><td style="padding:8px;">첼시 · EPL</td><td style="padding:8px;">24</td><td style="padding:8px;">€100M (1,792억)</td><td style="padding:8px;color:#c0392b;">▼9%</td></tr>
      <tr style="border-bottom:1px solid #eee;background:#fafafa;"><td style="padding:8px;">18</td><td style="padding:8px;">페르민 로페스</td><td style="padding:8px;">MF</td><td style="padding:8px;">바르셀로나 · 라리가</td><td style="padding:8px;">22</td><td style="padding:8px;">€100M (1,792억)</td><td style="padding:8px;color:#1a7f37;">▲43%</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">19</td><td style="padding:8px;">모이세스 카이세도</td><td style="padding:8px;">CM</td><td style="padding:8px;">첼시 · EPL</td><td style="padding:8px;">24</td><td style="padding:8px;">€100M (1,792억)</td><td style="padding:8px;color:#c0392b;">▼9%</td></tr>
      <tr style="border-bottom:1px solid #eee;background:#fafafa;"><td style="padding:8px;">20</td><td style="padding:8px;">플로리안 비르츠</td><td style="padding:8px;">AM</td><td style="padding:8px;">리버풀 · EPL</td><td style="padding:8px;">23</td><td style="padding:8px;">€100M (1,792억)</td><td style="padding:8px;color:#c0392b;">▼9%</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">21</td><td style="padding:8px;">윌리엄 살리바</td><td style="padding:8px;">CB</td><td style="padding:8px;">아스널 · EPL</td><td style="padding:8px;">25</td><td style="padding:8px;">€100M (1,792억)</td><td style="padding:8px;color:#1a7f37;">▲11%</td></tr>
      <tr style="border-bottom:1px solid #eee;background:#fafafa;"><td style="padding:8px;">22</td><td style="padding:8px;">도미닉 소보슬라이</td><td style="padding:8px;">AM</td><td style="padding:8px;">리버풀 · EPL</td><td style="padding:8px;">25</td><td style="padding:8px;">€100M (1,792억)</td><td style="padding:8px;">0%</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">23</td><td style="padding:8px;">아르다 귈러</td><td style="padding:8px;">MF</td><td style="padding:8px;">레알 마드리드 · 라리가</td><td style="padding:8px;">20</td><td style="padding:8px;">€90M (1,612억)</td><td style="padding:8px;color:#1a7f37;">▲50%</td></tr>
      <tr style="border-bottom:1px solid #eee;background:#fafafa;"><td style="padding:8px;">24</td><td style="padding:8px;">모건 로저스</td><td style="padding:8px;">AM</td><td style="padding:8px;">아스톤 빌라 · EPL</td><td style="padding:8px;">23</td><td style="padding:8px;">€90M (1,612억)</td><td style="padding:8px;color:#1a7f37;">▲13%</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">25</td><td style="padding:8px;">엔조 페르난데스</td><td style="padding:8px;">CM</td><td style="padding:8px;">첼시 · EPL</td><td style="padding:8px;">25</td><td style="padding:8px;">€90M (1,612억)</td><td style="padding:8px;">0%</td></tr>
      <tr style="border-bottom:1px solid #eee;background:#fafafa;"><td style="padding:8px;">26</td><td style="padding:8px;">얀 디오망데</td><td style="padding:8px;">W</td><td style="padding:8px;">RB 라이프치히 · 분데스리가</td><td style="padding:8px;">19</td><td style="padding:8px;">€90M (1,612억)</td><td style="padding:8px;color:#1a7f37;">▲20%</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">27</td><td style="padding:8px;">라얀 셰르키</td><td style="padding:8px;">CM</td><td style="padding:8px;">맨체스터 시티 · EPL</td><td style="padding:8px;">22</td><td style="padding:8px;">€90M (1,612억)</td><td style="padding:8px;color:#1a7f37;">▲38%</td></tr>
      <tr style="border-bottom:1px solid #eee;background:#fafafa;"><td style="padding:8px;">28</td><td style="padding:8px;">훌리안 알바레스</td><td style="padding:8px;">FW</td><td style="padding:8px;">아틀레티코 마드리드 · 라리가</td><td style="padding:8px;">26</td><td style="padding:8px;">€90M (1,612억)</td><td style="padding:8px;color:#c0392b;">▼10%</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">29</td><td style="padding:8px;">알렉산다르 파블로비치</td><td style="padding:8px;">DM</td><td style="padding:8px;">바이에른 뮌헨 · 분데스리가</td><td style="padding:8px;">22</td><td style="padding:8px;">€90M (1,612억)</td><td style="padding:8px;color:#1a7f37;">▲20%</td></tr>
      <tr style="border-bottom:1px solid #eee;background:#fafafa;"><td style="padding:8px;">30</td><td style="padding:8px;">라우타로 마르티네스</td><td style="padding:8px;">ST</td><td style="padding:8px;">인터 밀란 · 세리에 A</td><td style="padding:8px;">28</td><td style="padding:8px;">€85M (1,523억)</td><td style="padding:8px;">0%</td></tr>
    </tbody>
  </table>
  </div>
  <p style="font-size:13px;color:#888;margin-top:10px;">
    ※ 시장가치는 스코어베이스 데이터 기준이며 매일 갱신됩니다. 31위 이하 전체 순위는
    <a href="${SITE}/transfers" target="_blank" rel="noopener">선수 몸값 랭킹 페이지</a>에서 확인하세요.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">몸값이 가장 많이 오른 선수 TOP 5</h2>
  <p>순위표만 보면 놓치기 쉬운 게 '변동률'입니다. 같은 €90M이라도 1년 새 50% 오른 선수와 10% 떨어진 선수는 결이 완전히 다르죠.</p>
  <ol style="padding-left:20px;">
    <li><strong>흐비차 크바라츠헬리아 <span style="color:#1a7f37;">▲56%</span></strong> — PSG 이적 후 완전히 만개. 올해 최고의 상승주.</li>
    <li><strong>아르다 귈러 <span style="color:#1a7f37;">▲50%</span></strong> — 레알에서 주전으로 도약하며 20살에 €90M.</li>
    <li><strong>페르민 로페스 <span style="color:#1a7f37;">▲43%</span></strong> — 바르샤 라마시아의 또 다른 보석.</li>
    <li><strong>라얀 셰르키 <span style="color:#1a7f37;">▲38%</span></strong> — 맨시티 이적 효과를 톡톡히.</li>
    <li><strong>데지레 두에 <span style="color:#1a7f37;">▲33%</span></strong> — 20살, PSG의 미래.</li>
  </ol>
  <p>반대로 <strong>알렉산더 이사크(▼15%)</strong>, <strong>자말 무시알라(▼17%)</strong>, <strong>주드 벨링엄(▼12%)</strong>은
  부상·폼 저하로 가치가 빠진 대표 사례입니다.</p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">데이터로 읽는 2026 이적시장 키워드</h2>
  <p>
    <strong>첫째, 10대 전성시대.</strong> 라민 야말(18)과 파우 쿠바르시(18)가 €80M~€200M 구간에 들어와 있습니다.
    구단들이 '완성형'보다 '잠재력'에 베팅하는 흐름이 시장가치에 그대로 찍혔습니다.
  </p>
  <p>
    <strong>둘째, PSG의 스쿼드 인플레이션.</strong> TOP 30 안에 PSG 선수만 5명(네베스·비티냐·크바라츠헬리아·두에·뎀벨레)입니다.
    여기에 33위 아크라프 하키미까지 더하면, 한 팀의 핵심 라인이 통째로 최상위권에 포진한 셈이죠.
  </p>
  <p>
    <strong>셋째, 수비형 미드필더·센터백의 재평가.</strong> 데클란 라이스(€120M), 윌리엄 살리바(€100M)처럼
    '화려하지 않은' 포지션의 가치가 크게 올랐습니다. 현대 축구가 빌드업과 수비 안정성을 얼마나 비싸게 보는지를 보여주죠.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">한국 선수 몸값은 몇 위일까?</h2>
  <p>
    이번 빅5 TOP 30에 한국 선수는 들지 못했지만, 손흥민·이강인·김민재 등 주요 선수들의 실시간 시장가치와 변동 추이는
    스코어베이스의
    <a href="${SITE}/transfers" target="_blank" rel="noopener">국가별 필터</a>에서 바로 확인할 수 있습니다.
    개별 선수 페이지에서는 시즌별 성적과 몸값 그래프까지 함께 볼 수 있어요.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">자주 묻는 질문 (FAQ)</h2>

  <h3 style="font-size:18px;margin:18px 0 6px;">Q. 선수 몸값(시장가치)은 어떻게 정해지나요?</h3>
  <p>나이, 최근 폼과 성적, 계약 잔여 기간, 포지션 수요, 리그 수준 등을 종합해 추정합니다. 실제 이적료와는 다를 수 있는 '추정 가치'입니다.</p>

  <h3 style="font-size:18px;margin:18px 0 6px;">Q. 몸값이랑 이적료는 같은 건가요?</h3>
  <p>아닙니다. 몸값(시장가치)은 추정치이고, 이적료는 구단 간 실제로 오간 금액입니다. 협상력·긴급성에 따라 이적료가 시장가치보다 훨씬 높거나 낮을 수 있습니다.</p>

  <h3 style="font-size:18px;margin:18px 0 6px;">Q. 순위는 얼마나 자주 갱신되나요?</h3>
  <p>스코어베이스의 시장가치 데이터는 매일 자동 갱신됩니다. 가장 최신 순위는 <a href="${SITE}/transfers" target="_blank" rel="noopener">선수 몸값 랭킹 페이지</a>에서 확인하세요.</p>

  <h3 style="font-size:18px;margin:18px 0 6px;">Q. 2026년 현재 세계에서 가장 비싼 축구 선수는 누구인가요?</h3>
  <p>2026년 6월 기준 킬리안 음바페, 엘링 홀란드, 라민 야말이 €200M(약 3,583억 원)으로 공동 1위입니다.</p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <p style="background:#f5f7fa;border-radius:10px;padding:18px 20px;font-size:15px;color:#1a1a1a;">
    📊 <strong>실시간 선수 몸값이 궁금하다면?</strong><br>
    리그별·팀별·국가별·포지션별로 정렬되는 전체 랭킹을
    <a href="${SITE}/transfers" target="_blank" rel="noopener"><strong>스코어베이스 이적시장 · 시장가치 페이지</strong></a>에서
    매일 업데이트로 확인하세요.
  </p>

  <p style="font-size:13px;color:#999;margin-top:24px;">
    데이터 출처: 스코어베이스(Scorebase) 선수 몸값 데이터 · 2026년 6월 기준. 시장가치는 통계 기반 추정치이며 실제 이적료와 다를 수 있습니다.
  </p>

  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "선수 몸값(시장가치)은 어떻게 정해지나요?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "나이, 최근 폼과 성적, 계약 잔여 기간, 포지션 수요, 리그 수준 등을 종합해 추정합니다. 실제 이적료와는 다를 수 있는 추정 가치입니다.",
        },
      },
      {
        "@type": "Question",
        name: "몸값이랑 이적료는 같은 건가요?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "아닙니다. 몸값(시장가치)은 추정치이고, 이적료는 구단 간 실제로 오간 금액입니다. 협상력과 긴급성에 따라 이적료가 시장가치보다 높거나 낮을 수 있습니다.",
        },
      },
      {
        "@type": "Question",
        name: "2026년 현재 세계에서 가장 비싼 축구 선수는 누구인가요?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "2026년 6월 기준 킬리안 음바페, 엘링 홀란드, 라민 야말이 약 €200M(3,583억 원)으로 공동 1위입니다.",
        },
      },
    ],
  })}</script>

</article>`;

async function main() {
  const existing = await prisma.blog.findUnique({ where: { slug }, select: { id: true } });
  const row = await prisma.blog.upsert({
    where: { slug },
    update: { title, excerpt, content, tags, thumbnailUrl },
    create: { slug, title, excerpt, content, tags, thumbnailUrl },
  });
  console.log(`${existing ? "UPDATED" : "CREATED"} blog [${row.id}] /blog/${row.slug}`);
  console.log(`  title: ${row.title}`);
  console.log(`  thumb: ${row.thumbnailUrl}`);
  console.log(`  content length: ${content.length}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
