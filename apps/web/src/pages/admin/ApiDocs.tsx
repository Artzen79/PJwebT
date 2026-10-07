// The API reference (Scalar, served by the API at /docs) inside the admin console.
// Same origin, so "Test Request" calls run with the admin's login cookie.
export default function ApiDocs() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">API</h1>
          <p className="mt-1 text-muted">ทุก endpoint ของระบบ กด Test Request เพื่อเรียกจริงด้วยสิทธิ์ของบัญชีผู้ดูแลระบบที่เข้าสู่ระบบอยู่</p>
        </div>
        <a href="/docs" target="_blank" rel="noreferrer" className="text-sm text-info hover:underline">
          เปิดในแท็บใหม่
        </a>
      </div>
      <iframe title="เอกสาร API" src="/docs" className="h-[calc(100dvh-14rem)] min-h-[36rem] w-full rounded-2xl border border-line bg-white" />
    </div>
  );
}
