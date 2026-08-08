// TheSports API 프록시 — Vercel(동적 IP) 이 ts IP 화이트리스트를 넘도록 이 서버(고정 IP)가 대신 호출.
// 인증: x-ts-proxy-token 헤더 = env TS_PROXY_TOKEN. ts user/secret 은 이 서버 env 에서 주입해
// 호출자(앱)와 회선에 자격증명이 노출되지 않게 한다. GET + /v1/ 경로만 허용.
const http = require("http");
require("dotenv").config({ path: "/home/ubuntu/.env" });

const PORT = 8788;
const TOKEN = process.env.TS_PROXY_TOKEN;
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const UPSTREAM = "https://api.thesports.com";

if (!TOKEN || !TS_USER || !TS_SECRET) {
  console.error("TS_PROXY_TOKEN / THESPORTS_USER / THESPORTS_SECRET env 필요");
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    if (req.headers["x-ts-proxy-token"] !== TOKEN) {
      res.writeHead(401).end(JSON.stringify({ err: "unauthorized" }));
      return;
    }
    const url = new URL(req.url, "http://x");
    if (!url.pathname.startsWith("/v1/")) {
      res.writeHead(404).end(JSON.stringify({ err: "not found" }));
      return;
    }
    const upstream = new URL(UPSTREAM + url.pathname);
    for (const [k, v] of url.searchParams) {
      if (k === "user" || k === "secret") continue; // 호출자 자격증명 무시 — 서버 것만 사용
      upstream.searchParams.set(k, v);
    }
    upstream.searchParams.set("user", TS_USER);
    upstream.searchParams.set("secret", TS_SECRET);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    const r = await fetch(upstream, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    clearTimeout(timer);
    const body = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, { "content-type": r.headers.get("content-type") || "application/json" });
    res.end(body);
    console.log(`[${new Date().toISOString()}] ${url.pathname} ${r.status} ${body.length}b ${Date.now() - started}ms`);
  } catch (e) {
    res.writeHead(502).end(JSON.stringify({ err: String(e && e.message) }));
    console.error(`[${new Date().toISOString()}] ERR ${req.url} ${e && e.message}`);
  }
});

server.listen(PORT, () => console.log(`🛰 ts-proxy listening :${PORT}`));
