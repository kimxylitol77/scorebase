// 이강인 아틀레티코 전술 분석 블로그 발행 (slug idempotent upsert).
//   npx tsx --env-file=.env.local scripts/_create-blog-lee-kang-in-atletico.ts
// 데이터: PlayerMatchLog(최근 1년 45경기) + FootballTransfer + PlayerMarketValue.
// 마르카(2026-08-17·08-20) 전술 분석의 주장을 우리 DB 기록으로 검증하는 구성.
// 본문 수치를 전부 DB 집계로 생성 — 재실행하면 서술과 표가 함께 갱신된다.
import { prisma } from "@/lib/db";

const SITE = "https://www.scorebase.kr";
const slug = "lee-kang-in-atletico-tactical-analysis";
const PLAYER_ID = "l7oqdehed20r510";
const EUR_KRW = 1791.5; // src/app/transfers/page.tsx 와 동일 상수
const eok = (eur: number) => Math.round((eur * EUR_KRW) / 1e8).toLocaleString();

async function main() {
  const logs = await prisma.playerMatchLog.findMany({
    where: { playerId: PLAYER_ID },
    orderBy: { date: "asc" },
  });
  const stat = logs.filter((l) => l.minutes != null);
  const sum = (f: keyof (typeof stat)[number]) =>
    stat.reduce((a, l) => a + ((l[f] as number | null) ?? 0), 0);

  const mins = sum("minutes");
  const goals = sum("goals");
  const assists = sum("assists");
  const keyPasses = sum("keyPasses");
  const shots = sum("shots");
  const passes = sum("passes");
  const passesAcc = sum("passesAcc");
  const duelsWon = sum("duelsWon");
  const duelsTotal = sum("duelsTotal");
  const tackles = sum("tackles");
  const starts = stat.filter((l) => l.started).length;
  const subs = stat.filter((l) => !l.started).length;
  const p90 = (v: number) => (mins ? (v / mins) * 90 : 0);
  const rated = stat.filter((l) => l.rating != null);
  const avgRating = rated.reduce((a, l) => a + (l.rating ?? 0), 0) / rated.length;
  const passPct = (passesAcc / passes) * 100;

  const debut = stat.filter((l) => l.leagueName === "La Liga").at(-1)!;
  const psg = stat.filter((l) => l.leagueName !== "La Liga");
  const psgMins = psg.reduce((a, l) => a + (l.minutes ?? 0), 0);
  const psgDuelWon = psg.reduce((a, l) => a + (l.duelsWon ?? 0), 0);
  const psgDuelTot = psg.reduce((a, l) => a + (l.duelsTotal ?? 0), 0);
  const psgDuelPct = (psgDuelWon / psgDuelTot) * 100;
  const psgTackleP90 = (psg.reduce((a, l) => a + (l.tackles ?? 0), 0) / psgMins) * 90;

  const ucl = stat.filter((l) => l.leagueName === "UEFA Champions League");
  const uclMins = ucl.reduce((a, l) => a + (l.minutes ?? 0), 0);

  const y2025 = stat.filter((l) => l.date.getUTCFullYear() === 2025);
  const y2026 = stat.filter((l) => l.date.getUTCFullYear() === 2026);
  const kpP90 = (arr: typeof stat) => {
    const m = arr.reduce((a, l) => a + (l.minutes ?? 0), 0);
    return m ? (arr.reduce((a, l) => a + (l.keyPasses ?? 0), 0) / m) * 90 : 0;
  };

  const transfer = await prisma.footballTransfer.findFirst({
    where: { playerId: PLAYER_ID, toTeamName: { contains: "Atletico" } },
    orderBy: { transferTime: "desc" },
  });
  const mv = await prisma.playerMarketValue.findUnique({ where: { id: PLAYER_ID } });
  const fee = transfer?.transferFee ?? 0;
  const value = mv?.currentValue ?? 0;
  const premium = value ? ((fee - value) / value) * 100 : 0;

  const from = logs[0]!.date, to = logs.at(-1)!.date;
  const ymd = (d: Date) => `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  const n1 = (v: number) => v.toFixed(1);
  const n2 = (v: number) => v.toFixed(2);

  const PLAYER_URL = `${SITE}/transfers/${PLAYER_ID}`;
  const H2 = 'style="font-size:24px;margin:0 0 14px;font-weight:800;"';
  const HR = '<hr style="border:none;border-top:1px solid #eee;margin:32px 0;">';
  // 다크 테마에서 흰 배경 블록의 글자색이 상속돼 흐려지므로 color 를 명시한다.
  const TH = 'style="padding:10px 8px;border-bottom:2px solid #333;text-align:left;font-weight:700;color:#111;"';
  const TD = 'style="padding:9px 8px;border-bottom:1px solid #e3e6ea;color:#222;"';
  const BOX = 'style="background:#f6f8fa;border-left:4px solid #d81f26;padding:14px 16px;margin:20px 0;border-radius:4px;color:#222;"';

  /** 막대 시각화 한 줄 */
  const bar = (label: string, val: string, pct: number, color: string) => `
    <div style="display:flex;align-items:center;gap:10px;margin:7px 0;font-size:15px;">
      <span style="width:150px;flex:none;">${label}</span>
      <span style="flex:1;background:#eee;border-radius:3px;height:20px;position:relative;">
        <span style="display:block;width:${Math.min(100, pct).toFixed(1)}%;background:${color};height:20px;border-radius:3px;"></span>
      </span>
      <strong style="width:76px;flex:none;text-align:right;">${val}</strong>
    </div>`;

  const content = `<article class="sb-post" style="max-width:820px;margin:0 auto;line-height:1.75;font-size:17px;">

  <p>
    스페인 일간지 <strong>마르카</strong>(MARCA)가 2026년 8월 17일 이강인의 전술적 특성을 분석한 기사를 냈습니다.
    이틀 뒤인 8월 19일, 이강인은 아틀레티코 마드리드 데뷔전에서 교체로 나와 골을 넣었습니다.
    분석이 먼저 나오고 경기가 뒤에 붙은 흔치 않은 순서라, 그 진단이 실제로 맞았는지 검증할 수 있게 됐습니다.
  </p>

  <p>
    이 글은 마르카가 짚은 항목을 <strong>스코어베이스가 보유한 이강인의 최근 1년 경기 기록 ${logs.length}경기</strong>로 하나씩 대조한 것입니다.
    대조 구간은 ${ymd(from)}부터 ${ymd(to)}까지이며, 출전 시간과 세부 지표가 모두 남아 있는 경기는 ${stat.length}경기, 합계 ${mins.toLocaleString()}분입니다.
    결론부터 말하면 마르카의 진단은 대체로 숫자와 맞았고, 한 항목에서만 갈렸습니다.
  </p>

  ${HR}

  <h2 ${H2}>한눈에 보는 결론</h2>
  <ul style="padding-left:20px;">
    <li><strong>마르카의 핵심 진단:</strong> 마무리하는 선수가 아니라 만들어 주는 선수. 드리블이 아니라 패스로 수비를 깬다</li>
    <li><strong>우리 기록의 검증:</strong> 90분당 키패스 ${n2(p90(keyPasses))}개 대 90분당 득점 ${n2(p90(goals))}개 — 창조가 마무리의 ${(p90(keyPasses) / p90(goals)).toFixed(1)}배</li>
    <li><strong>압박 속 볼 간수:</strong> 패스 성공률 ${n1(passPct)}% (${passesAcc.toLocaleString()}/${passes.toLocaleString()})</li>
    <li><strong>데뷔전 ${debut.minutes}분:</strong> ${debut.goals}골 · 슈팅 ${debut.shots}개(유효 ${debut.shotsOn}) · 평점 ${debut.rating} · 듀얼 ${debut.duelsWon}/${debut.duelsTotal} 승리</li>
    <li><strong>갈린 항목:</strong> 수비 기여 — 데뷔전은 듀얼 ${debut.duelsWon}/${debut.duelsTotal}이었지만, 직전 소속팀에서의 듀얼 승률은 ${n1(psgDuelPct)}%였습니다</li>
    <li><strong>출전 형태:</strong> 선발 ${starts}회 대 교체 ${subs}회 — 최근 1년 절반 이상이 교체 출전</li>
    <li><strong>이적료와 평가액:</strong> €${(fee / 1e6).toFixed(0)}M(약 ${eok(fee)}억 원) 대 시장가치 €${(value / 1e6).toFixed(0)}M — ${n1(premium)}% 웃돈</li>
  </ul>

  ${HR}

  <h2 ${H2}>마르카는 이강인을 어떻게 진단했나</h2>
  <p>
    마르카의 분석은 이강인을 <strong>아틀레티코의 오래된 약점을 메울 유형</strong>으로 규정했습니다.
    디에고 시메오네 감독의 팀은 강도와 압박, 전환 공격으로 경쟁해 왔지만, 상대가 물러서서 진을 치고 기다릴 때
    인내심 있게 공격을 조립하는 일에서 고전해 왔다는 것이 기사의 출발점입니다.
    왼쪽 측면은 지난겨울 아데몰라 루크먼으로 채웠고, 남은 자리가 오른쪽이었다는 맥락도 함께 제시됐습니다.
  </p>
  <p>
    분석은 이강인의 강점을 세 갈래로 정리했습니다.
    첫째, <strong>라인 사이에서 압박을 받으며 공을 받는 능력</strong>입니다. 낮은 무게중심으로 공을 지켜내고 빠르게 해법을 찾는다는 평가입니다.
    둘째, <strong>전진 패스와 최종 3분의 1 지역으로 넣는 패스의 양</strong>입니다. 축구 데이터 분석업체 드리블랩(Driblab)의 지표를 근거로 들었습니다.
    셋째, <strong>왼발 킥</strong>입니다. 크로스와 방향 전환, 중거리 슈팅, 세트피스까지 포함됩니다.
  </p>
  <p>
    동시에 한계도 분명히 적었습니다. 직접적인 득점 위협은 크지 않고, 박스를 계속 공략하거나 뒷공간으로 침투해 사는 유형이 아니라는 것입니다.
    마르카는 이를 두고 다른 선수가 마무리할 수 있도록 이점을 만들어 주는 선수라고 표현했습니다.
    수치가 좋았던 상당 부분이 <strong>점유율을 독점하는 파리 생제르맹에서 나왔다는 점</strong>도 경고로 달았습니다.
  </p>

  ${HR}

  <h2 ${H2}>검증 1. 마무리보다 창조자라는 진단은 맞았나</h2>
  <p>
    맞습니다. 우리 기록에서 이강인의 <strong>90분당 키패스는 ${n2(p90(keyPasses))}개</strong>인 반면 <strong>90분당 득점은 ${n2(p90(goals))}개</strong>였습니다.
    같은 시간을 뛰었을 때 슈팅 기회를 만들어 주는 빈도가 직접 넣는 빈도의 ${(p90(keyPasses) / p90(goals)).toFixed(1)}배라는 뜻입니다.
    ${stat.length}경기 합계로는 키패스 ${keyPasses}개에 득점 ${goals}골이었습니다.
  </p>
  <div style="margin:22px 0;">
    ${bar("90분당 키패스", `${n2(p90(keyPasses))}개`, (p90(keyPasses) / 4.5) * 100, "#1a7f37")}
    ${bar("90분당 슈팅", `${n2(p90(shots))}개`, (p90(shots) / 4.5) * 100, "#8a8f98")}
    ${bar("90분당 득점", `${n2(p90(goals))}골`, (p90(goals) / 4.5) * 100, "#c0392b")}
  </div>
  <figure style="margin:26px 0;">
    <img src="${SITE}/blog/lee-kang-in-pass-lanes-analysis.png"
         alt="이강인 전술 분석 — 오른쪽 측면 안쪽 통로에서 페널티 박스로 향하는 패스 경로를 표현한 축구 경기장 항공 이미지"
         style="width:100%;height:auto;border-radius:8px;display:block;">
    <figcaption style="font-size:14px;color:#666;margin-top:8px;text-align:center;">
      마르카는 이강인이 측면에 붙기보다 오른쪽 안쪽 통로에서 공을 받아 패스로 수비를 깬다고 분석했습니다.
    </figcaption>
  </figure>
  <p>
    이 성향은 시간이 갈수록 강해졌습니다. 2025년 경기에서 90분당 키패스가 ${n2(kpP90(y2025))}개였는데,
    2026년에는 ${n2(kpP90(y2026))}개로 올랐습니다. 출전 시간은 오히려 줄었는데 만들어 주는 빈도는 늘어난 것입니다.
    마르카가 드리블랩 지표로 지적한 방향과 우리 기록의 방향이 일치합니다.
  </p>

  ${HR}

  <h2 ${H2}>검증 2. 압박 속에서 공을 지킨다는 평가는 맞았나</h2>
  <p>
    맞습니다. 이강인의 <strong>패스 성공률은 ${n1(passPct)}%</strong>로, ${passes.toLocaleString()}회를 시도해 ${passesAcc.toLocaleString()}회를 성공했습니다.
    90분당 패스 시도는 ${n2(p90(passes))}회입니다. 공을 많이 만지면서도 정확도를 유지했다는 뜻이며,
    라인 사이에서 받아 준다는 마르카의 서술과 어긋나지 않습니다.
  </p>
  <p>
    다만 이 수치는 해석에 주의가 필요합니다. 마르카 스스로 경고했듯 이 기간 대부분은 <strong>파리 생제르맹 소속</strong>이었고,
    그 팀은 점유율을 독점하며 주변에 패스 선택지를 여러 겹으로 깔아 줍니다.
    아틀레티코에서는 공을 잡는 횟수 자체가 줄고 가까운 지원도 적어지므로, 같은 성공률이 유지될지는 이번 시즌 표본이 쌓여야 확인됩니다.
  </p>
  <p>
    드리블은 성향을 더 분명하게 보여줍니다. 이 기간 드리블 성공은 ${sum("dribbles")}회, 시도는 ${sum("dribblesAtt")}회였습니다.
    90분당 시도로 환산하면 ${n2(p90(sum("dribblesAtt")))}회에 그칩니다.
    <strong>수비를 뚫는 수단이 돌파가 아니라 패스</strong>라는 진단이 여기서도 확인됩니다.
  </p>

  ${HR}

  <h2 ${H2}>검증 3. 갈린 항목은 수비 기여였다</h2>
  <p>
    여기서는 마르카의 서술과 우리 기록이 갈립니다. 마르카는 데뷔전 리뷰에서 이강인이 <strong>다섯 번의 듀얼 중 네 번을 이겼다</strong>며
    수비적인 면이 늘 뛰어났지만 덜 주목받아 왔다고 적었습니다. 그 경기 기록은 우리 DB에서도 동일하게 확인됩니다.
    데뷔전에서 이강인은 듀얼 ${debut.duelsWon}/${debut.duelsTotal}, 태클 ${debut.tackles}회를 기록했습니다.
  </p>
  <p>
    그런데 구간을 넓히면 그림이 달라집니다. 직전 소속팀에서 뛴 ${psg.length}경기 ${psgMins.toLocaleString()}분 동안
    <strong>듀얼 승률은 ${n1(psgDuelPct)}%</strong>(${psgDuelWon}/${psgDuelTot})였고, 90분당 태클은 ${n2(psgTackleP90)}회였습니다.
    절반에 못 미치는 듀얼 승률은 수비 기여가 강점이라고 말하기에는 무리가 있는 숫자입니다.
  </p>
  <div ${BOX}>
    <strong>정리.</strong> 데뷔전의 듀얼 ${debut.duelsWon}/${debut.duelsTotal}은 ${debut.minutes}분이라는 짧은 표본에서 나온 값입니다.
    같은 지표를 1년 단위로 넓히면 ${n1(psgDuelPct)}%로 내려갑니다.
    한 경기의 인상적인 장면을 선수의 항상적 특성으로 읽으면 판단이 어긋날 수 있습니다.
  </div>

  ${HR}

  <h2 ${H2}>데뷔전 ${debut.minutes}분에 무엇이 있었나</h2>
  <p>
    이강인은 8월 19일 라리가 개막 경기에서 후반 시작 직후 투입돼 ${debut.minutes}분을 뛰었고, 아틀레티코는 말라가를 ${debut.homeScore}-${debut.awayScore}로 이겼습니다.
    마르카의 경기 기사에 따르면 첫 슈팅은 살짝 빗나갔고 두 번째는 코너킥이 됐으며, 세 번째가 박스 바깥에서 골문 상단 구석으로 들어갔습니다.
    골 직후 이강인이 호세 마리아 히메네스에게 달려간 이유도 그 기사에 나옵니다. 교체로 나가면 골을 넣을 것이라고 미리 말해 준 동료였기 때문입니다.
  </p>
  <div style="overflow-x:auto;">
  <table style="width:100%;border-collapse:collapse;font-size:15px;background:#fff;color:#222;margin:16px 0;border-radius:6px;overflow:hidden;">
    <thead><tr><th ${TH}>지표</th><th ${TH}>데뷔전 기록</th><th ${TH}>최근 1년 90분당 환산</th></tr></thead>
    <tbody>
      <tr><td ${TD}>출전 시간</td><td ${TD}>${debut.minutes}분 (교체)</td><td ${TD}>경기당 평균 ${(mins / stat.length).toFixed(0)}분</td></tr>
      <tr><td ${TD}>득점</td><td ${TD}>${debut.goals}골</td><td ${TD}>${n2(p90(goals))}골</td></tr>
      <tr><td ${TD}>슈팅 (유효)</td><td ${TD}>${debut.shots}개 (${debut.shotsOn})</td><td ${TD}>${n2(p90(shots))}개</td></tr>
      <tr><td ${TD}>키패스</td><td ${TD}>${debut.keyPasses}개</td><td ${TD}>${n2(p90(keyPasses))}개</td></tr>
      <tr><td ${TD}>패스 (성공)</td><td ${TD}>${debut.passes}회 (${debut.passesAcc})</td><td ${TD}>${n2(p90(passes))}회</td></tr>
      <tr><td ${TD}>듀얼 승리</td><td ${TD}>${debut.duelsWon}/${debut.duelsTotal}</td><td ${TD}>승률 ${n1((duelsWon / duelsTotal) * 100)}%</td></tr>
      <tr><td ${TD}>평점</td><td ${TD}>${debut.rating}</td><td ${TD}>평균 ${n2(avgRating)}</td></tr>
    </tbody>
  </table>
  </div>
  <p>
    ${debut.minutes}분 동안 슈팅 ${debut.shots}개를 시도한 것은 90분 환산 시 ${n2(((debut.shots ?? 0) / (debut.minutes || 1)) * 90)}개에 해당합니다.
    최근 1년 평균인 ${n2(p90(shots))}개의 두 배를 훌쩍 넘습니다.
    짧게 투입돼 곧바로 슈팅을 노렸다는 뜻이며, 마르카가 그 경기 제목에 저격수라는 표현을 쓴 이유이기도 합니다.
  </p>

  ${HR}

  <h2 ${H2}>그리즈만의 대체자라는 표현이 왜 어긋나는가</h2>
  <p>
    마르카는 이강인을 앙투안 그리즈만의 직접적인 후계자로 보지 않았습니다.
    창조 역할의 일부는 이어받을 수 있지만, 그리즈만이 제공하던 <strong>득점, 수비 지능, 전술적 리더십</strong>까지 한 사람이 대신할 수는 없다는 것이 기사의 판단입니다.
    기사는 이강인을 창조 전문가로, 그리즈만을 전방위형 선수로 구분했습니다.
  </p>
  <p>
    우리 기록도 이 구분을 뒷받침합니다. 최근 1년 이강인의 90분당 득점은 ${n2(p90(goals))}골입니다.
    창조 지표가 강한 만큼 마무리 지표는 뚜렷하게 낮고, 듀얼 승률도 ${n1((duelsWon / duelsTotal) * 100)}% 수준입니다.
    개인의 교체라기보다 <strong>공격 방식 자체의 변화</strong>로 봐야 한다는 마르카의 결론이 숫자와 맞습니다.
  </p>
  <p>
    실전에서의 배치도 이 해석과 맞물립니다. 마르카는 4-2-3-1이나 4-4-2에서 안으로 좁혀 들어오는 오른쪽 윙어,
    또는 최전방 뒤의 공격형 미드필더를 최적 위치로 봤습니다.
    3-5-2에서는 내려와 연결하는 세컨드 스트라이커도 가능하지만, 미드필드 3의 공격형으로 쓰려면
    주변에 회수 능력이 좋은 동료를 배치해야 한다는 조건을 달았습니다.
  </p>

  ${HR}

  <h2 ${H2}>시메오네 시스템이라는 관문</h2>
  <p>
    마르카가 가장 크게 남겨 둔 물음은 <strong>수비 부담과 체력 요구</strong>입니다.
    아틀레티코는 낮은 블록으로 오래 버티는 경기를 자주 치르고, 경기가 몸싸움과 긴 전환의 연속으로 흐를 때가 많습니다.
    이런 유형의 경기에서 이강인의 영향력이 떨어질 수 있다는 것이 기사의 지적입니다.
  </p>
  <p>
    최근 1년 출전 형태가 이 부담을 간접적으로 보여줍니다. 스코어베이스 기록에서 이강인은
    <strong>선발 ${starts}경기, 교체 ${subs}경기</strong>로 절반 이상이 교체 출전이었습니다.
    특히 챔피언스리그에서는 ${ucl.length}경기에 나섰지만 출전 시간 합계가 ${uclMins}분으로, 경기당 ${(uclMins / (ucl.length || 1)).toFixed(0)}분에 그쳤습니다.
    강도가 가장 높은 무대에서는 조커로 쓰였다는 뜻입니다.
  </p>
  <p>
    아틀레티코에서의 관건은 이 비중이 바뀌느냐입니다.
    상대가 물러서서 지키는 경기에서 이강인은 팀이 오래 찾던 해법이 될 수 있지만,
    맞불을 놓는 경기에서는 줄리아노 시메오네처럼 압박과 침투를 담당하는 유형이 먼저 선택될 가능성이 있습니다.
    마르카도 두 선수를 같은 자리의 정반대 해석으로 규정하며, 경기 성격에 따라 쓰임이 갈릴 것으로 봤습니다.
  </p>

  ${HR}

  <h2 ${H2}>이적료 ${(fee / 1e6).toFixed(0)}M유로는 비싼가</h2>
  <p>
    아틀레티코는 2026년 7월 24일 파리 생제르맹에 <strong>€${(fee / 1e6).toFixed(0)}M</strong>(약 ${eok(fee)}억 원)를 지불했습니다.
    같은 시점 스코어베이스가 집계한 이강인의 시장가치는 <strong>€${(value / 1e6).toFixed(0)}M</strong>(약 ${eok(value)}억 원)입니다.
    평가액보다 <strong>${n1(premium)}% 높은 금액</strong>을 쓴 것입니다.
  </p>
  <p>
    웃돈 자체가 이례적인 일은 아닙니다. 계약 기간이 남은 주전급 선수를 데려올 때는 평가액을 웃도는 금액이 흔합니다.
    다만 이 웃돈의 회수 여부는 창조 지표가 아니라 <strong>출전 시간</strong>에 달려 있습니다.
    최근 1년처럼 경기당 ${(mins / stat.length).toFixed(0)}분 수준에 머문다면 €${(fee / 1e6).toFixed(0)}M의 값을 하기 어렵습니다.
    선수의 이적 이력과 시장가치 변동은 <a href="${PLAYER_URL}">스코어베이스 이강인 선수 페이지</a>에서 확인할 수 있습니다.
  </p>

  ${HR}

  <h2 ${H2}>무엇을 지켜봐야 하는가</h2>
  <p>
    앞으로 확인할 지표는 세 가지로 좁혀집니다.
    첫째, <strong>90분당 키패스가 ${n2(p90(keyPasses))}개 수준을 유지하는지</strong>입니다.
    점유율이 낮은 팀에서도 같은 빈도로 기회를 만든다면 마르카의 진단이 환경과 무관한 특성이었다는 근거가 됩니다.
  </p>
  <p>
    둘째, <strong>패스 성공률 ${n1(passPct)}%의 유지 여부</strong>입니다. 지원이 줄어든 환경에서 이 수치가 얼마나 내려가는지가
    파리 생제르맹 효과의 크기를 알려 줍니다.
    셋째, <strong>선발 비중</strong>입니다. 최근 1년 선발 ${starts}회 대 교체 ${subs}회였던 비율이 뒤집히는지가
    이적료 회수의 실질적인 조건입니다.
  </p>
  <p>
    라리가 순위와 아틀레티코의 경기 일정은 <a href="${SITE}/standings/LALIGA">라리가 순위 페이지</a>에서,
    여름 이적 시장의 다른 거래는 <a href="${SITE}/transfers">이적시장 페이지</a>에서 볼 수 있습니다.
  </p>

  ${HR}

  <h2 ${H2}>자주 묻는 질문</h2>
  <p><strong>Q. 마르카는 이강인을 그리즈만의 대체자로 봤나요?</strong> 아닙니다. 마르카는 창조 역할의 일부는 이어받을 수 있지만 득점과 수비 지능, 리더십까지 대신할 수는 없다고 정리했습니다. 개인의 교체가 아니라 공격 방식의 변화로 봐야 한다는 결론이었습니다.</p>
  <p><strong>Q. 이강인의 데뷔전 기록은 어땠나요?</strong> 2026년 8월 19일 말라가전에서 교체로 ${debut.minutes}분을 뛰며 ${debut.goals}골, 슈팅 ${debut.shots}개(유효 ${debut.shotsOn}), 패스 ${debut.passes}회 중 ${debut.passesAcc}회 성공, 듀얼 ${debut.duelsWon}/${debut.duelsTotal} 승리에 평점 ${debut.rating}을 기록했습니다. 아틀레티코는 ${debut.homeScore}-${debut.awayScore}로 이겼습니다.</p>
  <p><strong>Q. 이강인은 어느 포지션에 가장 잘 맞나요?</strong> 마르카는 4-2-3-1이나 4-4-2에서 안으로 좁혀 들어오는 오른쪽 윙어, 또는 최전방 뒤 공격형 미드필더를 최적으로 봤습니다. 측면에 붙어 있기보다 안쪽 통로에서 공을 받는 유형이기 때문입니다.</p>
  <p><strong>Q. 이강인의 이적료와 시장가치는 얼마인가요?</strong> 이적료는 €${(fee / 1e6).toFixed(0)}M(약 ${eok(fee)}억 원)이고, 스코어베이스가 집계한 시장가치는 €${(value / 1e6).toFixed(0)}M(약 ${eok(value)}억 원)입니다. 평가액보다 ${n1(premium)}% 높은 금액입니다.</p>
  <p><strong>Q. 이강인의 약점으로 지적된 부분은 무엇인가요?</strong> 직접적인 득점 위협이 크지 않고, 몸싸움과 긴 전환이 반복되는 경기에서 영향력이 떨어질 수 있다는 점입니다. 우리 기록에서도 최근 1년 듀얼 승률은 ${n1((duelsWon / duelsTotal) * 100)}% 수준입니다.</p>

  ${HR}

  <p style="font-size:15px;color:#666;">
    기록 출처. 스코어베이스 경기 기록 데이터베이스(${ymd(from)}~${ymd(to)}, ${logs.length}경기 중 세부 지표 보유 ${stat.length}경기).
    전술 분석 인용 출처.
    <a href="https://www.marca.com/futbol/atletico/2026/08/17/kang-in-lee-talento-cambiar-ataque-atletico-sustituir-griezmann.html" rel="nofollow noopener" target="_blank">마르카 2026년 8월 17일자 분석</a>,
    <a href="https://www.marca.com/futbol/atletico/2026/08/20/kang-in-lee-profesion-francotirador.html" rel="nofollow noopener" target="_blank">마르카 2026년 8월 20일자 경기 기사</a>.
    시장가치 기준일 ${mv ? ymd(mv.updatedAt) : "-"}, 환율 €1 = ${EUR_KRW.toLocaleString()}원.
  </p>

</article>`;

  const title = "이강인 아틀레티코 전술 분석 — 마르카가 짚은 3가지를 45경기 기록으로 검증했다";
  const excerpt =
    `스페인 마르카가 이강인을 마무리보다 창조자로 진단했습니다. 스코어베이스가 보유한 최근 1년 ${logs.length}경기 기록으로 검증하니 90분당 키패스 ${n2(p90(keyPasses))}개에 득점 ${n2(p90(goals))}개, 패스 성공률 ${n1(passPct)}%였습니다. 데뷔전 듀얼 ${debut.duelsWon}/${debut.duelsTotal}과 이적료 ${n1(premium)}% 웃돈까지 숫자로 확인합니다.`;
  const tags = [
    "이강인 아틀레티코", "이강인 전술 분석", "이강인 마르카", "이강인 데뷔골", "이강인 포지션",
    "이강인 키패스", "이강인 이적료", "이강인 몸값", "그리즈만 대체", "시메오네 전술",
    "이강인 라리가", "아틀레티코 마드리드 영입",
  ].join(", ");

  const saved = await prisma.blog.upsert({
    where: { slug },
    update: { title, excerpt, content, tags, thumbnailUrl: `${SITE}/blog/${slug}-hero.png` },
    create: {
      slug, title, excerpt, content, tags,
      thumbnailUrl: `${SITE}/blog/${slug}-hero.png`,
    },
  });

  const plain = content.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
  console.log(`✓ 발행 #${saved.id} ${SITE}/blog/${slug}`);
  console.log(`  제목 ${title.length}자 · excerpt ${excerpt.length}자 · 본문 공백제외 ${plain.length}자`);
  await prisma.$disconnect();
}

main();
