// The API reference (Scalar, served by the API at /docs) inside the admin console.
// Same origin, so "Test Request" calls run with the admin's login cookie.
import { PageHeader } from '../../components/ui';

export default function ApiDocs() {
  return (
    <div className="space-y-4">
      <PageHeader title="API" sub="ทุก endpoint ของระบบ กด Test Request เพื่อเรียกจริงด้วยสิทธิ์ของบัญชีผู้ดูแลระบบที่เข้าสู่ระบบอยู่">
        <a href="/docs" target="_blank" rel="noreferrer" className="text-sm text-info hover:underline">
          เปิดในแท็บใหม่
        </a>
      </PageHeader>
      <iframe title="เอกสาร API" src="/docs" className="h-[calc(100dvh-14rem)] min-h-[36rem] w-full rounded-2xl border border-line bg-white" />
    </div>
  );
}
