// 쇼츠 → 자유게시판 자동 업로드 — 렌더된 MP4 를 Attachment 로 저장하고 FREE 글로 발행.
// daily-shorts.sh 5단계에서 호출. 작성자 = 매니저 계정(스코어베이스 분석팀).
//   사용: cd ~/scorebase && npx tsx --env-file=.env.local scripts/shorts/post-to-board.ts <topic> <mp4경로>
//   DRY=1 → DB insert 없이 압축·본문 미리보기만.
// 게시판 업로드 상한(4MB)에 맞춰 초과분은 ffmpeg 재인코딩(720p, 길이 기반 비트레이트 계산).
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SHORTS_DATA = "/Users/kimss/scorebase-shorts/data";
const MANAGER_EMAIL = "manager@scorebase.internal";
const MAX_BYTES = Math.floor(3.8 * 1024 * 1024); // 게시판 동영상 상한(4MB) 아래 여유치

const prisma = new PrismaClient();

function sh(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8" }).trim();
}

/** 상한 초과 시 720p 재인코딩 — 목표 크기에서 역산한 비트레이트로 1패스. */
function fitUnderCap(mp4: string): string {
  if (statSync(mp4).size <= MAX_BYTES) return mp4;
  const dur = Number(sh(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${mp4}"`));
  if (!Number.isFinite(dur) || dur <= 0) throw new Error(`ffprobe 길이 측정 실패: ${mp4}`);
  const audioK = 96;
  const videoK = Math.max(300, Math.floor((MAX_BYTES * 8) / dur / 1000) - audioK - 30); // -30k 컨테이너 여유
  const out = join(tmpdir(), `shorts-board-${Date.now()}.mp4`);
  sh(
    `ffmpeg -y -v error -i "${mp4}" -vf "scale=720:-2" -c:v libx264 -preset veryfast ` +
      `-b:v ${videoK}k -maxrate ${videoK}k -bufsize ${videoK * 2}k ` +
      `-c:a aac -b:a ${audioK}k -movflags +faststart "${out}"`,
  );
  const size = statSync(out).size;
  console.log(`  압축: ${(statSync(mp4).size / 1e6).toFixed(1)}MB → ${(size / 1e6).toFixed(1)}MB (${videoK}k)`);
  if (size > 4 * 1024 * 1024) throw new Error("압축 후에도 4MB 초과 — 영상 길이 확인 필요");
  return out;
}

async function main() {
  const [topic, mp4] = process.argv.slice(2);
  if (!topic || !mp4) {
    console.error("사용: post-to-board.ts <topic> <mp4경로>");
    process.exit(1);
  }

  // 메타 소스 — 1순위 topic JSON, 없으면(수동 주제) mp4 옆 "<이름>-유튜브.txt" 의 [제목]/[설명] 파싱
  let ytTitle: string;
  let ytDesc: string;
  const jsonPath = `${SHORTS_DATA}/${topic}.json`;
  const txtPath = mp4.replace(/\.mp4$/, "-유튜브.txt");
  if (existsSync(jsonPath)) {
    const meta = JSON.parse(readFileSync(jsonPath, "utf-8")) as {
      text: { youtube: { title: string; description: string } };
    };
    ytTitle = meta.text.youtube.title;
    ytDesc = meta.text.youtube.description;
  } else if (existsSync(txtPath)) {
    const raw = readFileSync(txtPath, "utf-8");
    const sect = (name: string) =>
      (raw.split(`[${name}]`)[1] ?? "").split(/\n\[/)[0].trim();
    ytTitle = sect("제목");
    ytDesc = sect("설명");
    if (!ytTitle || !ytDesc) throw new Error(`유튜브 txt 파싱 실패: ${txtPath}`);
  } else {
    throw new Error(`메타 없음 — ${jsonPath} 도 ${txtPath} 도 없음`);
  }
  const title = `[쇼츠] ${ytTitle}`;

  const manager = await prisma.user.findFirst({
    where: { email: MANAGER_EMAIL },
    select: { id: true },
  });
  if (!manager) throw new Error(`매니저 계정(${MANAGER_EMAIL}) 없음`);

  // 하루 1편 dedupe — 같은 제목의 FREE 글이 24h 내 있으면 skip (재실행 안전)
  const dup = await prisma.post.findFirst({
    where: {
      category: "FREE",
      authorId: manager.id,
      title,
      createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
    },
    select: { id: true },
  });
  if (dup) {
    console.log(`  이미 발행됨 — /analysis/${dup.id} (skip)`);
    return;
  }

  const fitted = fitUnderCap(mp4);
  const bytes = readFileSync(fitted);

  const content =
    `오늘의 스코어베이스 쇼츠입니다. 순위·기록은 발행 시점 DB 실측값입니다.\n\n` +
    `![쇼츠](VIDEO_URL)\n\n` +
    ytDesc +
    `\n\n마음에 들면 글 하단의 공유 버튼으로 퍼가세요.`;

  if (process.env.DRY === "1") {
    console.log(`  DRY=1 — insert 생략\n  제목: ${title}\n  영상: ${(bytes.length / 1e6).toFixed(1)}MB\n---\n${content}`);
    return;
  }

  const att = await prisma.attachment.create({
    data: { ownerId: manager.id, mime: "video/mp4", size: bytes.length, data: bytes },
    select: { id: true },
  });
  const post = await prisma.post.create({
    data: {
      authorId: manager.id,
      category: "FREE",
      title,
      content: content.replace("VIDEO_URL", `/api/file/${att.id}?v=1`),
    },
    select: { id: true },
  });
  console.log(`  ✓ 자유게시판 발행: https://www.scorebase.kr/analysis/${post.id}`);
}

main()
  .catch((e) => {
    console.error("  ✗ 게시판 업로드 실패:", (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
