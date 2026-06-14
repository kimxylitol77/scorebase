import axios from "axios";

// Slack 채널 전송 모듈 — 브리핑(뉴스·경쟁사) 아카이빙용.
// 사용처: /api/internal/notify 에서 특정 source 의 알림을 슬랙 채널에도 보존(검색·기록).
// SLACK_BOT_TOKEN 미설정 시 조용히 skip — 기존 텔레그램 흐름엔 영향 없음.

export async function sendSlack(channel: string, text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.warn("[slack] SLACK_BOT_TOKEN 미설정 — 슬랙 전송 건너뜀.");
    return;
  }

  try {
    const res = await axios.post(
      "https://slack.com/api/chat.postMessage",
      { channel, text, unfurl_links: false },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        timeout: 10000,
      },
    );
    // Slack 은 HTTP 200 + {ok:false, error} 형태로 실패를 알림 → 본문 확인 필요.
    if (!res.data?.ok) {
      console.error(`[slack] 전송 실패 (${channel}): ${res.data?.error}`);
    }
  } catch (err) {
    console.error("[slack] 전송 실패:", err);
  }
}
