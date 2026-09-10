// 유튜브 업로드용 OAuth 리프레시 토큰을 1회 발급하는 로컬 스크립트 (브라우저 승인 → 토큰 출력).
// 실행: cd ~/scorebase && npx tsx --env-file=.env.local scripts/shorts/youtube-auth.mts
// 출력된 YOUTUBE_REFRESH_TOKEN 한 줄을 .env.local 에 붙여넣는다. 시크릿은 절대 출력하지 않는다.
import { createServer } from "node:http";
import { execFile } from "node:child_process";

// 로컬에는 웹 로그인 키(GOOGLE_CLIENT_*)가 없고(Vercel 전용) 서치콘솔용 데스크톱 클라이언트(GSC_OAUTH_*)만 있다.
// 데스크톱 클라이언트는 루프백 리디렉션을 등록 없이 허용하므로 그걸 유튜브 승인에도 쓴다(같은 scorebase 프로젝트).
const clientId = process.env.YT_OAUTH_CLIENT_ID || process.env.GSC_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.YT_OAUTH_CLIENT_SECRET || process.env.GSC_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error("GSC_OAUTH_CLIENT_ID / GSC_OAUTH_CLIENT_SECRET (또는 GOOGLE_CLIENT_*) 이 .env.local 에 없습니다");

const REDIRECT = process.env.YT_REDIRECT_URI || "http://localhost:8787/oauth2callback";
const port = Number(new URL(REDIRECT).port || 80);
const SCOPE = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent", // 리프레시 토큰을 반드시 받기 위해
    include_granted_scopes: "false",
  });

const server = createServer(async (req, res) => {
  const u = new URL(req.url || "/", REDIRECT);
  if (u.pathname !== new URL(REDIRECT).pathname) { res.writeHead(404).end(); return; }
  const code = u.searchParams.get("code");
  if (!code) { res.writeHead(400).end("code 없음: " + (u.searchParams.get("error") || "")); return; }
  const tok = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT, grant_type: "authorization_code" }),
  }).then((r) => r.json() as Promise<{ refresh_token?: string; access_token?: string; error?: string; error_description?: string }>);
  if (!tok.refresh_token) {
    res.writeHead(500).end("토큰 발급 실패: " + (tok.error_description || tok.error || "refresh_token 없음"));
    console.error("실패:", tok.error, tok.error_description);
    server.close(); return;
  }
  // 어느 채널에 붙었는지 확인
  const ch = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json() as Promise<{ items?: { id: string; snippet: { title: string } }[] }>);
  const title = ch.items?.[0]?.snippet.title ?? "(채널 조회 실패)";
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(`<h2>승인 완료 — 채널: ${title}</h2><p>터미널로 돌아가세요. 이 창은 닫아도 됩니다.</p>`);
  console.log(`\n승인된 채널: ${title} (${ch.items?.[0]?.id ?? "?"})`);
  console.log("\n아래 한 줄을 ~/scorebase/.env.local 에 추가하세요:\n");
  console.log(`YOUTUBE_REFRESH_TOKEN=${tok.refresh_token}\n`);
  server.close();
});
server.listen(port, () => {
  console.log(`브라우저에서 구글 로그인·승인을 진행하세요 (scorebase 채널 계정으로).\n${authUrl}\n`);
  execFile("open", [authUrl]);
});
