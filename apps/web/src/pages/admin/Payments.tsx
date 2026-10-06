import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { api, errorText, ok, type Payment } from '../../api';
import { Badge, Button, Empty, ErrorNote, Field, Loading, Modal, Textarea } from '../../components/ui';
import { baht, dateTimeTh, paymentStatus } from '../../lib/format';
import { formData } from '../../lib/pick';

type Status = Payment['status'];

export default function Payments() {
  const [status, setStatus] = useState<Status>('pending');
  const [rejecting, setRejecting] = useState<Payment | null>(null);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['payments', status], queryFn: () => ok(api.GET('/api/v1/payments', { params: { query: { status } } })) });
  const review = useMutation({
    mutationFn: ({ id, ...body }: { id: number; status: 'approved' | 'rejected'; note?: string }) =>
      ok(api.PATCH('/api/v1/payments/{id}', { params: { path: { id } }, body })),
    onSuccess: (p) => {
      toast.success(p.status === 'approved' ? `อนุมัติสลิป #${p.bookingCode} แล้ว` : `ปฏิเสธสลิป #${p.bookingCode} แล้ว`);
      setRejecting(null);
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['booking', p.bookingId] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">ตรวจสลิป</h1>
        <div className="flex gap-1 rounded-xl bg-sunken p-1" role="tablist">
          {(['pending', 'approved', 'rejected'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={`rounded-lg px-3 py-1.5 text-sm ${status === s ? 'bg-surface font-semibold shadow-sm' : 'text-muted'}`}
            >
              {paymentStatus[s].label}
            </button>
          ))}
        </div>
      </div>
      {list.isPending ? (
        <Loading />
      ) : list.error ? (
        <ErrorNote error={list.error} />
      ) : list.data.length === 0 ? (
        <Empty title={status === 'pending' ? 'ไม่มีสลิปรอตรวจ' : 'ยังไม่มีรายการ'} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.data.map((p) => (
            <li key={p.id} className="grid grid-cols-[6rem_1fr] gap-4 rounded-2xl border border-line bg-surface p-4">
              <a href={p.slipUrl} target="_blank" rel="noreferrer" className="block" aria-label={`เปิดสลิปของ ${p.userName}`}>
                <img src={p.slipUrl} alt="" className="h-32 w-24 rounded-lg border border-line bg-sunken object-cover" loading="lazy" />
              </a>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/bookings/${p.bookingId}`} className="num font-semibold hover:underline">
                    #{p.bookingCode}
                  </Link>
                  <Badge tone={paymentStatus[p.status].tone}>{paymentStatus[p.status].label}</Badge>
                </div>
                <p className="truncate">{p.userName}</p>
                <p className="num text-2xl font-semibold">{baht(p.amount)}</p>
                <p className="text-sm text-muted">ส่งเมื่อ {dateTimeTh(p.createdAt)}</p>
                {p.reviewedAt && (
                  <p className="text-sm text-muted">
                    ตรวจโดย {p.reviewedByName} {dateTimeTh(p.reviewedAt)}
                  </p>
                )}
                {p.note && <p className="text-sm text-danger">{p.note}</p>}
                {p.status === 'pending' && (
                  <div className="mt-auto flex gap-2 pt-2">
                    <Button
                      variant="turf"
                      size="sm"
                      pending={review.isPending && review.variables?.id === p.id && review.variables.status === 'approved'}
                      onClick={() => review.mutate({ id: p.id, status: 'approved' })}
                    >
                      อนุมัติ
                    </Button>
                    <Button size="sm" variant="quiet-danger" onClick={() => setRejecting(p)}>
                      ปฏิเสธ
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={rejecting !== null} onClose={() => setRejecting(null)} title={`ปฏิเสธสลิป #${rejecting?.bookingCode ?? ''}`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            const f = formData(e);
            if (rejecting) review.mutate({ id: rejecting.id, status: 'rejected', note: String(f.get('note')) });
          }}
        >
          <Field label="เหตุผล" hint="สมาชิกจะเห็นข้อความนี้ในอีเมลและหน้าการจอง">
            <Textarea name="note" required maxLength={500} defaultValue="ยอดเงินในสลิปไม่ตรงกับยอดที่ต้องชำระ" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setRejecting(null)}>ยกเลิก</Button>
            <Button type="submit" variant="danger" pending={review.isPending}>
              ปฏิเสธสลิป
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
