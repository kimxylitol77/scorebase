// WKBL 공식 사이트 파서 — 일정 목록·선수 박스·문자중계(2025-12-01 하나은행 60-49 BNK 썸, 실제 응답 고정).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseWkblBox, parseWkblPlays, parseWkblScheduleList } from "./wkbl-game";

const fx = (f: string) => readFileSync(new URL(`./__fixtures__/${f}`, import.meta.url), "utf8");

test("선수 박스 — 홈 하나은행 이이지마 14점, 팀 합계 60", () => {
  const teams = parseWkblBox(fx("wkbl-box-046-01-14.html"));
  const hana = teams.find((t) => t.code === "09")!;
  const p = hana.players.find((x) => x.name === "이이지마 사키")!;
  assert.deepEqual([p.points, p.fgm, p.fga, p.tpm, p.tpa, p.reb, p.min], [14, 6, 14, 2, 6, 7, "33:41"]);
  assert.equal(hana.totals?.[13], "60");
  assert.equal(teams.find((t) => t.code === "11")!.totals?.[13], "49");
});

test("문자중계 — 마지막 스코어가 최종 60-49, 득점 장면 점수 증분", () => {
  const xmls = fx("wkbl-sms-046-01-14.xml").split(/(?=<\?xml)/);
  const plays = parseWkblPlays(xmls);
  const last = plays[plays.length - 1];
  assert.deepEqual([last.homeScore, last.awayScore], [60, 49]);
  assert.equal(plays.filter((p) => p.points > 0).reduce((s, p) => s + p.points, 0), 109);
  assert.ok(plays.some((p) => p.period === "4Q"));
});

test("일정 목록 — 먼저 적힌 팀이 홈, 미래 경기는 점수·번호 없음", () => {
  const html = `<tr id="20261101" ><td>11/1</td><td><img src="/static/images/team/teamlogo_01.png"><img src="/static/images/team/teamlogo_11.png"></td><td>청주체육관</td><td>16:00</td><td></td></tr>`;
  const [r] = parseWkblScheduleList(html, "047");
  assert.deepEqual([r.externalId, r.homeCode, r.finished, r.gameNo], ["wkbl-047-20261101-01-11", "01", false, null]);
  assert.equal(r.startTime.toISOString(), "2026-11-01T07:00:00.000Z");
});
