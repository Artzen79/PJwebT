import type { Response } from 'express';

// ponytail: in-memory fan-out is enough for one server process;
// use PostgreSQL LISTEN/NOTIFY to fan out if the API ever runs as several instances.
const clients = new Set<Response>();

export function subscribe(res: Response) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  res.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

export function notifyAvailability(courtIds: number[], equipmentIds: number[]) {
  if (!courtIds.length && !equipmentIds.length) return;
  const message = `event: availability\ndata: ${JSON.stringify({ courtIds: [...new Set(courtIds)], equipmentIds: [...new Set(equipmentIds)] })}\n\n`;
  for (const res of clients) res.write(message);
}
