import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { api, ok } from '../api';
import { SportChips } from '../components/Pickers';
import { Empty, ErrorNote, Input, Loading, SportArt, Stars } from '../components/ui';
import { baht, hourLabel } from '../lib/format';

export default function Courts() {
  const [params, setParams] = useSearchParams();
  const sport = params.get('sport') ? Number(params.get('sport')) : undefined;
  const q = params.get('q') ?? '';
  const courts = useQuery({
    queryKey: ['courts', sport, q],
    queryFn: () => ok(api.GET('/api/v1/courts', { params: { query: { sport, q: q || undefined } } })),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl font-bold">สนามทั้งหมด</h1>
        <Input
          type="search"
          placeholder="ค้นหาชื่อสนาม"
          defaultValue={q}
          className="max-w-xs"
          onChange={(e) =>
            setParams((p) => {
              if (e.target.value) p.set('q', e.target.value);
              else p.delete('q');
              return p;
            }, { replace: true })
          }
          aria-label="ค้นหาชื่อสนาม"
        />
      </div>
      <SportChips
        value={sport}
        onChange={(s) =>
          setParams((p) => {
            if (s === undefined) p.delete('sport');
            else p.set('sport', String(s));
            return p;
          })
        }
      />
      {courts.isPending ? (
        <Loading />
      ) : courts.error ? (
        <ErrorNote error={courts.error} />
      ) : courts.data.length === 0 ? (
        <Empty title="ไม่พบสนามที่ค้นหา">ลองล้างคำค้นหรือเลือกกีฬาอื่น</Empty>
      ) : (
        <ul className="divide-y divide-line rounded-xl border-2 border-line bg-surface">
          {courts.data.map((c) => (
            <li key={c.id}>
              <Link to={`/courts/${c.id}`} className="grid grid-cols-[5.5rem_1fr] items-center gap-4 p-4 transition hover:bg-sunken sm:grid-cols-[7rem_1fr_auto]">
                <SportArt icon={c.sportIcon} sportId={c.sportId} imageUrl={c.imageUrl} className="h-20 w-full rounded-xl" />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{c.name}</h2>
                  <p className="text-sm text-muted">
                    {c.sportIcon} {c.sportName} เปิด {hourLabel(c.openHour)}–{hourLabel(c.closeHour)} น.
                  </p>
                  {c.description && <p className="mt-1 line-clamp-1 text-sm text-muted">{c.description}</p>}
                </div>
                <div className="col-start-2 flex items-center gap-4 sm:col-start-3 sm:block sm:text-right">
                  <p className="num text-xl font-semibold">
                    {baht(c.pricePerHour)}
                    <span className="text-sm font-normal text-muted">/ชม.</span>
                  </p>
                  {c.rating !== null ? (
                    <p className="text-sm">
                      <Stars value={c.rating} /> <span className="num text-muted">{c.rating}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted">ยังไม่มีรีวิว</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
