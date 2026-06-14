// 매일 11:00 KST "오늘의 주요 경기" 카드(이미지+캡션)를 텔레그램으로 배달하는 봇.
// og/daily 카드를 Threads 자동발행 대신 텔레그램으로 받아 사용자가 직접 SNS(인스타·스레드)에 게시.
// launchd: com.scorebase.daily-sns-card (11:00). 1회 실행 후 종료.
const axios = require("axios");
const { SITE, TOKEN, sendPhoto, notify, escapeHtml } = require("./ai-brief-lib");

async function main() {
  // 1) 오늘 카드 캡션 + 이미지 URL (dedup 없는 preview 엔드포인트)
  const { data } = await axios.get(`${SITE}/api/internal/daily-sns-preview`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 20000,
  });
  if (!data.hasMatches) {
    console.log("[sns-card] 오늘 경기 없음 — skip");
    return;
  }

  // 2) og/daily 카드 이미지(1080×1080) fetch
  const imgRes = await axios.get(data.imageUrl, {
    responseType: "arraybuffer",
    timeout: 30000,
  });
  const buffer = Buffer.from(imgRes.data);

  // 3) 텔레그램 sendPhoto — 캡션은 SNS 에 그대로 올릴 문구(해시태그·CTA 포함)
  await sendPhoto(buffer, data.caption);
  console.log(`[sns-card] sent (${data.count}경기, ${buffer.length}B)`);
}

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error("[sns-card] error:", e.message);
    try {
      await notify({
        source: "daily-sns-card",
        severity: "WARN",
        title: "⚠️ SNS 카드 봇 실패",
        message: escapeHtml(e.message || String(e)),
      });
    } catch {}
    process.exit(1);
  });
