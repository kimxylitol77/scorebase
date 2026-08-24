// /en/benchmark/data.json — 원본 예측 + 페이지에 실린 집계를 한 파일에.
//
// CSV 는 사람이 스프레드시트로 열어 보는 용도고, 이쪽은 프로그램용이다.
// 집계를 같이 실어야 "우리가 낸 숫자"와 "원본으로 다시 계산한 숫자"를
// 독자가 대조할 수 있다 — 검증 가능성이 이 벤치마크의 전부다.

import { NextResponse } from "next/server";
import {
  loadBenchmarkRows, computeBenchmark, BENCHMARK_LICENSE, BENCHMARK_ATTRIBUTION,
} from "@/lib/predict/llm-benchmark";
import { EXCLUSION_NOTE_EN } from "@/lib/predict/scorecard-eligibility";
import { toEnglishTeamName } from "@/lib/i18n/en";

export const revalidate = 3600;

export async function GET() {
  const [rows, agg] = await Promise.all([loadBenchmarkRows(), computeBenchmark()]);
  const body = {
    name: "Scorebase LLM Forecasting Benchmark",
    url: "https://www.scorebase.kr/en/benchmark",
    license: BENCHMARK_LICENSE,
    attribution: BENCHMARK_ATTRIBUTION,
    notes: {
      inclusion: "Scored forecasts only. Every row was written before its event started.",
      exclusion: EXCLUSION_NOTE_EN,
      brier: "Scored on the confidence attached to the chosen pick: (1-p)^2 if correct, p^2 if not. One-versus-rest, not a three-way multiclass Brier.",
      market: "Bookmaker prices converted to implied probability. The highest-probability outcome is taken as the market's pick and scored identically.",
      binning: "Calibration buckets are five percentage points wide, spanning 30% to 100% stated confidence (Postgres width_bucket(prob, 0.30, 1.00, 14)). Buckets with fewer than 40 forecasts are omitted from the published curve but are present in this file.",
      caveat: "Accuracy differences between models are not statistically distinguishable on this sample. Do not rank models by hit rate.",
    },
    aggregates: agg,
    predictions: rows.map((r) => ({
      ...r,
      home_team: toEnglishTeamName(r.home_team),
      away_team: toEnglishTeamName(r.away_team),
    })),
  };
  return NextResponse.json(body, {
    headers: {
      "cache-control": "public, max-age=3600, s-maxage=3600",
      "access-control-allow-origin": "*",
    },
  });
}
