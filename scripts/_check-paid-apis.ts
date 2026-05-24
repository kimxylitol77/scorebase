// 유료 결제 API 의 valid + quota 잔여 체크.
// 각 service 의 self-status endpoint 호출.

async function fetchJson(url: string, headers: Record<string, string>, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    clearTimeout(t);
    const status = res.status;
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    return { status, body };
  } catch (e) {
    clearTimeout(t);
    return { status: 0, body: (e as Error).message };
  }
}

async function main() {
  console.log("=== 유료 API 상태 점검 ===\n");

  // 1. api-football Pro / Ultra (축구) — /status 의 requests 잔여
  const apiFootballKey = process.env.API_FOOTBALL_KEY ?? "";
  console.log("▼ api-football (Pro/Ultra)");
  if (!apiFootballKey) console.log("  ❌ API_FOOTBALL_KEY 미설정");
  else {
    const r = await fetchJson("https://v3.football.api-sports.io/status", { "x-apisports-key": apiFootballKey });
    const account = (r.body as { response?: { account?: { plan?: string }, requests?: { current?: number; limit_day?: number } } })?.response;
    console.log(`  http=${r.status} plan=${account?.account?.plan ?? "?"} requests=${account?.requests?.current ?? "?"}/${account?.requests?.limit_day ?? "?"}`);
  }

  // 2. api-sports baseball (KBO Pro)
  const apiBaseballKey = process.env.API_BASEBALL_KEY ?? "";
  console.log("\n▼ api-sports baseball (Pro)");
  if (!apiBaseballKey) console.log("  ❌ API_BASEBALL_KEY 미설정");
  else {
    const r = await fetchJson("https://v1.baseball.api-sports.io/status", { "x-apisports-key": apiBaseballKey });
    const a = (r.body as { response?: { account?: { plan?: string }, requests?: { current?: number; limit_day?: number } } })?.response;
    console.log(`  http=${r.status} plan=${a?.account?.plan ?? "?"} requests=${a?.requests?.current ?? "?"}/${a?.requests?.limit_day ?? "?"}`);
  }

  // 3. api-sports basketball (Ultra) — 같은 키 (API_FOOTBALL_KEY 공유) 보통
  console.log("\n▼ api-sports basketball (Ultra)");
  if (!apiFootballKey) console.log("  ❌ key 미설정");
  else {
    const r = await fetchJson("https://v2.nba.api-sports.io/status", { "x-apisports-key": apiFootballKey });
    const a = (r.body as { response?: { account?: { plan?: string }, requests?: { current?: number; limit_day?: number } } })?.response;
    console.log(`  http=${r.status} (NBA Ultra) plan=${a?.account?.plan ?? "?"} requests=${a?.requests?.current ?? "?"}/${a?.requests?.limit_day ?? "?"}`);
    const r2 = await fetchJson("https://v1.basketball.api-sports.io/status", { "x-apisports-key": apiFootballKey });
    const a2 = (r2.body as { response?: { account?: { plan?: string }, requests?: { current?: number; limit_day?: number } } })?.response;
    console.log(`  http=${r2.status} (Basketball v1 Ultra) plan=${a2?.account?.plan ?? "?"} requests=${a2?.requests?.current ?? "?"}/${a2?.requests?.limit_day ?? "?"}`);
  }

  // 4. BALLDONTLIE GOAT
  const bdlKey = process.env.BALLDONTLIE_KEY ?? "";
  console.log("\n▼ BALLDONTLIE (GOAT plan)");
  if (!bdlKey) console.log("  ❌ BALLDONTLIE_KEY 미설정");
  else {
    const r = await fetchJson("https://api.balldontlie.io/nba/v1/teams?per_page=1", { Authorization: bdlKey });
    console.log(`  http=${r.status} ${r.status === 200 ? "✅ 호출 정상" : "❌"} (BDL 은 status endpoint 없어서 teams 1건 fetch)`);
  }

  // 5. The Odds API Pro 5M
  const oddsKey = process.env.ODDS_API_KEY ?? "";
  console.log("\n▼ The Odds API (Pro 5M)");
  if (!oddsKey) console.log("  ❌ ODDS_API_KEY 미설정");
  else {
    const r = await fetchJson(`https://api.the-odds-api.com/v4/sports?apiKey=${oddsKey}`, {});
    // headers 에 x-requests-remaining 있음 — fetch 가 header 안 받아서 따로 fetch
    const ctrl = new AbortController();
    const res = await fetch(`https://api.the-odds-api.com/v4/sports?apiKey=${oddsKey}`, { signal: ctrl.signal });
    const remaining = res.headers.get("x-requests-remaining");
    const used = res.headers.get("x-requests-used");
    const arr = Array.isArray(r.body) ? r.body : [];
    console.log(`  http=${r.status} sports=${arr.length}개 cover, remaining=${remaining} used=${used}`);
  }

  // 6. OddsPapi
  const oddspapi = process.env.ODDSPAPI_KEY ?? "";
  console.log("\n▼ OddsPapi");
  if (!oddspapi) console.log("  ❌ ODDSPAPI_KEY 미설정");
  else {
    const r = await fetchJson(`https://api.oddspapi.io/api/v1/sports?apiKey=${oddspapi}`, {});
    console.log(`  http=${r.status} ${r.status === 200 ? "✅ 호출 정상" : "응답: " + JSON.stringify(r.body).slice(0, 100)}`);
  }

  // 7. TheSports
  const tsUser = process.env.THESPORTS_USER ?? "";
  const tsSecret = process.env.THESPORTS_SECRET ?? "";
  console.log("\n▼ TheSports");
  if (!tsUser || !tsSecret) console.log("  ❌ 미설정");
  else {
    const r = await fetchJson(
      `https://api.thesports.com/v1/football/league/list?user=${tsUser}&secret=${tsSecret}`, {});
    const code = (r.body as { code?: number })?.code;
    console.log(`  http=${r.status} api.code=${code} ${code === 0 ? "✅ 정상" : "응답: " + JSON.stringify(r.body).slice(0, 150)}`);
  }

  // 8. Anthropic
  const anthroKey = process.env.ANTHROPIC_API_KEY ?? "";
  console.log("\n▼ Anthropic (Claude)");
  if (!anthroKey) console.log("  ❌ 미설정");
  else {
    // /v1/models 호출
    const r = await fetchJson("https://api.anthropic.com/v1/models?limit=1", {
      "x-api-key": anthroKey,
      "anthropic-version": "2023-06-01",
    });
    console.log(`  http=${r.status} ${r.status === 200 ? "✅ 호출 정상" : "응답: " + JSON.stringify(r.body).slice(0, 150)}`);
  }
}

main().catch(console.error);
