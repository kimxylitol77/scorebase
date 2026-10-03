import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const context = { exports: {}, require: name => {
    if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`);
    return dependencies[name];
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
const policy = load('../src/lib/predict/totostory-pick-policy.ts');
const handicapDirection = load('../src/lib/odds/hc-direction.ts');
const fixture = () => {
  const now = Date.now();
  return {
    id: 1, league: 'EPL', status: 'SCHEDULED', startTime: new Date(now + 86400000),
    homeTeam: { name: 'Home' }, awayTeam: { name: 'Away' },
    marketUpdatedAt: new Date(now - 60000), marketBookmakers: 5,
    marketHome: 0.6, marketDraw: 0.2, marketAway: 0.2,
    openingMarketHome: 0.6, openingMarketDraw: 0.2, openingMarketAway: 0.2,
    oddsHome: 1.8, oddsDraw: 4, oddsAway: 4,
    oddsHcLine: 0.5, oddsHcHome: 1.8, oddsHcAway: 1.8,
    oddsTotalLine: 2.5, oddsOver: 1.8, oddsUnder: 1.8,
    aiPredictions: ['scorebase', 'test-model'].flatMap(model => ['1X2', 'HANDICAP', 'OU'].map(market => ({
      model, market, pick: market === 'OU' ? 'OVER' : 'HOME', prob: 0.75,
      line: market === '1X2' ? null : market === 'HANDICAP' ? 0.5 : 2.5,
      predictedAt: new Date(now - 60000), reason: '최근 득실 및 홈 성적 우위',
    }))),
  };
};
async function candidates(match) {
  const route = load('../src/app/api/internal/totostory-picks/route.ts', {
    'next/server': { NextResponse: { json: value => value } },
    '@/lib/cron-auth': { isCronAuthorized: () => true },
    '@/lib/db': { prisma: { match: { findMany: async () => [match] } } },
    '@/lib/odds/hc-direction': handicapDirection,
    '@/lib/predict/gpt-scorecard-model': { GPT_SCORECARD_ACTIVE_MODEL: 'test-model', GPT_SCORECARD_LEGACY_MODELS: [], preferGptScorecardModel: () => true },
    '@/lib/predict/strong-pick': { strongPickThreshold: () => 0.65 },
    '@/lib/team-names': { teamDisplayKo: team => team.name },
    '@/lib/predict/totostory-pick-policy': policy,
  });
  return JSON.parse(JSON.stringify(await route.GET({})));
}
test('verified candidates in all three markets survive', async () => {
  const result = await candidates(fixture());
  assert.equal(result.policy.version, policy.TOTOSTORY_PICK_POLICY_VERSION);
  assert.deepEqual(result.candidates.map(p => p.market).sort(), ['1X2', 'HANDICAP', 'OU']);
});
test('stale, missing or invalid market data cannot publish any market', async () => {
  for (const change of [{ marketBookmakers: 0 }, { marketUpdatedAt: null }, { marketUpdatedAt: new Date(Date.now() - 49 * 3600000) }, { oddsHome: null, oddsHcHome: null, oddsOver: null }]) {
    assert.equal((await candidates({ ...fixture(), ...change })).candidates.length, 0);
  }
});
test('uncertain match context rejects handicaps and totals as well as match winners', async () => {
  const match = fixture();
  match.aiPredictions.find(p => p.model === 'test-model' && p.market === '1X2').reason = '선발 미발표로 정보 부족';
  assert.equal((await candidates(match)).candidates.length, 0);
});
test('missing or mismatched model and bookmaker lines reject affected markets', async () => {
  for (const change of ['model-missing', 'model-mismatch', 'bookmaker-mismatch']) {
    const match = fixture();
    if (change === 'bookmaker-mismatch') match.oddsHcLine = 1.5;
    else match.aiPredictions.find(p => p.model === 'test-model' && p.market === 'HANDICAP').line = change === 'model-missing' ? null : 1.5;
    assert.equal((await candidates(match)).candidates.some(p => p.market === 'HANDICAP'), false);
  }
});
test('existing probability and model-agreement gates are not relaxed', async () => {
  const match = fixture();
  match.aiPredictions.forEach(p => { p.prob = 0.51; });
  assert.equal((await candidates(match)).candidates.length, 0);
  const disagreement = fixture();
  disagreement.aiPredictions.filter(p => p.model === 'test-model').forEach(p => { p.pick = p.market === 'OU' ? 'UNDER' : 'AWAY'; });
  assert.equal((await candidates(disagreement)).candidates.length, 0);
});
test('away-favorite handicap odds cannot be used for a home-gives-line pick', async () => {
  const match = fixture();
  match.oddsBookmakers = { books: [{ hl: 0.5 }, { hl: 0.5 }, { hl: -0.5 }] };
  assert.equal((await candidates(match)).candidates.some(p => p.market === 'HANDICAP'), false);
});
