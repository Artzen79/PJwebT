import { one, query, tx } from './db';
import { getBooking, notifyBooking, release } from './lib/bookings';
import { mail } from './lib/mail';

// Housekeeping that has to happen on the clock rather than on a request.
export async function runJobs() {
  // 1. unpaid bookings past their payment window: re-checked under a row lock, a slip may have just arrived
  for (const { id } of await query(`SELECT id FROM bookings WHERE status = 'pending_payment' AND expires_at < now()`)) {
    const expired = await tx(async (db) => {
      const due = await one(`SELECT 1 FROM bookings WHERE id = $1 AND status = 'pending_payment' AND expires_at < now() FOR UPDATE`, [id], db);
      if (due) await release(id, 'expired', db);
      return Boolean(due);
    });
    if (expired) {
      const booking = await getBooking(id);
      notifyBooking(booking);
      mail.cancelled(booking, 'หมดเวลาชำระเงิน ระบบยกเลิกการจองให้อัตโนมัติ');
    }
  }

  // 2. bookings whose last item has ended
  await query(`
    UPDATE bookings b SET status = 'completed'
    WHERE b.status IN ('paid', 'checked_in')
      AND GREATEST((SELECT max(end_at) FROM booking_slots WHERE booking_id = b.id),
                   (SELECT max(end_at) FROM booking_equipment WHERE booking_id = b.id)) < now()`);

  // 3. one reminder an hour before; UPDATE ... RETURNING claims each booking exactly once
  const due = await query(`
    UPDATE bookings b SET reminder_sent_at = now()
    WHERE b.status = 'paid' AND b.reminder_sent_at IS NULL
      AND LEAST((SELECT min(start_at) FROM booking_slots WHERE booking_id = b.id),
                (SELECT min(start_at) FROM booking_equipment WHERE booking_id = b.id))
          BETWEEN now() AND now() + interval '1 hour'
    RETURNING b.id`);
  for (const { id } of due) mail.reminder(await getBooking(id));

  // 4. cart items whose time has passed can never be confirmed
  await query(`DELETE FROM booking_slots s USING bookings b WHERE b.id = s.booking_id AND b.status = 'cart' AND s.start_at < now()`);
  await query(`DELETE FROM booking_equipment e USING bookings b WHERE b.id = e.booking_id AND b.status = 'cart' AND e.start_at < now()`);
}

export function startJobs(everyMs = 60_000) {
  const tick = () => runJobs().catch((err) => console.error('jobs failed:', err));
  tick();
  return setInterval(tick, everyMs);
}
