import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { api, errorText, ok, useMe } from '../../api';
import { Badge, Button, Empty, ErrorNote, Field, Input, Loading, Modal, Panel, Select } from '../../components/ui';
import { baht, dateTh } from '../../lib/format';
import { formData } from '../../lib/pick';
import { BookingTable } from '../Bookings';

export default function Users() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const role = (params.get('role') as 'member' | 'admin' | null) ?? undefined;
  const [creating, setCreating] = useState(false);
  const me = useMe().data;
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ['users', q, role],
    queryFn: () => ok(api.GET('/api/v1/users', { params: { query: { q: q || undefined, role } } })),
  });
  const done = (message: string) => () => {
    toast.success(message);
    qc.invalidateQueries({ queryKey: ['users'] });
  };
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'active' | 'suspended' }) =>
      ok(api.PATCH('/api/v1/users/{id}/status', { params: { path: { id } }, body: { status } })),
    onSuccess: done('เปลี่ยนสถานะแล้ว'),
    onError: (e) => toast.error(errorText(e)),
  });
  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: 'member' | 'admin' }) => ok(api.PATCH('/api/v1/users/{id}/role', { params: { path: { id } }, body: { role } })),
    onSuccess: done('เปลี่ยนสิทธิ์แล้ว'),
    onError: (e) => toast.error(errorText(e)),
  });
  const create = useMutation({
    mutationFn: (body: { email: string; password: string; name: string; phone?: string; role: 'member' | 'admin' }) => ok(api.POST('/api/v1/users', { body })),
    onSuccess: () => {
      setCreating(false);
      done('เพิ่มผู้ใช้แล้ว')();
    },
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
        <h1 className="text-3xl font-bold">สมาชิก</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          เพิ่มผู้ใช้
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Input type="search" placeholder="ค้นหาชื่อหรืออีเมล" defaultValue={q} onChange={(e) => set('q', e.target.value)} className="max-w-xs" aria-label="ค้นหาชื่อหรืออีเมล" />
        <Select value={role ?? ''} onChange={(e) => set('role', e.target.value)} className="max-w-48" aria-label="กรองตามสิทธิ์">
          <option value="">ทุกสิทธิ์</option>
          <option value="member">สมาชิก</option>
          <option value="admin">ผู้ดูแลระบบ</option>
        </Select>
      </div>
      {users.isPending ? (
        <Loading />
      ) : users.error ? (
        <ErrorNote error={users.error} />
      ) : users.data.length === 0 ? (
        <Empty title="ไม่พบผู้ใช้" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[44rem] text-left">
            <thead className="text-sm text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-medium">ชื่อ</th>
                <th className="px-4 py-3 font-medium">เบอร์โทร</th>
                <th className="px-4 py-3 font-medium">สิทธิ์</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3 font-medium">สมัครเมื่อ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <Link to={`/admin/users/${u.id}`} className="font-medium hover:underline">
                        {u.name}
                      </Link>
                      <span className="block text-sm text-muted">{u.email}</span>
                    </td>
                    <td className="num px-4 py-3 text-sm">{u.phone ?? '-'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={u.role === 'admin' ? 'info' : 'muted'}>{u.role === 'admin' ? 'ผู้ดูแลระบบ' : 'สมาชิก'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={u.status === 'active' ? 'turf' : 'danger'}>{u.status === 'active' ? 'ใช้งานได้' : 'ถูกระงับ'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">{dateTh(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      {!self && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="quiet" onClick={() => setStatus.mutate({ id: u.id, status: u.status === 'active' ? 'suspended' : 'active' })}>
                            {u.status === 'active' ? 'ระงับ' : 'เปิดใช้งาน'}
                          </Button>
                          <Button size="sm" variant="quiet" onClick={() => setRole.mutate({ id: u.id, role: u.role === 'admin' ? 'member' : 'admin' })}>
                            {u.role === 'admin' ? 'ปลดจากแอดมิน' : 'ตั้งเป็นแอดมิน'}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="เพิ่มผู้ใช้">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            const f = formData(e);
            create.mutate({
              name: String(f.get('name')),
              email: String(f.get('email')),
              password: String(f.get('password')),
              phone: String(f.get('phone')) || undefined,
              role: f.get('role') === 'admin' ? 'admin' : 'member',
            });
          }}
        >
          <Field label="ชื่อ-นามสกุล">
            <Input name="name" required />
          </Field>
          <Field label="อีเมล">
            <Input name="email" type="email" required />
          </Field>
          <Field label="เบอร์โทร">
            <Input name="phone" pattern="0[0-9]{8,9}" />
          </Field>
          <Field label="รหัสผ่านเริ่มต้น" hint="อย่างน้อย 8 ตัวอักษร">
            <Input name="password" type="password" required minLength={8} />
          </Field>
          <Field label="สิทธิ์">
            <Select name="role" defaultValue="admin">
              <option value="admin">ผู้ดูแลระบบ</option>
              <option value="member">สมาชิก</option>
            </Select>
          </Field>
          <ErrorNote error={create.error} />
          <div className="flex justify-end">
            <Button type="submit" variant="primary" pending={create.isPending}>
              เพิ่มผู้ใช้
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function UserDetail() {
  const id = Number(useParams().id);
  const user = useQuery({ queryKey: ['user', id], queryFn: () => ok(api.GET('/api/v1/users/{id}', { params: { path: { id } } })) });
  const bookings = useQuery({ queryKey: ['bookings', 'user', id], queryFn: () => ok(api.GET('/api/v1/bookings', { params: { query: { userId: id } } })) });
  if (user.isPending) return <Loading />;
  if (user.error) return <ErrorNote error={user.error} />;
  const u = user.data;
  return (
    <div className="space-y-5">
      <Link to="/admin/users" className="text-sm text-muted hover:text-ink">
        สมาชิกทั้งหมด
      </Link>
      <Panel className="flex flex-wrap items-center gap-5 p-5">
        {u.avatarUrl ? (
          <img src={u.avatarUrl} alt="" className="size-20 rounded-2xl object-cover" />
        ) : (
          <span className="grid size-20 place-items-center rounded-2xl bg-turf font-display text-3xl font-bold text-white">{u.name.slice(0, 1)}</span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{u.name}</h1>
          <p className="text-muted">
            {u.email} {u.phone && `โทร ${u.phone}`}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-6 text-right">
          <div>
            <dt className="text-sm text-muted">การจอง</dt>
            <dd className="num text-2xl font-semibold">{u.bookingCount}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">ยอดใช้จ่าย</dt>
            <dd className="num text-2xl font-semibold">{baht(u.totalSpent)}</dd>
          </div>
        </dl>
      </Panel>
      <h2 className="text-xl font-semibold">ประวัติการจอง</h2>
      {bookings.data?.length ? <BookingTable rows={bookings.data} /> : <Empty title="ยังไม่มีการจอง" />}
    </div>
  );
}
