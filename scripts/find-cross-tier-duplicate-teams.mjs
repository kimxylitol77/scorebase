// 리그 계열(같은 나라 1·2·3부) 안에서 이름이 같은 Team 중복 탐지 — read-only
//
// 왜: 승격·강등 때 같은 팀이 새 리그 라벨로 새 row 를 얻어 두 개가 된다. 경기가 시즌별로
//   갈려 붙으므로 어느 쪽도 "매치 0" 이 아니고, 리그가 달라 같은-리그 dedup(dedup-teams.mjs)
//   에도 안 걸린다. 2026-08 실측 — 울버햄프턴/Wolves · Hull City ×2 · 입스위치 ×2 등 11쌍.
//   방치하면 강등팀이 1부 화면에 남고 팀 수가 안 맞는다.
//
// Phase 판정은 참고용. 실제 병합은 반드시 눈으로 확인하고 진행할 것 —
//   normalize 가 "United"/"City" 를 지워 맨유↔맨시티, 던디↔던디Utd 를 같은 팀으로 본다.
//   병합 시 Match·TeamSourceId·TeamSeasonStatArchive·CoachTenureArchive·User.favoriteTeam
//   을 모두 canonical 로 옮기고, canonical 이 비어 있는 메타(nameKo·로고 등)는 채운 뒤
//   thesports/team-id-mapping.json 의 ourId 도 갱신한다.
//
// 실행: node --env-file=.env.local scripts/find-cross-tier-duplicate-teams.mjs
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
// 승격·강등으로 리그가 갈릴 수 있는 계열. 계열 밖 동명이인(다른 나라 같은 이름)은 안 묶는다.
const FAMILIES = {
  ENG: ["EPL","CHAMPIONSHIP","LEAGUE_ONE","LEAGUE_TWO","NATIONAL_LEAGUE"],
  GER: ["BUNDESLIGA","BUNDESLIGA_2"],
  ESP: ["LALIGA","LALIGA_2"],
  ITA: ["SERIE_A","SERIE_B"],
  FRA: ["LIGUE_1","LIGUE_2"],
  NED: ["EREDIVISIE","EREDIVISIE_2"],
  POR: ["PRIMEIRA_LIGA","PRIMEIRA_LIGA_2"],
  JPN: ["J1_LEAGUE","J2_LEAGUE","J3_LEAGUE"],
  KOR: ["K_LEAGUE_1","K_LEAGUE_2"],
  SCO: ["SPL","SCOT_CHAMPIONSHIP","SCOT_LEAGUE_ONE","SCOT_LEAGUE_TWO"],
};
const norm = (s) => s.toLowerCase()
  .replace(/\b(fc|cf|ac|afc|sc|cd|rcd|sv|ss|ssc|nk|hsv|fk|club|de|el|ca|city|hotspur|wanderers|united|utd|1846|05|07|04|1899)\b/g,"")
  .replace(/[^a-z0-9가-힣]/g,"");
async function main(){
  for(const [fam,lgs] of Object.entries(FAMILIES)){
    const teams = await prisma.team.findMany({ where:{league:{in:lgs}}, select:{id:true,name:true,league:true,externalId:true} });
    const g = new Map();
    for(const t of teams){ const k=norm(t.name); if(!k) continue; g.set(k,[...(g.get(k)??[]),t]); }
    const dups=[...g.entries()].filter(([,v])=>v.length>1);
    if(!dups.length){ console.log(`${fam}: 중복 0`); continue; }
    console.log(`\n=== ${fam} 중복 ${dups.length}그룹 ===`);
    for(const [k,v] of dups){
      const rows=[];
      for(const t of v){
        const mc = await prisma.match.count({ where:{ OR:[{homeTeamId:t.id},{awayTeamId:t.id}] } });
        const fut = await prisma.match.count({ where:{ OR:[{homeTeamId:t.id},{awayTeamId:t.id}], startTime:{gte:new Date()} } });
        const src = await prisma.teamSourceId.findMany({ where:{teamId:t.id}, select:{source:true,externalId:true} });
        rows.push({...t, mc, fut, src: src.map(s=>`${s.source}:${s.externalId}`).join(",")});
      }
      rows.sort((a,b)=>b.mc-a.mc);
      const zero = rows.filter(r=>r.mc===0).length;
      const phase = rows.filter(r=>r.mc>0).length===1 ? (zero?"1 안전삭제":"—")
        : rows[0].mc >= rows[1].mc*10 ? "2 FK이전" : "3 confirm필요";
      console.log(`  [${phase}] ${k}`);
      for(const r of rows) console.log(`     id ${String(r.id).padEnd(7)} ${r.name.padEnd(26)} ${r.league.padEnd(16)} 매치 ${String(r.mc).padStart(5)} (향후 ${r.fut}) ext=${r.externalId ?? "-"} src=[${r.src}]`);
    }
  }
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
