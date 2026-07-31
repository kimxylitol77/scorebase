// heartbeat 전송 실패 로그 억제 — 봇 로그에서 실제 탐지가 묻히지 않게.
//
// 맥미니→Vercel 왕복은 단발 타임아웃이 흔한데, 실패할 때마다 찍으니 로그가 그걸로 덮였다.
// 2026-07-31 실측: 감시봇 9개의 경고 59건이 100% 이 heartbeat 실패였고 실제 사이트 탐지는
// 0건이었다. 노이즈가 신호를 가린 상태 — 단발은 삼키고 연속 실패만 알린다.
//
// heartbeat 자체의 성패는 서버가 lastAt 으로 판정하므로(끊기면 서버가 알림), 워커 쪽
// 로그를 줄여도 감시 공백은 생기지 않는다.

const THRESHOLD = 3; // 연속 이 횟수부터 로그
const REPEAT_EVERY = 20; // 이후에는 이 배수마다 한 번씩만
const RESET_AFTER_MS = 30 * 60 * 1000; // 조용했으면 새 사건으로 간주

let streak = 0;
let lastFailAt = 0;

/** heartbeat 전송 실패 1회 기록. 연속 THRESHOLD 회 이상일 때만 실제로 로그를 남긴다. */
function hbFail(message) {
  const now = Date.now();
  if (now - lastFailAt > RESET_AFTER_MS) streak = 0;
  lastFailAt = now;
  streak += 1;
  if (streak === THRESHOLD || (streak > THRESHOLD && streak % REPEAT_EVERY === 0)) {
    console.warn(`⚠️ heartbeat ${streak}회 연속 실패: ${message}`);
  }
}

module.exports = { hbFail };
