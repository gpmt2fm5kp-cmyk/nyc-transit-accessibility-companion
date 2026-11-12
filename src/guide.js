import { readFileSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { get_station_accessibility, demonstrationFor } from './station-tools.js';

const systemPrompt = readFileSync(new URL('../system.md', import.meta.url), 'utf8');
export const answerSchema = z.object({ answer: z.string().trim().min(1).max(1600), canConfirm: z.boolean(), nextStep: z.string().trim().min(1).max(400) }).strict();
export const askSchema = z.object({
  stationId: z.string().min(1).max(80),
  question: z.string().trim().min(1).max(600),
  dataMode: z.enum(['snapshot', 'demonstration']).default('snapshot'),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(1800) }).strict()).max(6).default([]),
}).strict();
export async function generateAnswer({ record, question, history, demo }) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const result = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: JSON.stringify({
      trustedContext: { selectedStation: record.station.stationId, dataMode: demo ? 'demonstration' : 'snapshot', stationToolResult: { record }, demonstration: demo || null },
      untrustedConversation: history,
      untrustedQuestion: question,
    }) }] }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseJsonSchema: z.toJSONSchema(answerSchema),
      temperature: 0.2,
      ...(model === 'gemini-3.5-flash-lite' ? { thinkingConfig: { thinkingLevel: 'MINIMAL' } } : {}),
      maxOutputTokens: 1200,
      httpOptions: { timeout: 22000, retryOptions: { attempts: 1 } },
    },
  });
  return { output: answerSchema.parse(JSON.parse(result.text || '')), usage: result.usageMetadata?.totalTokenCount ?? null };
}
export async function askGuide(input, generate = generateAnswer) {
  const parsed = askSchema.parse(input);
  const { record } = get_station_accessibility({ stationId: parsed.stationId });
  const demo = parsed.dataMode === 'demonstration' ? demonstrationFor(record) : null;
  const { output, usage } = await generate({ record, question: parsed.question, history: parsed.history, demo });
  const validated = answerSchema.parse(output);
  // Every answer carries a server-controlled limitation; the model cannot hide it.
  if (demo) validated.canConfirm = false;
  // The MVP never confirms current operating conditions, regardless of model output.
  if (/\b(now|today|currently|working|running|operating|broken|outage|live)\b/i.test(parsed.question)) validated.canConfirm = false;
  return { ...validated, stationId: parsed.stationId, dataMode: parsed.dataMode, disclosure: demo ? demo.label : 'Current elevator status has not been checked.', sources: record.sources, snapshotVerifiedAt: record.snapshotVerifiedAt, usage: { totalTokens: usage } };
}
