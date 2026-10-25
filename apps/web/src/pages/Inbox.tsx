import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { api, ok } from '../api';
import { MailList, MailReader } from '../components/Mail';
import { ErrorNote, Loading, PageHeader } from '../components/ui';

export function useInbox(enabled = true) {
  return useQuery({ queryKey: ['inbox'], queryFn: () => ok(api.GET('/api/v1/users/me/emails')), enabled, refetchInterval: 30_000 });
}

export default function Inbox() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('mail') ? Number(params.get('mail')) : null;
  const inbox = useInbox();
  return (
    <div className="space-y-6">
      <PageHeader title="กล่องข้อความ" sub="อีเมลทุกฉบับที่ระบบส่งถึงคุณ: ยืนยันการจอง ผลตรวจสลิป ตั๋วเช็คอิน และการเตือนก่อนเวลา เลือกฉบับทางซ้ายเพื่ออ่าน" />
      {inbox.isPending ? (
        <Loading />
      ) : inbox.error ? (
        <ErrorNote error={inbox.error} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <MailList items={inbox.data.items} selected={selected} onSelect={(id) => setParams({ mail: String(id) })} />
          <MailReader id={selected} />
        </div>
      )}
    </div>
  );
}
