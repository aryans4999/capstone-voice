import { groq } from '@ai-sdk/groq';
import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { DataTools } from '@/lib/tools';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: groq('moonshotai/kimi-k2-instruct-0905'),
    system: "You are a helpful female insurance assistant. Use tools ONLY when necessary to fulfill the user's request. Do not call tools if you already have the information or if the user is just chatting.",
    messages: await convertToModelMessages(messages),
    tools: DataTools,
    maxSteps: 10,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
