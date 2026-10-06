import { useQuery } from '@tanstack/react-query';
import { api, ok } from '../api';
import { addDays, bangkokDate, relativeDay, sportColor } from '../lib/format';

export function DateStrip({ value, onChange, days = 14 }: { value: string; onChange: (date: string) => void; days?: number }) {
  const today = bangkokDate();
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i));
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="เลือกวันที่">
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
              active ? 'border-ink bg-ink text-bg' : 'border-line bg-surface hover:border-ink/40'
            }`}
          >
            <span className="text-xs">{relativeDay(d)}</span>
            <span className="num text-lg font-semibold leading-tight">{Number(d.slice(8))}</span>
          </button>
        );
      })}
    </div>
  );
}

export function useSports() {
  return useQuery({ queryKey: ['sports'], queryFn: () => ok(api.GET('/api/v1/sports')), staleTime: 5 * 60_000 });
}

export function SportChips({ value, onChange }: { value: number | undefined; onChange: (sport: number | undefined) => void }) {
  const sports = useSports().data ?? [];
  const chip = (active: boolean) =>
    `flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition ${active ? 'border-ink bg-ink text-bg' : 'border-line bg-surface hover:border-ink/40'}`;
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
