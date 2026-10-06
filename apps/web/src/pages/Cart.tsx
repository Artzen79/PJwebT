import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorText } from '../api';
import { Badge, Button, Empty, ErrorNote, Input, LinkButton, Loading, Panel } from '../components/ui';
import { useCart, useCartActions } from '../lib/cart';
import { baht, dateTh, dayLabel, timeRange } from '../lib/format';
import { formData } from '../lib/pick';

export default function Cart() {
  const cart = useCart(true);
  const actions = useCartActions();
  const navigate = useNavigate();

  if (cart.isPending) return <Loading />;
  if (cart.error) return <ErrorNote error={cart.error} />;
  const c = cart.data;
  const count = c.slots.length + c.equipment.length;
  const anyTaken = c.slots.some((s) => s.taken);

  const confirm = () =>
    actions.confirm.mutate(undefined, {
      onSuccess: (booking) => {
        toast.success('ยืนยันการจองแล้ว กรุณาชำระเงินภายใน 15 นาที');
        navigate(`/bookings/${booking.id}`);
      },
      onError: (e) => toast.error(errorText(e)),
    });
  const clear = () => {
    if (window.confirm('ลบทุกรายการในตะกร้า?')) actions.clear.mutate(undefined, { onSuccess: () => toast('ลบตะกร้าแล้ว') });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-4xl font-bold">ตะกร้า</h1>
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line bg-sunken/50 p-5">
          <div>
            <p className="font-display text-xl font-semibold text-info">การจองเลขที่ {c.code}</p>
            <p className="text-sm text-muted">สร้างเมื่อ {dateTh(c.createdAt)}</p>
          </div>
          <p className="text-right">
            <span className="text-muted">{count} รายการ ยอดรวม </span>
            <span className="num text-2xl font-semibold">{baht(c.total)}</span>
          </p>
        </div>
        {count === 0 ? (
          <div className="p-5">
            <Empty title="ตะกร้ายังว่าง">
              <div className="flex flex-wrap justify-center gap-3">
                <LinkButton to="/" variant="primary">
                  ดูตารางสนามว่าง
                </LinkButton>
                <LinkButton to="/equipment">ยืมอุปกรณ์</LinkButton>
              </div>
            </Empty>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-sm text-muted">
                  <tr className="border-b border-line">
                    <th className="px-5 py-3 font-medium">#</th>
                    <th className="px-2 py-3 font-medium">รายการ</th>
                    <th className="px-2 py-3 font-medium">วันเวลา</th>
                    <th className="px-2 py-3 text-right font-medium">ราคา</th>
                    <th className="px-5 py-3">
                      <span className="sr-only">ลบ</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {c.slots.map((s, i) => (
                    <tr key={`s${s.id}`} className="border-b border-line last:border-0">
                      <td className="num px-5 py-3 text-muted">{i + 1}</td>
                      <td className="px-2 py-3">
                        {s.sportIcon} {s.courtName} {s.taken && <Badge tone="danger">มีคนจองไปแล้ว</Badge>}
                      </td>
                      <td className="num px-2 py-3">
                        {dayLabel(s.startAt)} {timeRange(s.startAt, s.endAt)}
                      </td>
                      <td className="num px-2 py-3 text-right">{baht(s.price)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="quiet" pending={actions.removeSlot.isPending && actions.removeSlot.variables === s.id} onClick={() => actions.removeSlot.mutate(s.id)}>
                          ลบ
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {c.equipment.map((e, i) => (
                    <tr key={`e${e.id}`} className="border-b border-line last:border-0">
                      <td className="num px-5 py-3 text-muted">{c.slots.length + i + 1}</td>
                      <td className="px-2 py-3">
                        {e.sportIcon} {e.name} × <span className="num">{e.qty}</span>
                      </td>
                      <td className="num px-2 py-3">
                        {dayLabel(e.startAt)} {timeRange(e.startAt, e.endAt)}
                      </td>
                      <td className="num px-2 py-3 text-right">{baht(e.price)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          size="sm"
                          variant="quiet"
                          pending={actions.removeEquipment.isPending && actions.removeEquipment.variables === e.id}
                          onClick={() => actions.removeEquipment.mutate(e.id)}
                        >
                          ลบ
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-4 border-t border-line p-5">
              {c.couponCode ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-turf-soft px-4 py-3">
                  <span>
                    คูปอง <span className="num font-semibold">{c.couponCode}</span>{' '}
                    {c.discount > 0 ? (
                      <span className="num">ลด {baht(c.discount)}</span>
                    ) : (
                      <span className="text-sm text-muted">ยอดยังไม่ถึงขั้นต่ำของคูปอง</span>
                    )}
                  </span>
                  <Button size="sm" variant="quiet" pending={actions.removeCoupon.isPending} onClick={() => actions.removeCoupon.mutate()}>
                    เอาคูปองออก
                  </Button>
                </div>
              ) : (
                <form
                  className="flex max-w-md gap-2"
                  onSubmit={(e) => {
                    const code = String(formData(e).get('code')).trim();
                    if (code) actions.applyCoupon.mutate(code, { onSuccess: () => toast.success('ใช้คูปองแล้ว'), onError: (err) => toast.error(errorText(err)) });
                  }}
                >
                  <Input name="code" placeholder="รหัสคูปอง" aria-label="รหัสคูปอง" className="uppercase" />
                  <Button type="submit" pending={actions.applyCoupon.isPending}>
                    ใช้คูปอง
                  </Button>
                </form>
              )}
              {c.discount > 0 && (
                <dl className="num ml-auto grid max-w-xs grid-cols-2 gap-y-1 text-right">
                  <dt className="text-muted">ยอดก่อนส่วนลด</dt>
                  <dd>{baht(c.subtotal)}</dd>
                  <dt className="text-muted">ส่วนลด</dt>
                  <dd>−{baht(c.discount)}</dd>
                  <dt className="font-semibold">ยอดชำระ</dt>
                  <dd className="font-semibold">{baht(c.total)}</dd>
                </dl>
              )}
              {c.depositTotal > 0 && <p className="text-sm text-muted">มัดจำอุปกรณ์ {baht(c.depositTotal)} จ่ายที่เคาน์เตอร์ตอนรับของ และได้คืนเมื่อคืนอุปกรณ์</p>}
              {anyTaken && <ErrorNote error="มีช่วงเวลาที่คนอื่นจองไปแล้ว กรุณาลบออกก่อนยืนยัน" />}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="danger" onClick={clear} pending={actions.clear.isPending}>
                  ลบตะกร้า
                </Button>
                <Button variant="primary" size="lg" onClick={confirm} pending={actions.confirm.isPending} disabled={anyTaken}>
                  ยืนยันการจอง
                </Button>
              </div>
              <p className="text-sm text-muted">หลังยืนยันจะแก้ไขรายการไม่ได้ และต้องชำระเงินภายใน 15 นาที</p>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
