import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { api, ok } from '../api';
import { SportChips } from '../components/Pickers';
import { Empty, ErrorNote, FilterRow, Input, Loading, PageHeader, SportArt, Stars } from '../components/ui';
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
    <div className="space-y-5">
      <PageHeader title="สนามทั้งหมด" sub="ดูราคา เวลาเปิด และรีวิวของแต่ละสนาม กดการ์ดเพื่อดูรายละเอียดและเลือกเวลาจอง" />

      <div className="space-y-3 rounded-xl border-2 border-line bg-sunken/60 p-3">
        <FilterRow label="ค้นหา">
          <Input
            type="search"
            placeholder="ชื่อสนาม"
            defaultValue={q}
            className="sm:max-w-xs"
            onChange={(e) =>
              setParams((p) => {
                if (e.target.value) p.set('q', e.target.value);
                else p.delete('q');
                return p;
              }, { replace: true })
            }
            aria-label="ค้นหาชื่อสนาม"
          />
        </FilterRow>
        <FilterRow label="กีฬา">
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
        </FilterRow>
      </div>

      {courts.isPending ? (
        <Loading />
      ) : courts.error ? (
        <ErrorNote error={courts.error} />
      ) : courts.data.length === 0 ? (
        <Empty title="ไม่พบสนามที่ค้นหา">ลองล้างคำค้นหรือเลือกกีฬาอื่น</Empty>
      ) : (
        <>
          <p className="label">{courts.data.length} สนาม</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {courts.data.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/courts/${c.id}`}
                  className="flex h-full flex-col overflow-hidden rounded-xl border-2 border-line bg-surface transition hover:-translate-y-0.5 hover:border-line-hi"
                >
                  <SportArt icon={c.sportIcon} sportId={c.sportId} imageUrl={c.imageUrl} className="aspect-[2/1] w-full" />
                  <div className="flex flex-1 flex-col gap-1 p-4">
                    <h2 className="text-lg">{c.name}</h2>
                    <p className="text-sm text-muted">
                      {c.sportIcon} {c.sportName} · เปิด {hourLabel(c.openHour)}–{hourLabel(c.closeHour)} น.
                    </p>
                    {c.description && <p className="line-clamp-2 text-sm text-muted">{c.description}</p>}
                    <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                      <div>
                        <p className="label">ราคา</p>
                        <p className="num text-xl font-bold">
                          {baht(c.pricePerHour)}
                          <span className="text-sm font-normal text-muted">/ชม.</span>
                        </p>
                      </div>
                      <span className="rounded-lg bg-sunken px-2.5 py-1 text-sm">
                        {c.rating !== null ? (
                          <>
                            <Stars value={c.rating} /> <span className="num">{c.rating}</span>
                          </>
                        ) : (
                          <span className="text-muted">ยังไม่มีรีวิว</span>
                        )}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
