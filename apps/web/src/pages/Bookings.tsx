import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { api, type BookingSummary, ok } from '../api';
import { Badge, Empty, ErrorNote, LinkButton, Loading, PageHeader } from '../components/ui';
import { baht, bookingStatus, dateTimeTh } from '../lib/format';

type Status = Exclude<BookingSummary['status'], 'cart'>;
const tabs: [Status | undefined, string][] = [
  [undefined, 'ทั้งหมด'],
  ['pending_payment', 'รอชำระเงิน'],
  ['paid', 'ชำระแล้ว'],
  ['completed', 'เสร็จสิ้น'],
  ['cancelled', 'ยกเลิก'],
];

export function StatusTabs({ value, onChange }: { value: Status | undefined; onChange: (s: Status | undefined) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {tabs.map(([s, label]) => (
        <button
          key={label}
          type="button"
          role="tab"
          aria-selected={value === s}
          onClick={() => onChange(s)}
          className={`shrink-0 border-b-2 px-4 py-2 transition ${value === s ? 'border-mark font-semibold' : 'border-transparent text-muted hover:text-ink'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function BookingTable({ rows, showMember }: { rows: BookingSummary[]; showMember?: boolean }) {
  return (
    <ul className="divide-y divide-line rounded-xl border-2 border-line bg-surface">
      {rows.map((b) => (
        <li key={b.id}>
          <Link to={`/bookings/${b.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 p-4 hover:bg-sunken sm:grid-cols-[10rem_1fr_auto_auto]">
            <span className="num font-semibold">#{b.code}</span>
            <span className="text-sm text-muted sm:text-base sm:text-ink">
              {b.firstStartAt ? `ใช้บริการ ${dateTimeTh(b.firstStartAt)}` : '-'}
              {showMember && <span className="block text-sm text-muted">{b.userName}</span>}
            </span>
            <span className="num text-right">
              {baht(b.total)} <span className="text-sm text-muted">({b.itemCount} รายการ)</span>
            </span>
            <span className="text-right">
              <Badge tone={bookingStatus[b.status].tone}>{bookingStatus[b.status].label}</Badge>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Bookings() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as Status | null) ?? undefined;
  const list = useQuery({ queryKey: ['bookings', 'mine', status], queryFn: () => ok(api.GET('/api/v1/bookings', { params: { query: { status } } })) });

  return (
    <div className="space-y-5">
      <PageHeader title="การจองของฉัน" sub="ดูสถานะ ชำระเงิน และตั๋วเช็คอินของแต่ละการจอง กดรายการเพื่อดูรายละเอียด">
        <LinkButton to="/" variant="primary">
          จองสนามเพิ่ม
        </LinkButton>
      </PageHeader>
      <StatusTabs value={status} onChange={(s) => setParams(s ? { status: s } : {})} />
      {list.isPending ? (
        <Loading />
      ) : list.error ? (
        <ErrorNote error={list.error} />
      ) : list.data.length === 0 ? (
        <Empty title="ยังไม่มีการจองในหมวดนี้">
          <LinkButton to="/" variant="primary">
            ดูตารางสนามว่าง
          </LinkButton>
        </Empty>
      ) : (
        <BookingTable rows={list.data} />
      )}
    </div>
  );
}
