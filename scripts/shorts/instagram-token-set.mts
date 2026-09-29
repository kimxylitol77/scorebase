// 인스타그램 액세스 토큰을 화면에 표시하지 않고 입력받아 검증 후 ~/scorebase-shorts/.ig-token.json 에 저장한다(권한 600).
// 실행: npx tsx scripts/shorts/instagram-token-set.mts  → 토큰 붙여넣고 엔터 (입력 내용은 보이지 않음)
import { writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";

process.stdout.write("인스타그램 액세스 토큰 붙여넣기 (화면에 안 보임): ");
process.stdin.setRawMode?.(true);
let token = "";
await new Promise<void>((done) => {
  process.stdin.on("data", (b) => {
    for (const ch of b.toString("utf8")) {
      if (ch === "\r" || ch === "\n") return done();
      if (ch === "\u0003") process.exit(1);
      if (ch === "\u007f") token = token.slice(0, -1);
      else token += ch;
    }
  });
});
process.stdin.setRawMode?.(false);
process.stdin.pause();
token = token.trim();
console.log("");

// 짧은 토큰(1시간)이면 60일 장기 토큰으로 바꿔야 하지만 앱 시크릿이 필요하다 — 콘솔 "토큰 생성"은 장기 토큰을 바로 준다
const me = (await fetch(`https://graph.instagram.com/v23.0/me?fields=user_id,username,account_type&access_token=${token}`).then((r) => r.json())) as Record<string, any>;
if (me.error || !me.user_id) {
  console.error(`토큰 확인 실패: ${JSON.stringify(me.error ?? me)}`);
  process.exit(1);
}
const file = `${homedir()}/scorebase-shorts/.ig-token.json`;
writeFileSync(file, JSON.stringify({ token, userId: String(me.user_id), username: me.username, refreshedAt: new Date().toISOString() }, null, 2));
chmodSync(file, 0o600);
console.log(`저장 완료 — @${me.username} (${me.account_type}) → ${file}`);
