// 매일 11:00 KST "내일의 월드컵 경기" 카드(이미지+캡션)를 텔레그램으로 배달하는 봇.
// 11시에 받아 "내일 이런 월드컵 경기 있어요" 예고로 인스타·스레드에 직접 게시.
// launchd: com.scorebase.daily-sns-card (11:00). 1회 실행 후 종료.
const axios = require("axios");
const { SITE, TOKEN, sendPhoto, notify, escapeHtml } = require("./ai-brief-lib");

async function main() {
  // 내일(KST) 날짜 — 11시에 받아 다음날 경기를 미리 예고
  const dStr = new Date(Date.now() + 24 * 3600 * 1000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Seoul",
  });

  // 1) 내일 월드컵 경기 카드 캡션 + 이미지 URL (dedup 없는 preview 엔드포인트)
  const { data } = await axios.get(
    `${SITE}/api/internal/daily-sns-preview?comp=wc&t=tomorrow&d=${dStr}`,
    { headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 20000 },
  );
  if (!data.hasMatches) {
    console.log(`[sns-card] 내일(${dStr}) 월드컵 경기 없음 — skip`);
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
  console.log(`[sns-card] sent (내일 ${data.count}경기, ${buffer.length}B)`);
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
