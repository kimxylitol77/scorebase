import { runPreview } from "../src/jobs/generate-previews";
(async () => {
  await runPreview({ league: "LOL", horizonDays: 2 });
  const { prisma } = await import("../src/lib/db");
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
