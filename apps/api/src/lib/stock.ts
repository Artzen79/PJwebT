import { type Db, one, pool } from '../db';

// Units of an item not held by an active rental overlapping [startAt, endAt).
// ponytail: sums every overlapping rental, so two back-to-back rentals both count against a window
// covering both; conservative (never overbooks). Compute peak concurrency per hour if that ever bites.
export async function stockFor(equipmentId: number, startAt: Date | string, endAt: Date | string, db: Db = pool) {
  return one<{ totalQty: number; available: number }>(
    `SELECT e.total_qty AS "totalQty",
       greatest(e.total_qty - COALESCE((SELECT sum(be.qty) FROM booking_equipment be
         WHERE be.equipment_id = e.id AND be.active AND be.start_at < $3 AND be.end_at > $2), 0), 0) AS available
     FROM equipment e WHERE e.id = $1 AND e.is_active`,
    [equipmentId, startAt, endAt],
    db,
  );
}
