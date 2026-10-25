import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { BoardRow, Slot } from '../api';
import { baht, hourLabel, sportColor } from '../lib/format';

const statusText: Record<Slot['status'], string> = {
  free: 'ว่าง',
  in_cart: 'อยู่ในตะกร้าของคุณ',
  mine: 'การจองของคุณ',
  booked: 'มีผู้จองแล้ว',
  past: 'เลยเวลาแล้ว',
};

const cellClass: Record<Slot['status'], string> = {
  free: 'bg-turf-soft ring-1 ring-inset ring-turf/50 hover:ring-2 hover:ring-turf cursor-pointer',
  in_cart: 'bg-mark text-mark-ink cursor-pointer hover:brightness-95',
  mine: 'bg-violet text-white ring-1 ring-inset ring-line-hi',
  booked: 'cell-booked',
  past: 'bg-sunken opacity-50',
};

type Row = Pick<BoardRow, 'courtId' | 'courtName' | 'sportIcon' | 'sportId' | 'pricePerHour' | 'slots'>;

// Rows are courts, columns are hours: the whole venue's day at a glance.
// Cells mount with a staggered flip and flip again whenever their status changes (realtime).
export function SlotBoard({ rows, onPick, linkCourt }: { rows: Row[]; onPick: (row: Row, slot: Slot) => void; linkCourt?: (courtId: number) => string }) {
  const hours = rows.flatMap((r) => r.slots.map((s) => s.hour));
  const first = Math.min(...hours);
  const last = Math.max(...hours);
  const columns = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  return (
    <div className="overflow-x-auto rounded-xl border-2 border-line bg-sunken" role="grid" aria-label="ตารางช่วงเวลาว่าง">
      <div
        className="grid w-full min-w-max [grid-template-columns:minmax(7.5rem,9rem)_repeat(var(--cols),minmax(2.75rem,1fr))] sm:[grid-template-columns:minmax(11rem,16rem)_repeat(var(--cols),minmax(3.1rem,1fr))]"
        style={{ '--cols': columns.length } as CSSProperties}
      >
        <div className="sticky left-0 z-10 border-b border-line bg-sunken" />
        {columns.map((h) => (
          <div key={h} className="num border-b border-line py-2 text-center text-xs text-muted">
            {hourLabel(h)}
          </div>
        ))}
        {rows.map((row) => {
          const bySlot = new Map(row.slots.map((s) => [s.hour, s]));
          return [
            <div key={`n${row.courtId}`} className="sticky left-0 z-10 flex items-center gap-2 border-b border-line bg-sunken px-3 py-2">
              <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: sportColor(row.sportIcon, row.sportId) }} aria-hidden />
              <div className="min-w-0">
                {linkCourt ? (
                  <Link to={linkCourt(row.courtId)} className="block truncate font-medium hover:underline">
                    {row.courtName}
                  </Link>
                ) : (
                  <span className="block truncate font-medium">{row.courtName}</span>
                )}
                <span className="num text-xs text-muted">
                  {row.sportIcon} {baht(row.pricePerHour)}/ชม.
                </span>
              </div>
            </div>,
            ...columns.map((hour, col) => {
              const slot = bySlot.get(hour);
              if (!slot) return <div key={`${row.courtId}-${hour}`} className="border-b border-line" aria-hidden />;
              const clickable = slot.status === 'free' || slot.status === 'in_cart';
              return (
                <div key={`${row.courtId}-${hour}`} className="border-b border-line p-1 [perspective:400px]">
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => onPick(row, slot)}
                    aria-label={`${row.courtName} ${hourLabel(hour)} ${statusText[slot.status]}`}
                    title={`${hourLabel(hour)} ${statusText[slot.status]} ${baht(slot.price)}`}
                    className={`flip grid h-10 w-full place-items-center rounded-md text-xs font-semibold transition ${cellClass[slot.status]}`}
                    style={{ '--sport': sportColor(row.sportIcon, row.sportId), animationDelay: `${col * 18}ms` } as CSSProperties}
                    key={slot.status}
                  >
                    {slot.status === 'in_cart' ? '✓' : slot.status === 'mine' ? '★' : ''}
                  </button>
                </div>
              );
            }),
          ];
        })}
      </div>
    </div>
  );
}

export function BoardLegend() {
  const items: [Slot['status'], string][] = [
    ['free', 'ว่าง กดเพื่อจอง'],
    ['in_cart', 'อยู่ในตะกร้า (กดซ้ำเพื่อเอาออก)'],
    ['mine', 'การจองของคุณ'],
    ['booked', 'มีผู้จองแล้ว'],
    ['past', 'เลยเวลาแล้ว'],
  ];
  return (
    <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 text-sm sm:flex-wrap" aria-label="ความหมายของสี">
      {items.map(([status, label]) => (
        <li key={status} className="flex shrink-0 items-center gap-2 rounded-full bg-sunken py-1 pr-3 pl-1.5 whitespace-nowrap">
          <span className={`inline-block size-4 rounded ring-1 ring-line ${cellClass[status]}`} style={{ '--sport': '#8c82aa' } as CSSProperties} />
          {label}
        </li>
      ))}
    </ul>
  );
}
