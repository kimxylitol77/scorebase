// 임시 디버그 — production 에서 generate() 실제 동작/에러 노출. 원인 확인 후 삭제.
import { generate } from "@/lib/ai/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const env = {
    provider: process.env.AI_PROVIDER ?? "(unset)",
    hasOpenai: !!process.env.OPENAI_API_KEY,
    openaiLen: (process.env.OPENAI_API_KEY ?? "").length,
    hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
    openaiModel: process.env.OPENAI_MODEL ?? "(default)",
  };
  try {
    const out = await generate("한 단어로 'OK'만 답해.", { maxTokens: 10 });
    return Response.json({ ok: true, env, out });
  } catch (e) {
    return Response.json({
      ok: false,
      env,
      error: (e as Error).message,
      name: (e as Error).name,
    });
  }
}
