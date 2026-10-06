import { fail } from './http';

// Builds "col = $2, col2 = $3" for a PATCH body; column names come from a fixed map, never from input.
export function setClause(body: Record<string, unknown>, columns: Record<string, string>, firstParam = 2) {
  const keys = Object.keys(columns).filter((k) => body[k] !== undefined);
  if (!keys.length) fail(400, 'NOTHING_TO_UPDATE', 'ไม่มีข้อมูลที่จะแก้ไข');
  return {
    set: keys.map((k, i) => `${columns[k]} = $${firstParam + i}`).join(', '),
    values: keys.map((k) => body[k]),
  };
}
