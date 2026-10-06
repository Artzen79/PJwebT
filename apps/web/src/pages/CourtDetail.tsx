import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api, ok, type Slot, useMe } from '../api';
import { DateStrip } from '../components/Pickers';
import { Empty, ErrorNote, Field, LinkButton, Loading, Panel, Select, SportArt, Stars } from '../components/ui';
import { baht, bangkokDate, dateTh, hourLabel, timeRange } from '../lib/format';
import { useSlotPicker } from '../lib/pick';

const hourClass: Record<Slot['status'], string> = {
  free: 'border-turf/40 bg-turf-soft text-turf hover:border-turf',
  in_cart: 'border-mark bg-mark text-mark-ink',
  mine: 'border-turf bg-turf text-white',
  booked: 'border-line bg-sunken text-muted line-through',
  past: 'border-transparent bg-sunken/60 text-muted/60',
};

export default function CourtDetail() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? bangkokDate();
  const me = useMe().data;
  const pick = useSlotPicker();
  const [weeks, setWeeks] = useState(1);
  const court = useQuery({ queryKey: ['court', id], queryFn: () => ok(api.GET('/api/v1/courts/{id}', { params: { path: { id } } })) });
  const slots = useQuery({
    queryKey: ['availability', id, date],
    queryFn: () => ok(api.GET('/api/v1/courts/{id}/availability', { params: { path: { id }, query: { date } } })),
  });
  const reviews = useQuery({ queryKey: ['reviews', id], queryFn: () => ok(api.GET('/api/v1/courts/{id}/reviews', { params: { path: { id } } })) });

  if (court.isPending) return <Loading />;
  if (court.error) return <ErrorNote error={court.error} />;
  const c = court.data;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        <Link to="/courts" className="text-sm text-muted hover:text-ink">
          สนามทั้งหมด
        </Link>
        <SportArt icon={c.sportIcon} sportId={c.sportId} imageUrl={c.imageUrl} className="aspect-[16/9] w-full rounded-2xl" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold sm:text-4xl">{c.name}</h1>
            <p className="mt-1 text-muted">
              {c.sportIcon} {c.sportName}
            </p>
          </div>
          {me?.role === 'admin' && <LinkButton to={`/admin/catalog?edit=court-${c.id}`}>แก้ไขสนาม</LinkButton>}
        </div>
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
          {[
            [
              'ราคา',
              c.peakPricePerHour !== null && c.peakFromHour !== null
                ? `${c.pricePerHour.toLocaleString('th-TH')} / ${c.peakPricePerHour.toLocaleString('th-TH')} บาท หลัง ${hourLabel(c.peakFromHour)}`
                : `${baht(c.pricePerHour)}/ชม.`,
            ],
            ['เวลาเปิด', `${hourLabel(c.openHour)}–${hourLabel(c.closeHour)}`],
            ['รีวิว', c.rating === null ? 'ยังไม่มี' : `${c.rating} จาก ${c.reviewCount} รีวิว`],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface p-4">
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="num text-lg font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        {c.description && <p className="max-w-prose text-lg">{c.description}</p>}

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">รีวิวจากผู้ใช้</h2>
          {reviews.data?.length ? (
            <ul className="space-y-3">
              {reviews.data.map((r) => (
                <li key={r.id} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{r.userName}</span>
                    <Stars value={r.rating} />
                  </div>
                  {r.comment && <p className="mt-1">{r.comment}</p>}
                  <p className="mt-1 text-xs text-muted">{dateTh(r.createdAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="ยังไม่มีรีวิว">ใช้บริการแล้วกลับมารีวิวได้ที่หน้าการจองของคุณ</Empty>
          )}
        </section>
      </div>

      <Panel className="h-fit space-y-4 p-5 lg:sticky lg:top-20">
        <h2 className="text-xl font-semibold">เลือกเวลา</h2>
        <DateStrip value={date} days={14} onChange={(d) => setParams({ date: d }, { replace: true })} />
        <Field label="จองประจำ" hint="เพิ่มชั่วโมงเดียวกันทุกสัปดาห์ ถ้าสัปดาห์ใดไม่ว่างจะไม่เพิ่มเลย">
          <Select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            <option value={1}>ครั้งเดียว</option>
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                ทุกสัปดาห์ {n} สัปดาห์
              </option>
            ))}
          </Select>
        </Field>
        {slots.isPending ? (
          <Loading />
        ) : slots.error ? (
          <ErrorNote error={slots.error} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {slots.data.slots.map((s) => (
              <button
                key={`${s.hour}-${s.status}`}
                type="button"
                disabled={s.status !== 'free' && s.status !== 'in_cart'}
                onClick={() => pick({ courtId: c.id, courtName: c.name }, s, weeks)}
                className={`flip num rounded-lg border px-2 py-2 text-sm font-medium transition ${hourClass[s.status]}`}
                aria-label={`${timeRange(s.startAt, s.endAt)} ${s.status === 'free' ? 'ว่าง' : s.status === 'in_cart' ? 'อยู่ในตะกร้า' : 'ไม่ว่าง'}`}
              >
                {timeRange(s.startAt, s.endAt)}
                {c.peakPricePerHour !== null && <span className="block text-xs opacity-80">{baht(s.price)}</span>}
              </button>
            ))}
          </div>
        )}
        <p className="text-sm text-muted">ช่องสีเขียวว่าง กดเพื่อเพิ่มลงตะกร้า ช่องสีเหลืองอยู่ในตะกร้าแล้ว</p>
        {me && (
          <LinkButton to="/cart" variant="primary" className="w-full">
            ไปที่ตะกร้า
          </LinkButton>
        )}
      </Panel>
    </div>
  );
}
