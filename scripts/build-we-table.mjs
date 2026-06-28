// 야구 승리확률(Win Expectancy) 테이블 사전계산 — 마르코프 PA 시뮬 → 이닝 득점분포 → 게임 몬테카를로.
// 사용: node scripts/build-we-table.mjs kbo  → data/we-kbo.json
// 리그 무관 엔진: 리그별 타격 이벤트율(ENVS)만 바꿔 재생성하면 MLB·NPB 도 동일 코드로 나옴.
import { writeFileSync, mkdirSync } from "node:fs";

// 리그별 타석당 이벤트율(근사·리그평균). 나머지(1-합) = 아웃. 득점환경 차이가 곧 리그별 정확도.
const ENVS = {
  kbo: { hr: 0.027, t3: 0.005, t2: 0.048, t1: 0.155, bb: 0.095 }, // 전통적 고타선
  mlb: { hr: 0.033, t3: 0.004, t2: 0.045, t1: 0.140, bb: 0.085 },
  npb: { hr: 0.020, t3: 0.005, t2: 0.045, t1: 0.150, bb: 0.085 }, // 투고타저
};

const league = (process.argv[2] || "kbo").toLowerCase();
const E = ENVS[league];
if (!E) { console.error("알 수 없는 리그:", league, "(kbo|mlb|npb)"); process.exit(1); }
const OUT = +(1 - E.hr - E.t3 - E.t2 - E.t1 - E.bb).toFixed(4);

function drawOutcome() {
  const r = Math.random();
  let c = E.hr; if (r < c) return "hr";
  c += E.t3; if (r < c) return "t3";
  c += E.t2; if (r < c) return "t2";
  c += E.t1; if (r < c) return "t1";
  c += E.bb; if (r < c) return "bb";
  return "out";
}

// 베이스 진루 모델(표준 근사). bases=[b1,b2,b3] bool. 반환 {runs, bases, out}.
function advance(b1, b2, b3, o) {
  switch (o) {
    case "out": return { runs: 0, b1, b2, b3, out: 1 };
    case "hr": return { runs: (b1 ? 1 : 0) + (b2 ? 1 : 0) + (b3 ? 1 : 0) + 1, b1: false, b2: false, b3: false, out: 0 };
    case "t3": return { runs: (b1 ? 1 : 0) + (b2 ? 1 : 0) + (b3 ? 1 : 0), b1: false, b2: false, b3: true, out: 0 };
    case "t2": return { runs: (b3 ? 1 : 0) + (b2 ? 1 : 0), b1: false, b2: true, b3: b1, out: 0 }; // 3·2루 득점, 1루→3루, 타자 2루
    case "t1": return { runs: (b3 ? 1 : 0) + (b2 ? 1 : 0), b1: true, b2: b1, b3: false, out: 0 }; // 3·2루 득점, 1루→2루, 타자 1루
    case "bb": {
      // 밀어내기만 진루
      if (b1 && b2 && b3) return { runs: 1, b1: true, b2: true, b3: true, out: 0 };
      if (b1 && b2) return { runs: 0, b1: true, b2: true, b3: true, out: 0 };
      if (b1) return { runs: 0, b1: true, b2: true, b3, out: 0 };
      return { runs: 0, b1: true, b2, b3, out: 0 };
    }
  }
}

// 잔여 하프이닝 득점 — (bc, outs) 에서 시작해 3아웃까지.
function restOfHalf(bc, outs) {
  let b1 = !!(bc & 1), b2 = !!(bc & 2), b3 = !!(bc & 4), o = outs, runs = 0;
  while (o < 3) {
    const a = advance(b1, b2, b3, drawOutcome());
    runs += a.runs; b1 = a.b1; b2 = a.b2; b3 = a.b3; o += a.out;
  }
  return runs;
}

