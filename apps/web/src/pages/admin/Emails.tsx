import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { api, type EmailSummary, errorText, ok } from '../../api';
import { MailList, MailReader, mailKind, mailStatus } from '../../components/Mail';
import { Button, ErrorNote, Input, Loading, PageHeader, Select } from '../../components/ui';

export default function Emails() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const kind = (params.get('kind') as EmailSummary['kind'] | null) ?? undefined;
  const status = (params.get('status') as EmailSummary['status'] | null) ?? undefined;
  const selected = params.get('mail') ? Number(params.get('mail')) : null;
  const qc = useQueryClient();
  const set = (key: string, value?: string) =>
    setParams((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
      return p;
    });
  const list = useQuery({
    queryKey: ['emails', q, kind, status],
    queryFn: () => ok(api.GET('/api/v1/emails', { params: { query: { q: q || undefined, kind, status } } })),
    refetchInterval: 15_000,
  });
  const system = useQuery({ queryKey: ['system'], queryFn: () => ok(api.GET('/api/v1/admin/system')) });
  const resend = useMutation({
    mutationFn: (id: number) => ok(api.POST('/api/v1/emails/{id}/resend', { params: { path: { id } } })),
    onSuccess: (m) => {
      toast[m.status === 'sent' ? 'success' : 'error'](m.status === 'sent' ? 'ส่งอีเมลออกแล้ว' : `ส่งไม่สำเร็จ: ${m.error}`);
      qc.invalidateQueries({ queryKey: ['emails'] });
      qc.invalidateQueries({ queryKey: ['email', m.id] });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="อีเมล"
        sub={
          <>
            ทุกอีเมลที่ระบบส่ง สมาชิกเห็นฉบับของตัวเองในกล่องข้อความบนเว็บ{' '}
            {system.data && (system.data.smtpEnabled ? 'และส่งออกทาง SMTP ด้วย' : '(ยังไม่ได้ตั้ง SMTP จึงไม่ส่งออกไปอีเมลจริง)')}
          </>
        }
      />
      <div className="flex flex-wrap gap-3">
        <Input
          type="search"
          placeholder="ค้นหาผู้รับ ชื่อ หรือหัวเรื่อง"
          defaultValue={q}
          onChange={(e) => set('q', e.target.value)}
          className="max-w-xs"
          aria-label="ค้นหาอีเมล"
        />
        <Select value={kind ?? ''} onChange={(e) => set('kind', e.target.value)} className="max-w-48" aria-label="ประเภท">
          <option value="">ทุกประเภท</option>
          {Object.entries(mailKind).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
        <Select value={status ?? ''} onChange={(e) => set('status', e.target.value)} className="max-w-48" aria-label="สถานะการส่ง">
          <option value="">ทุกสถานะ</option>
          {Object.entries(mailStatus).map(([k, s]) => (
            <option key={k} value={k}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      {list.isPending ? (
        <Loading />
      ) : list.error ? (
        <ErrorNote error={list.error} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
          <div className="max-h-[44rem] overflow-y-auto rounded-2xl">
            <MailList items={list.data} selected={selected} onSelect={(id) => set('mail', String(id))} showRecipient />
          </div>
          <MailReader
            id={selected}
            actions={(m) =>
              system.data?.smtpEnabled && m.status !== 'web' ? (
                <Button size="sm" pending={resend.isPending} onClick={() => resend.mutate(m.id)}>
                  ส่งออกอีกครั้ง
                </Button>
              ) : null
            }
          />
        </div>
      )}
    </div>
  );
}
