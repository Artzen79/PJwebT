import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { BoardRow, Slot } from '../api';
import { baht, bangkokDate, hourLabel, sportColor } from '../lib/format';

const statusText: Record<Slot['status'], string> = {
  free: 'ว่าง',
  in_cart: 'อยู่ในตะกร้าของคุณ',
  mine: 'การจองของคุณ',
  booked: 'มีผู้จองแล้ว',
  past: 'เลยเวลาแล้ว',
};

// Every cell says what it is, so the board reads without the legend:
// green = can book, gold = picked, violet = yours, grey = taken, empty = gone or closed.
const cellLabel: Record<Slot['status'], string> = {
  free: 'ว่าง',
  in_cart: '✓ เลือก',
  mine: '★ ของคุณ',
  booked: 'เต็ม',
  past: '',
};

const cellClass: Record<Slot['status'], string> = {
  free: 'bg-turf/15 text-turf ring-1 ring-inset ring-turf/60 cursor-pointer hover:bg-turf hover:text-turf-ink',
  in_cart: 'bg-mark text-mark-ink cursor-pointer hover:brightness-95',
  mine: 'bg-violet text-white',
  booked: 'bg-white/[0.07] text-muted',
  past: 'bg-white/[0.02]',
};

const bangkokHour = () => Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Bangkok' }).format(new Date()));

type Row = Pick<BoardRow, 'courtId' | 'courtName' | 'sportIcon' | 'sportId' | 'pricePerHour' | 'slots'>;

// Rows are courts, columns are hours: the whole venue's day at a glance.
// Cells mount with a staggered flip and flip again whenever their status changes (realtime).
export function SlotBoard({ rows, onPick, linkCourt }: { rows: Row[]; onPick: (row: Row, slot: Slot) => void; linkCourt?: (courtId: number) => string }) {
  const hours = rows.flatMap((r) => r.slots.map((s) => s.hour));
  const first = Math.min(...hours);
  const last = Math.max(...hours);
  const columns = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  // gold "now" marker, like the game's timeline, only when the board shows today
  const anySlot = rows[0]?.slots[0];
  const nowHour = anySlot && bangkokDate(new Date(anySlot.startAt)) === bangkokDate() ? bangkokHour() : null;
  const rowHover = 'group-hover/row:bg-[color-mix(in_oklab,var(--sunken),white_5%)]';

  return (
    <div className="overflow-x-auto rounded-xl border-2 border-line bg-sunken" role="grid" aria-label="ตารางช่วงเวลาว่าง">
      <div
        className="grid w-full min-w-max [grid-template-columns:minmax(7.5rem,9rem)_repeat(var(--cols),minmax(2.75rem,1fr))] sm:[grid-template-columns:minmax(11rem,16rem)_repeat(var(--cols),minmax(3.1rem,1fr))]"
        style={{ '--cols': columns.length } as CSSProperties}
      >
        <div role="row" className="contents">
          <div className="label sticky left-0 z-10 flex items-end border-b border-line bg-sunken px-3 py-2">สนาม / เวลา</div>
          {columns.map((h) => (
            <div key={h} className={`num border-b border-line py-2 text-center text-sm ${h === nowHour ? 'bg-mark/10' : 'text-muted'}`}>
              {h === nowHour ? <span className="rounded-full bg-mark px-2 py-0.5 font-bold text-mark-ink">{hourLabel(h)}</span> : hourLabel(h)}
            </div>
          ))}
        </div>
        {rows.map((row) => {
          const bySlot = new Map(row.slots.map((s) => [s.hour, s]));
          return (
            <div key={row.courtId} role="row" className="group/row contents">
              <div className={`sticky left-0 z-10 flex items-center gap-2 border-b border-line bg-sunken px-3 py-2 ${rowHover}`}>
                <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: sportColor(row.sportIcon, row.sportId) }} aria-hidden />
                <div className="min-w-0">
                  {linkCourt ? (
                    <Link to={linkCourt(row.courtId)} className="block truncate font-semibold hover:underline">
                      {row.courtName}
                    </Link>
                  ) : (
                    <span className="block truncate font-semibold">{row.courtName}</span>
                  )}
                  <span className="num text-xs text-muted">
                    {row.sportIcon} {baht(row.pricePerHour)}/ชม.
                  </span>
                </div>
              </div>
              {columns.map((hour, col) => {
                const slot = bySlot.get(hour);
                const now = hour === nowHour ? 'bg-mark/10' : '';
                if (!slot) return <div key={hour} className={`border-b border-line ${now} ${rowHover}`} aria-hidden />;
                const clickable = slot.status === 'free' || slot.status === 'in_cart';
                return (
                  <div key={hour} className={`border-b border-line p-1 [perspective:400px] ${now} ${rowHover}`}>
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => onPick(row, slot)}
                      aria-label={`${row.courtName} ${hourLabel(hour)} ${statusText[slot.status]}`}
                      title={`${row.courtName} ${hourLabel(hour)} ${statusText[slot.status]} ${baht(slot.price)}`}
                      className={`group/cell flip grid h-10 w-full place-items-center truncate rounded-md px-1 text-xs font-semibold transition ${cellClass[slot.status]}`}
                      style={{ animationDelay: `${col * 18}ms` }}
                      key={slot.status}
                    >
                      {slot.status === 'free' ? (
                        <>
                          <span className="group-hover/cell:hidden">ว่าง</span>
                          <span className="hidden group-hover/cell:inline">+ จอง</span>
                        </>
                      ) : (
                        cellLabel[slot.status]
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BoardLegend() {
  const items: [Slot['status'], string][] = [
    ['free', 'กดเพื่อเพิ่มลงตะกร้า'],
    ['in_cart', 'อยู่ในตะกร้า กดอีกครั้งเพื่อเอาออก'],
    ['mine', 'การจองของคุณ'],
    ['booked', 'มีคนจองแล้ว'],
    ['past', 'ช่องว่างเปล่า = เลยเวลาแล้วหรือสนามปิด'],
  ];
  return (
    <ul className="-mx-1 flex gap-x-5 gap-y-2 overflow-x-auto px-1 pb-1 text-sm sm:flex-wrap" aria-label="ความหมายของช่อง">
      {items.map(([status, label]) => (
        <li key={status} className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          <span className={`inline-grid h-7 min-w-14 place-items-center rounded-md px-2 text-xs font-semibold ${cellClass[status]} ${status === 'past' ? 'ring-1 ring-line' : ''}`} aria-hidden>
            {cellLabel[status]}
          </span>
          <span className="text-muted">{label}</span>
        </li>
      ))}
    </ul>
  );
}
