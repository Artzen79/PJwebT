import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorText, ok, type User, upload, useMe } from '../api';
import { Button, ErrorNote, Field, Input, Loading, Panel } from '../components/ui';
import { dateTh } from '../lib/format';
import { formData } from '../lib/pick';

export default function Profile() {
  const me = useMe().data;
  const qc = useQueryClient();
  const saved = (user: User) => qc.setQueryData(['me'], user);
  const save = useMutation({
    mutationFn: (body: { name: string; phone: string | null }) => ok(api.PATCH('/api/v1/users/me', { body })),
    onSuccess: (u) => {
      saved(u);
      toast.success('บันทึกข้อมูลแล้ว');
    },
  });
  const password = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) => ok(api.PATCH('/api/v1/users/me', { body })),
    onSuccess: () => toast.success('เปลี่ยนรหัสผ่านแล้ว'),
  });
  const avatar = useMutation({
    mutationFn: (file: File) => upload<User>('/api/v1/users/me/avatar', file),
    onSuccess: (u) => {
      saved(u);
      toast.success('เปลี่ยนรูปโปรไฟล์แล้ว');
    },
    onError: (e) => toast.error(errorText(e)),
  });
  if (!me) return <Loading />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-4xl font-bold">ข้อมูลส่วนตัว</h1>
      <Panel className="grid gap-6 p-6 sm:grid-cols-[12rem_1fr]">
        <div className="space-y-3">
          {me.avatarUrl ? (
            <img src={me.avatarUrl} alt="รูปโปรไฟล์" className="aspect-square w-full rounded-2xl border border-line object-cover" />
          ) : (
            <div className="grid aspect-square w-full place-items-center rounded-2xl bg-turf font-display text-6xl font-bold text-white">{me.name.slice(0, 1)}</div>
          )}
          <Field label="เปลี่ยนรูป" hint="JPG, PNG หรือ WEBP ไม่เกิน 5 MB">
            <Input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={avatar.isPending} onChange={(e) => e.target.files?.[0] && avatar.mutate(e.target.files[0])} />
          </Field>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            const f = formData(e);
            save.mutate({ name: String(f.get('name')), phone: String(f.get('phone')) || null });
          }}
        >
          <Field label="อีเมล">
            <Input value={me.email} readOnly />
          </Field>
          <Field label="ชื่อ-นามสกุล">
            <Input name="name" defaultValue={me.name} required maxLength={100} />
          </Field>
          <Field label="เบอร์โทร" hint="ตัวเลข 9-10 หลัก ขึ้นต้นด้วย 0">
            <Input name="phone" defaultValue={me.phone ?? ''} inputMode="tel" pattern="0[0-9]{8,9}" />
          </Field>
          <ErrorNote error={save.error} />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted">สมาชิกตั้งแต่ {dateTh(me.createdAt)}</span>
            <Button type="submit" variant="primary" pending={save.isPending}>
              บันทึกข้อมูล
            </Button>
          </div>
        </form>
      </Panel>

      <Panel className="p-6">
        <h2 className="mb-4 text-xl font-semibold">เปลี่ยนรหัสผ่าน</h2>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            const f = formData(e);
            password.mutate(
              { currentPassword: String(f.get('current')), newPassword: String(f.get('next')) },
              { onSuccess: () => (e.target as HTMLFormElement).reset() },
            );
          }}
        >
          <Field label="รหัสผ่านปัจจุบัน">
            <Input name="current" type="password" required autoComplete="current-password" />
          </Field>
          <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 8 ตัวอักษร">
            <Input name="next" type="password" required minLength={8} autoComplete="new-password" />
          </Field>
          <div className="sm:col-span-2">
            <ErrorNote error={password.error} />
          </div>
          <Button type="submit" pending={password.isPending} className="sm:col-span-2 sm:justify-self-end">
            เปลี่ยนรหัสผ่าน
          </Button>
        </form>
      </Panel>
    </div>
  );
}
