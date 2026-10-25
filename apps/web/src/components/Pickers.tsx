import { useQuery } from '@tanstack/react-query';
import { api, ok, useSettings } from '../api';
import { addDays, bangkokDate, relativeDay, sportColor } from '../lib/format';

// Only the dates that can be booked (the admin sets how far ahead: 0 = today, 1 = today and tomorrow).
export function DateStrip({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const ahead = useSettings().data?.maxDaysAhead ?? 1;
  const today = bangkokDate();
  const dates = Array.from({ length: ahead + 1 }, (_, i) => addDays(today, i));
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="เลือกวันที่">
      {dates.map((d) => {
        const active = d === value;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(d)}
            className={`flex min-w-16 shrink-0 flex-col items-center rounded-xl border px-2.5 py-1.5 transition ${
              active ? 'border-mark bg-mark font-semibold text-mark-ink' : 'border-line bg-sunken hover:border-line-hi'
            }`}
          >
            <span className="text-xs">{relativeDay(d)}</span>
            <span className="num text-lg font-semibold leading-tight">{Number(d.slice(8))}</span>
          </button>
        );
      })}
      <span className="shrink-0 px-2 text-sm text-muted">
        {ahead === 0 ? 'จองได้เฉพาะวันนี้' : ahead === 1 ? 'เปิดให้จองวันนี้และพรุ่งนี้' : `จองล่วงหน้าได้ ${ahead} วัน`}
      </span>
    </div>
  );
}

export function useSports() {
  return useQuery({ queryKey: ['sports'], queryFn: () => ok(api.GET('/api/v1/sports')), staleTime: 5 * 60_000 });
}

export function SportChips({ value, onChange }: { value: number | undefined; onChange: (sport: number | undefined) => void }) {
  const sports = useSports().data ?? [];
  const chip = (active: boolean) =>
    `flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition ${active ? 'border-mark bg-mark font-semibold text-mark-ink' : 'border-line bg-sunken hover:border-line-hi'}`;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="เลือกกีฬา">
      <button type="button" role="radio" aria-checked={value === undefined} onClick={() => onChange(undefined)} className={chip(value === undefined)}>
        ทุกกีฬา
      </button>
      {sports.map((s) => (
        <button key={s.id} type="button" role="radio" aria-checked={value === s.id} onClick={() => onChange(s.id)} className={chip(value === s.id)}>
          <span className="size-2.5 rounded-full" style={{ background: sportColor(s.icon, s.id) }} aria-hidden />
          {s.icon} {s.name}
        </button>
      ))}
    </div>
  );
}