// 24개 base-out 잔여 득점분포(누적합으로 샘플). MAXR 까지.
const MAXR = 22;
const RESTSIMS = 80000;
const restCdf = {}; // key bc*3+outs → Float cumulative
for (let bc = 0; bc < 8; bc++) {
  for (let o = 0; o < 3; o++) {
    const hist = new Array(MAXR + 1).fill(0);
    for (let s = 0; s < RESTSIMS; s++) hist[Math.min(MAXR, restOfHalf(bc, o))]++;
    const cdf = []; let acc = 0;
    for (let k = 0; k <= MAXR; k++) { acc += hist[k] / RESTSIMS; cdf.push(acc); }
    restCdf[bc * 3 + o] = cdf;
  }
}
const fullCdf = restCdf[0]; // (bc=0, outs=0) = 풀이닝 분포

function sampleCdf(cdf) {
  const r = Math.random();
  for (let k = 0; k < cdf.length; k++) if (r <= cdf[k]) return k;
  return cdf.length - 1;
}
const sampleRest = (bc, o) => sampleCdf(restCdf[bc * 3 + o]);
const sampleInning = () => sampleCdf(fullCdf);

// 한 게임 시뮬 — 공격팀(현재 타석) 승리=1, 패=0, 무승부(연장캡)=0.5.
function simGameWin(inning0, halfBottom0, outs, bc, D) {
  let hma = halfBottom0 ? D : -D; // home - away
  let inning = inning0, isBottom = halfBottom0, first = true;
  while (true) {
    if (isBottom && inning >= 9 && hma > 0) break; // 홈 리드로 말 공격 불필요 / 끝내기 종료
    const runs = first ? sampleRest(bc, outs) : sampleInning();
    hma += isBottom ? runs : -runs;
    first = false;
    if (isBottom && inning >= 9 && hma !== 0) break; // 말 종료 후 승패 결정
    if (!isBottom) isBottom = true;
    else { isBottom = false; inning++; }
    if (inning > 18) break; // 연장 캡
  }
  const homeWin = hma > 0 ? 1 : hma < 0 ? 0 : 0.5;
  return halfBottom0 ? homeWin : 1 - homeWin;
}

const TRIALS = 3000;
const DMIN = -10, DMAX = 10;
// t[inning-1][halfIdx][outs][bc][D-DMIN]
const t = [];
for (let i = 1; i <= 9; i++) {
  const byHalf = [];
  for (let h = 0; h < 2; h++) {
    const byOut = [];
    for (let o = 0; o < 3; o++) {
      const byBc = [];
      for (let bc = 0; bc < 8; bc++) {
        const byD = [];
        for (let D = DMIN; D <= DMAX; D++) {
          let w = 0;
          for (let s = 0; s < TRIALS; s++) w += simGameWin(i, h === 1, o, bc, D);
          byD.push(+(w / TRIALS).toFixed(3));
        }
        byBc.push(byD);
      }
      byOut.push(byBc);
    }
    byHalf.push(byOut);
  }
  t.push(byHalf);
  process.stderr.write(`이닝 ${i} 완료\n`);
}

mkdirSync("data", { recursive: true });
const path = `data/we-${league}.json`;
writeFileSync(path, JSON.stringify({ league, dmin: DMIN, dmax: DMAX, trials: TRIALS, env: { ...E, out: OUT }, t }));
console.log(`저장: ${path}`);

// 정합성 점검
const lk = (i, h, o, bc, D) => t[i - 1][h][o][bc][D - DMIN];
console.log("\n[정합성 점검]");
console.log(`풀이닝 평균득점: ${fullCdf.map((c, k) => k * (c - (fullCdf[k - 1] ?? 0))).reduce((a, b) => a + b, 0).toFixed(3)} (정상 ~0.45~0.55)`);
console.log(`1회초 무사 주자없음 동점 (경기시작): ${lk(1, 0, 0, 0, 0)} (홈 약우위로 ~0.47~0.50)`);
console.log(`9회말 무사 주자없음 동점 (끝내기 찬스): ${lk(9, 1, 0, 0, 0)} (라스트라이크 우위 ~0.53~0.58)`);
console.log(`9회초 2사 주자없음 1점앞(공격): ${lk(9, 0, 2, 0, 1)} (거의 이김 ~0.82~0.90)`);
console.log(`9회말 2사 만루 1점뒤(공격): ${lk(9, 1, 2, 7, -1)} (~0.30~0.45)`);
