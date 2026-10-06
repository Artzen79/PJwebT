import { readFileSync, writeFileSync } from 'node:fs';
import type { Request } from 'express';

// Real request/response pairs captured while the test suite runs (RECORD_EXAMPLES=1),
// shown in the API document as "ตัวอย่างการเรียกใช้" / "ตัวอย่างผลลัพธ์".
export type Example = { url: string; body?: unknown; response: unknown };

const file = new URL('../../openapi-examples.json', import.meta.url);
const recorded: Record<string, Example> = {};

export const exampleKey = (method: string, path: string) => `${method.toUpperCase()} ${path}`;

export function loadExamples(): Record<string, Example> {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

export function recordExample(key: string, req: Request, response: unknown) {
  const body = req.body && Object.keys(req.body).length ? req.body : undefined;
  recorded[key] ??= JSON.parse(JSON.stringify({ url: req.originalUrl, body, response }));
}

export function saveExamples() {
  if (Object.keys(recorded).length) writeFileSync(file, `${JSON.stringify({ ...loadExamples(), ...recorded }, null, 2)}\n`);
}
