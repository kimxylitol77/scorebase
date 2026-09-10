// 쇼츠 mp4 를 유튜브에 업로드한다 (기본 비공개). daily-shorts.sh 4.5 단계에서 호출.
// 실행: npx tsx --env-file=.env.local scripts/shorts/youtube-upload.mts <mp4> <data.json> [private|unlisted|public]
// data.json = ~/scorebase-shorts/data/<topic>.json ({ text: { youtube: { title, description, tags } } })
import { readFileSync, statSync } from "node:fs";

const [mp4, dataJson, privacy = "private"] = process.argv.slice(2);
if (!mp4 || !dataJson) throw new Error("사용법: youtube-upload.mts <mp4> <data.json> [privacy]");
const { GOOGLE_CLIENT_ID: cid, GOOGLE_CLIENT_SECRET: sec, YOUTUBE_REFRESH_TOKEN: rt } = process.env;
if (!cid || !sec || !rt) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN 필요");

const yt = JSON.parse(readFileSync(dataJson, "utf8")).text.youtube as { title: string; description: string; tags: string };
// 제목 100자 제한 · #shorts 없으면 붙인다 (세로 60초 미만이면 없어도 쇼츠 분류되지만 검색용)
let title = yt.title.trim();
if (!/#shorts/i.test(title)) title = `${title} #shorts`;
if (title.length > 100) title = title.slice(0, 92).trimEnd() + " #shorts";
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
const up = await fetch(uploadUrl, { method: "PUT", headers: { ...auth, "content-type": "video/mp4", "content-length": String(size) }, body: readFileSync(mp4) });
if (!up.ok) throw new Error(`업로드 실패 ${up.status}: ${await up.text()}`);
const v = (await up.json()) as { id: string; status?: { uploadStatus?: string; privacyStatus?: string } };
console.log(`https://youtube.com/shorts/${v.id}`);
console.error(`업로드 완료 id=${v.id} privacy=${v.status?.privacyStatus} status=${v.status?.uploadStatus} title="${title}"`);
