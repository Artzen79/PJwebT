// Writes openapi.json (consumed by the web app's type generator) and lists endpoints lacking a recorded example.
import { writeFileSync } from 'node:fs';
import './app';
import { pool } from './db';
import { exampleKey, loadExamples } from './lib/examples';
import { routes } from './lib/route';
import { buildOpenApi } from './openapi';

const out = new URL('../openapi.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(buildOpenApi(), null, 2)}\n`);
const examples = loadExamples();
const missing = routes.filter((r) => (r.produces ?? 'json') === 'json' && !examples[exampleKey(r.method, r.path)]);
console.log(`openapi.json: ${routes.length} endpoints, ${missing.length} without a recorded example`);
for (const r of missing) console.log(`  - ${r.method.toUpperCase()} ${r.path}`);
await pool.end();
