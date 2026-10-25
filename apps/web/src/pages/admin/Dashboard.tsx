import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { api, ok, type Stats } from '../../api';
import { ErrorNote, Field, Input, Loading, Panel } from '../../components/ui';
import { addDays, baht, bangkokDate, bookingStatus, hourLabel, sportColor } from '../../lib/format';

const number = (n: number) => n.toLocaleString('th-TH');

// round an axis maximum up to 1 / 2 / 5 × 10^k so ticks are clean numbers
function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= v) ?? v;
}

function Tile({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="bg-surface p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      {note && <p className="mt-1 text-sm text-muted">{note}</p>}
    </div>
  );
}

// Hover/focus tooltip shared by every bar and cell; the value leads, the label follows.
function Tip({ value, label }: { value: string; label: string }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-center whitespace-nowrap shadow-lg group-hover:block group-focus-visible:block">
      <span className="block font-semibold">{value}</span>
      <span className="block text-xs text-muted">{label}</span>
    </span>
  );
}

function RevenueColumns({ days }: { days: Stats['revenueByDay'] }) {
  const max = niceMax(Math.max(...days.map((d) => d.revenue)));
  const every = Math.ceil(days.length / 8);
  return (
    <figure className="space-y-3">
      <div className="grid grid-cols-[3.5rem_1fr]">
        <div className="relative h-56 text-right text-xs text-muted">
          {[1, 0.5, 0].map((f) => (
            <span key={f} className="num absolute right-2 -translate-y-1/2" style={{ top: `${(1 - f) * 100}%` }}>
              {number(max * f)}
            </span>
          ))}
        </div>
        <div className="relative h-56">
          {[1, 0.5, 0].map((f) => (
            <div key={f} className="absolute inset-x-0 h-px bg-line" style={{ top: `${(1 - f) * 100}%` }} aria-hidden />
          ))}
          <div className="absolute inset-0 grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((d) => (
              <button
                key={d.date}
                type="button"
                className="group relative flex h-full items-end justify-center focus:outline-none"
                aria-label={`${d.date} รายได้ ${baht(d.revenue)} ${d.bookings} การจอง`}
              >
                <span
                  className="block w-full max-w-6 rounded-t-[4px] bg-chart transition group-hover:brightness-125 group-focus-visible:outline-2 group-focus-visible:outline-mark"
                  style={{ height: `${(d.revenue / max) * 100}%` }}
                />
                <Tip value={baht(d.revenue)} label={`${Number(d.date.slice(8))}/${Number(d.date.slice(5, 7))} ${d.bookings} การจอง`} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-14 grid text-xs text-muted" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d, i) => (
          <span key={d.date} className="num text-center">
            {i % every === 0 ? `${Number(d.date.slice(8))}/${Number(d.date.slice(5, 7))}` : ''}
          </span>
        ))}
      </div>
    </figure>
  );
}

function PeakHours({ hours }: { hours: Stats['peakHours'] }) {
  const max = Math.max(...hours.map((h) => h.bookings), 1);
  return (
    <figure className="space-y-2">
      <div className="grid grid-cols-24 gap-[2px]">
        {hours.map((h) => (
          <button
            key={h.hour}
            type="button"
            className="group relative h-12 rounded-[3px] focus:outline-none focus-visible:outline-2 focus-visible:outline-mark"
            style={{ background: h.bookings ? `color-mix(in oklab, var(--chart) ${15 + (85 * h.bookings) / max}%, var(--surface))` : 'var(--sunken)' }}
            aria-label={`${hourLabel(h.hour)} ${h.bookings} ชั่วโมงที่ถูกจอง`}
          >
            <Tip value={`${h.bookings} ชม.`} label={`${hourLabel(h.hour)}–${hourLabel(h.hour + 1)}`} />
          </button>
        ))}
      </div>
      <div className="grid grid-cols-24 text-xs text-muted">
        {hours.map((h) => (
          <span key={h.hour} className="num">
            {h.hour % 6 === 0 ? hourLabel(h.hour) : ''}
          </span>
        ))}
      </div>
      <figcaption className="text-sm text-muted">สีเข้มขึ้น = มีคนจองช่วงเวลานั้นมากขึ้น</figcaption>
    </figure>
  );
}

