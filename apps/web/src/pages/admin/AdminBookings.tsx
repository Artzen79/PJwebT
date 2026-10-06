import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { api, type BookingSummary, ok } from '../../api';
import { Empty, ErrorNote, Input, Loading } from '../../components/ui';
import { BookingTable, StatusTabs } from '../Bookings';

type Status = Exclude<BookingSummary['status'], 'cart'>;

export default function AdminBookings() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as Status | null) ?? undefined;
  const code = params.get('code') ?? '';
  const list = useQuery({
    queryKey: ['bookings', 'all', status, code],
    queryFn: () => ok(api.GET('/api/v1/bookings', { params: { query: { status, code: code || undefined } } })),
  });
  const set = (key: string, value?: string) =>
    setParams((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
      return p;
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">การจองทั้งหมด</h1>
        <Input type="search" placeholder="ค้นหาเลขที่การจอง" defaultValue={code} onChange={(e) => set('code', e.target.value)} className="max-w-xs" aria-label="ค้นหาเลขที่การจอง" />
      </div>
      <StatusTabs value={status} onChange={(s) => set('status', s)} />
      {list.isPending ? (
        <Loading />
      ) : list.error ? (
        <ErrorNote error={list.error} />
      ) : list.data.length === 0 ? (
        <Empty title="ไม่พบการจอง" />
      ) : (
        <BookingTable rows={list.data} showMember />
      )}
    </div>
  );
}
