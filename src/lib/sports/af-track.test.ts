// api-sports 의 "HTTP 200 + errors 객체" 위장 오류 방어 테스트.
// 2026-08-14 선수 경력표 사고 — 분당 한도 응답을 빈 데이터로 삼켜 시즌이 통째로 누락된 채 캐시됐다.
import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import axios from "axios";
import { apiSportsError, ApiSportsError, attachAfTracking } from "./af-track";

test("errors 가 빈 배열이면 정상 — 객체면 오류", () => {
  assert.equal(apiSportsError({ errors: [], response: [1] }), null);
  assert.equal(apiSportsError({ errors: {}, response: [] }), null);
  assert.equal(apiSportsError({ response: [] }), null);
  assert.deepEqual(apiSportsError({ errors: { rateLimit: "Too many requests." } }), {
    kind: "rateLimit",
    message: "Too many requests.",
  });
  assert.equal(apiSportsError({ errors: { token: "invalid" } })?.kind, "token");
});

/** 지정한 횟수만큼 rateLimit 을 돌려주고 그다음부터 정상 응답하는 가짜 af 서버 */
async function fakeAf(failTimes: number) {
  let hits = 0;
  const server = http.createServer((_req, res) => {
    hits++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify(
        hits <= failTimes
          ? { errors: { rateLimit: "Too many requests." }, response: [] }
          : { errors: [], response: [{ ok: true }] },
      ),
    );
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  return { server, port, hits: () => hits };
}

test("분당 한도 응답은 재시도해서 정상 데이터를 받아낸다", async () => {
  const af = await fakeAf(1);
  try {
    const c = attachAfTracking(axios.create({ baseURL: `http://127.0.0.1:${af.port}` }), "test", {
      retryWaitsMs: [10, 20],
    });
    const { data } = await c.get("/players");
    assert.deepEqual(data.response, [{ ok: true }]);
    assert.equal(af.hits(), 2, "1회 실패 후 재시도 1회");
  } finally {
    af.server.close();
  }
});

test("재시도로도 안 풀리면 빈 데이터가 아니라 예외를 던진다", async () => {
  const af = await fakeAf(99);
  try {
    const c = attachAfTracking(axios.create({ baseURL: `http://127.0.0.1:${af.port}` }), "test", {
      retryWaitsMs: [10, 20],
    });
    await assert.rejects(() => c.get("/players"), (e: Error) => {
      assert.ok(e instanceof ApiSportsError, `ApiSportsError 여야 함: ${e.name}`);
      assert.match(e.message, /rateLimit/);
      return true;
    });
    assert.equal(af.hits(), 3, "최초 1회 + 재시도 2회");
  } finally {
    af.server.close();
  }
});

test("한도가 아닌 오류(키·플랜)는 재시도하지 않고 즉시 던진다", async () => {
  let hits = 0;
  const server = http.createServer((_req, res) => {
    hits++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ errors: { token: "invalid key" }, response: [] }));
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  try {
    const c = attachAfTracking(axios.create({ baseURL: `http://127.0.0.1:${port}` }), "test", {
      retryWaitsMs: [10, 20],
    });
    await assert.rejects(() => c.get("/players"), /token/);
    assert.equal(hits, 1);
  } finally {
    server.close();
  }
});