// Ranked horizontal bars: magnitude in one hue, identity from the swatch beside the text.
function Ranked({ rows }: { rows: { key: string | number; label: string; icon: string; colorKey?: number; value: number; note: string }[] }) {
  if (!rows.length) return <p className="text-muted">ยังไม่มีข้อมูลในช่วงนี้</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: sportColor(r.icon, r.colorKey) }} aria-hidden />
              <span className="truncate">
                {r.icon} {r.label}
              </span>
            </span>
            <span className="num shrink-0 text-muted">{r.note}</span>
          </div>
          <div className="h-2.5 rounded-full bg-sunken">
            <div className="h-full rounded-full bg-linear-to-r from-prog to-prog-hi" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function TableView({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted hover:text-ink">ดูเป็นตาราง</summary>
      <table className="mt-2 w-full">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-muted">
            {head.map((h) => (
              <th key={h} className="py-1 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[0])} className="border-b border-line/60">
              {r.map((c, i) => (
                <td key={i} className="num py-1">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

const presets: [number, string][] = [
  [7, '7 วัน'],
  [30, '30 วัน'],
  [90, '90 วัน'],
];

export default function Dashboard() {
  const today = bangkokDate();
  const [range, setRange] = useState({ from: addDays(today, -29), to: today });
  const stats = useQuery({
    queryKey: ['stats', range.from, range.to],
    queryFn: () => ok(api.GET('/api/v1/admin/stats', { params: { query: range } })),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-3xl font-bold">ภาพรวม</h1>
        <div className="flex gap-1 rounded-xl bg-sunken p-1">
          {presets.map(([days, label]) => {
            const active = range.to === today && range.from === addDays(today, 1 - days);
            return (
              <button
                key={days}
                type="button"
                onClick={() => setRange({ from: addDays(today, 1 - days), to: today })}
                className={`rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-mark font-semibold text-mark-ink' : 'text-muted'}`}
                aria-pressed={active}
              >
                {label}
              </button>
            );
          })}
        </div>
        <Field label="ตั้งแต่">
          <Input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} />
        </Field>
        <Field label="ถึง">
          <Input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} />
        </Field>
      </div>

      {stats.isPending ? (
        <Loading />
      ) : stats.error ? (
        <ErrorNote error={stats.error} />
      ) : (
        <div className={`space-y-6 transition-opacity ${stats.isPlaceholderData ? 'opacity-60' : ''}`}>
          <div className="grid gap-px overflow-hidden rounded-xl border-2 border-line bg-line sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
            <div className="bg-surface p-5 sm:col-span-2 lg:col-span-1">
              <p className="text-sm text-muted">รายได้ที่อนุมัติแล้ว</p>
              <p className="mt-1 text-5xl font-semibold sm:text-6xl">{baht(stats.data.revenue)}</p>
              <p className="mt-1 text-sm text-muted">{stats.data.bookings} การจองที่ยืนยันในช่วงนี้</p>
            </div>
            <Tile
              label="สลิปรอตรวจ"
              value={stats.data.pendingPayments}
              note={
                stats.data.pendingPayments > 0 ? (
                  <Link to="/admin/payments" className="text-info hover:underline">
                    ไปตรวจสลิป
                  </Link>
                ) : (
                  'ไม่มีค้าง'
                )
              }
            />
            <Tile label="ลูกค้าใช้สนามวันนี้" value={stats.data.todayBookings} note="การจองที่ชำระแล้ว" />
            <Tile label="สมาชิกทั้งหมด" value={number(stats.data.totalMembers)} note={`ใหม่ ${stats.data.newMembers} คนในช่วงนี้`} />
          </div>

          <Panel className="space-y-4 p-5">
            <h2 className="text-lg font-semibold">รายได้รายวัน</h2>
            <RevenueColumns days={stats.data.revenueByDay} />
            <TableView
              caption="รายได้รายวัน"
              head={['วันที่', 'รายได้ (บาท)', 'การจอง']}
              rows={stats.data.revenueByDay.map((d) => [d.date, number(d.revenue), d.bookings])}
            />
          </Panel>

          <Panel className="space-y-4 p-5">
            <h2 className="text-lg font-semibold">ช่วงเวลาที่คนจองมากที่สุด</h2>
            <PeakHours hours={stats.data.peakHours} />
            <TableView caption="จำนวนชั่วโมงที่ถูกจองตามช่วงเวลา" head={['ช่วงเวลา', 'ชั่วโมงที่ถูกจอง']} rows={stats.data.peakHours.map((h) => [hourLabel(h.hour), h.bookings])} />
          </Panel>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel className="space-y-4 p-5">
              <h2 className="text-lg font-semibold">รายได้ตามกีฬา</h2>
              <Ranked
                rows={stats.data.bySport.map((s) => ({ key: s.sportId, label: s.name, icon: s.icon, colorKey: s.sportId, value: s.revenue, note: baht(s.revenue) }))}
              />
            </Panel>
            <Panel className="space-y-4 p-5">
              <h2 className="text-lg font-semibold">สนามยอดนิยม</h2>
              <Ranked rows={stats.data.topCourts.map((c) => ({ key: c.courtId, label: c.name, icon: c.sportIcon, value: c.hours, note: `${c.hours} ชม.` }))} />
            </Panel>
            <Panel className="space-y-4 p-5">
              <h2 className="text-lg font-semibold">อุปกรณ์ที่ถูกยืมบ่อย</h2>
              <Ranked rows={stats.data.topEquipment.map((e) => ({ key: e.equipmentId, label: e.name, icon: e.sportIcon, value: e.qty, note: `${e.qty} ชิ้น` }))} />
            </Panel>
          </div>

          <Panel className="p-5">
            <h2 className="mb-3 text-lg font-semibold">สถานะการจองในช่วงนี้</h2>
            <ul className="flex flex-wrap gap-x-8 gap-y-2">
              {stats.data.byStatus.map((s) => (
                <li key={s.status}>
                  <span className="text-muted">{bookingStatus[s.status].label}</span> <span className="num font-semibold">{s.count}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </div>
  );
}
