// 쇼츠 mp4 를 유튜브에 업로드한다 (기본 비공개). daily-shorts.sh 4.5 단계에서 호출.
// 실행: npx tsx --env-file=.env.local scripts/shorts/youtube-upload.mts <mp4> <data.json> [private|unlisted|public]
// data.json = ~/scorebase-shorts/data/<topic>.json ({ text: { youtube: { title, description, tags } } })
import { readFileSync, statSync } from "node:fs";

const [mp4, dataJson, privacy = "private"] = process.argv.slice(2);
if (!mp4 || !dataJson) throw new Error("사용법: youtube-upload.mts <mp4> <data.json> [privacy]");
// 승인 스크립트(youtube-auth.mts)와 같은 클라이언트여야 리프레시 토큰이 통한다
const cid = process.env.YT_OAUTH_CLIENT_ID || process.env.GSC_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
const sec = process.env.YT_OAUTH_CLIENT_SECRET || process.env.GSC_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
const rt = process.env.YOUTUBE_REFRESH_TOKEN;
if (!cid || !sec || !rt) throw new Error("GSC_OAUTH_CLIENT_ID / GSC_OAUTH_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN 필요");

const yt = JSON.parse(readFileSync(dataJson, "utf8")).text.youtube as { title: string; description: string; tags: string };
// 제목 100자 제한 · #shorts 없으면 붙인다 (세로 60초 미만이면 없어도 쇼츠 분류되지만 검색용)
let title = yt.title.trim();
// 롱폼(가로) 업로드는 NO_SHORTS_TAG=1 — #shorts 를 붙이면 쇼츠 피드로 오분류될 수 있다
if (!/#shorts/i.test(title) && process.env.NO_SHORTS_TAG !== "1") title = `${title} #shorts`;
if (title.length > 100) title = process.env.NO_SHORTS_TAG === "1" ? title.slice(0, 100).trimEnd() : title.slice(0, 92).trimEnd() + " #shorts";
const tags = yt.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 30);

const tok = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ client_id: cid, client_secret: sec, refresh_token: rt, grant_type: "refresh_token" }),
}).then((r) => r.json() as Promise<{ access_token?: string; error?: string; error_description?: string }>);
if (!tok.access_token) throw new Error(`액세스 토큰 실패: ${tok.error} ${tok.error_description ?? ""}`);
const auth = { authorization: `Bearer ${tok.access_token}` };

const size = statSync(mp4).size;
const meta = {
  snippet: { title, description: yt.description, tags, categoryId: "17", defaultLanguage: "ko", defaultAudioLanguage: "ko" },
  status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
};
const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
  method: "POST",
  headers: { ...auth, "content-type": "application/json; charset=UTF-8", "x-upload-content-length": String(size), "x-upload-content-type": "video/mp4" },
  body: JSON.stringify(meta),
});
if (!init.ok) throw new Error(`업로드 세션 실패 ${init.status}: ${await init.text()}`);
const uploadUrl = init.headers.get("location");
if (!uploadUrl) throw new Error("업로드 URL 없음");
// 본문 PUT 은 08:00 노트북 wake 직후 Wi-Fi 가 흔들려 EPIPE 로 끊긴다(09-13·14 실측: 세션만 생기고 바이트 0 →
// 유튜브에 "곧 처리" 좀비 영상). 끊기면 세션 상태를 물어 받은 오프셋부터 이어 올린다(resumable), 최대 6회.
const buf = readFileSync(mp4);
type Uploaded = { id: string; status?: { uploadStatus?: string; privacyStatus?: string } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const offsetFromRange = (range: string | null) => (range ? Number(range.split("-")[1]) + 1 : 0);
async function putResumable(): Promise<Uploaded> {
  let offset = 0;
  let lastErr = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(uploadUrl!, {
        method: "PUT",
        headers: { ...auth, "content-type": "video/mp4", "content-length": String(size - offset), ...(offset ? { "content-range": `bytes ${offset}-${size - 1}/${size}` } : {}) },
        body: buf.subarray(offset),
      });
      if (res.ok) return (await res.json()) as Uploaded;
      if (res.status === 308) { offset = offsetFromRange(res.headers.get("range")); lastErr = "308 partial"; continue; }
      if (res.status >= 500 || res.status === 429) { lastErr = `${res.status}`; await sleep(5000 * (attempt + 1)); continue; }
      throw new Error(`업로드 실패 ${res.status}: ${await res.text()}`);
    } catch (e) {
      lastErr = (e as Error).message;
      await sleep(5000 * (attempt + 1));
      // 세션에 얼마나 도착했는지 조회 → 그 지점부터 재개
      try {
        const st = await fetch(uploadUrl!, { method: "PUT", headers: { ...auth, "content-length": "0", "content-range": `bytes */${size}` } });
        if (st.ok) return (await st.json()) as Uploaded;
        if (st.status === 308) offset = offsetFromRange(st.headers.get("range"));
      } catch { /* 상태 조회도 실패 — 다음 시도에서 처음부터 */ }
      console.error(`  재시도 ${attempt + 1}/6 (offset=${offset}): ${lastErr.split("\n")[0].slice(0, 120)}`);
    }
  }
  throw new Error(`업로드 6회 실패: ${lastErr}`);
}
const v = await putResumable();
console.log(`https://youtube.com/shorts/${v.id}`);
console.error(`업로드 완료 id=${v.id} privacy=${v.status?.privacyStatus} status=${v.status?.uploadStatus} title="${title}"`);
