// 세로 mp4 를 인스타그램 릴스로 자동 게시한다 (Instagram API with Instagram Login). daily-shorts.sh 인스타 단계에서 호출.
// 실행: npx tsx --env-file=.env.local scripts/shorts/instagram-publish.mts <mp4> <caption.txt>
// 흐름: Vercel Blob(ig-reels/)에 잠깐 올려 공개 URL 확보 → REELS 컨테이너 생성 → 처리 완료 대기 → 게시 → 임시 파일 삭제.
// 토큰 = ~/scorebase-shorts/.ig-token.json (instagram-token-set.mts 로 저장). 60일 만료라 7일 넘으면 자동 갱신한다.
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { basename } from "node:path";

const [mp4, capFile] = process.argv.slice(2);
if (!mp4 || !capFile) throw new Error("사용법: instagram-publish.mts <mp4> <caption.txt>");

const TOKEN_FILE = `${homedir()}/scorebase-shorts/.ig-token.json`;
const API = "https://graph.instagram.com/v23.0";
type Tok = { token: string; userId: string; username: string; refreshedAt: string };

let tok: Tok;
try {
  tok = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
} catch {
  throw new Error(`인스타 토큰 파일 없음: ${TOKEN_FILE} — instagram-token-set.mts 로 먼저 저장`);
}

// 60일 장기 토큰 — 7일 지나면 갱신(갱신은 발급 24시간 이후부터 가능)
if (Date.now() - Date.parse(tok.refreshedAt) > 7 * 864e5) {
  const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${tok.token}`).then((x) => x.json() as Promise<{ access_token?: string; error?: { message: string } }>);
  if (r.access_token) {
    tok = { ...tok, token: r.access_token, refreshedAt: new Date().toISOString() };
    writeFileSync(TOKEN_FILE, JSON.stringify(tok, null, 2));
    chmodSync(TOKEN_FILE, 0o600);
    console.log("  인스타 토큰 갱신");
  } else console.warn(`  인스타 토큰 갱신 실패(기존 토큰으로 진행): ${r.error?.message}`);
}

const caption = readFileSync(capFile, "utf8").trim().slice(0, 2200);
const ig = async (path: string, init?: RequestInit) => {
  const r = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${tok.token}`, "content-type": "application/json", ...(init?.headers ?? {}) } });
  const j = (await r.json()) as Record<string, any>;
  if (!r.ok || j.error) throw new Error(`인스타 API ${path} 실패 ${r.status}: ${JSON.stringify(j.error ?? j)}`);
  return j;
};

// 1) 공개 URL 확보 — Vercel Blob 에 임시 업로드 (사이트 /api/file 은 Vercel 응답 4.5MB 한도라 원본 화질 불가)
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
if (!blobToken) throw new Error("BLOB_READ_WRITE_TOKEN 필요 (Vercel Blob 스토어 토큰)");
const blobHeaders = { authorization: `Bearer ${blobToken}`, "x-api-version": "7" };
const key = `ig-reels/${Date.now()}-${basename(mp4).replace(/[^\w.-]/g, "_")}`;
const up = await fetch(`https://blob.vercel-storage.com/${key}`, {
  method: "PUT",
  headers: { ...blobHeaders, "x-content-type": "video/mp4", "x-add-random-suffix": "1" },
  body: readFileSync(mp4),
});
const blob = (await up.json()) as { url?: string; error?: { message: string } };
if (!up.ok || !blob.url) throw new Error(`Blob 업로드 실패 ${up.status}: ${JSON.stringify(blob.error ?? blob)}`);
const videoUrl = blob.url;

try {
  // 2) 릴스 컨테이너 생성
  const c = await ig(`/${tok.userId}/media`, { method: "POST", body: JSON.stringify({ media_type: "REELS", video_url: videoUrl, caption, share_to_feed: true }) });
  // 3) 처리 완료 대기 (10초 간격, 최대 6분)
  let status = "";
  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const s = await ig(`/${c.id}?fields=status_code,status`);
    status = s.status_code;
    if (status === "FINISHED") break;
    if (status === "ERROR" || status === "EXPIRED") throw new Error(`컨테이너 처리 실패: ${s.status}`);
  }
  if (status !== "FINISHED") throw new Error(`컨테이너 처리 시간 초과 (마지막 상태 ${status})`);
  // 4) 게시
  const p = await ig(`/${tok.userId}/media_publish`, { method: "POST", body: JSON.stringify({ creation_id: c.id }) });
  const m = await ig(`/${p.id}?fields=permalink`);
  console.log(`인스타 게시 완료 id=${p.id} ${m.permalink ?? ""}`);
} finally {
  await fetch("https://blob.vercel-storage.com/delete", { method: "POST", headers: { ...blobHeaders, "content-type": "application/json" }, body: JSON.stringify({ urls: [videoUrl] }) }).catch(() => {});
}
