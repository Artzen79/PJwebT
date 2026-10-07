import { useQuery } from '@tanstack/react-query';
import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router';
import { api, ok } from '../../api';
import { Loading } from '../../components/ui';

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex shrink-0 items-center gap-2 border-b-2 px-4 py-2 transition ${isActive ? 'border-mark font-semibold' : 'border-transparent text-muted hover:text-ink'}`;

export default function AdminLayout() {
  const pending = useQuery({
    queryKey: ['payments', 'pending'],
    queryFn: () => ok(api.GET('/api/v1/payments', { params: { query: { status: 'pending' } } })),
    refetchInterval: 30_000,
  });
  const waiting = pending.data?.length ?? 0;
  return (
    <div className="space-y-6">
      <nav className="flex overflow-x-auto border-b border-line" aria-label="เมนูผู้ดูแลระบบ">
        <NavLink to="/admin" end className={tab}>
          ภาพรวม
        </NavLink>
        <NavLink to="/admin/payments" className={tab}>
          ตรวจสลิป
          {waiting > 0 && <span className="num grid min-w-5 place-items-center rounded-full bg-mark px-1.5 text-xs font-bold text-mark-ink">{waiting}</span>}
        </NavLink>
        <NavLink to="/admin/checkin" className={tab}>
          เช็คอิน
        </NavLink>
        <NavLink to="/admin/bookings" className={tab}>
          การจองทั้งหมด
        </NavLink>
        <NavLink to="/admin/catalog" className={tab}>
          สนาม อุปกรณ์ คูปอง
        </NavLink>
        <NavLink to="/admin/users" className={tab}>
          สมาชิก
        </NavLink>
        <NavLink to="/admin/emails" className={tab}>
          อีเมล
        </NavLink>
        <NavLink to="/admin/system" className={tab}>
          ระบบ
        </NavLink>
        <NavLink to="/admin/api" className={tab}>
          API
        </NavLink>
      </nav>
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
