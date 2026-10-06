import { useMutation } from '@tanstack/react-query';
import { Html5Qrcode } from 'html5-qrcode';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { api, type Booking, errorText, ok } from '../../api';
import { Badge, Button, Field, Input, Panel } from '../../components/ui';
import { bookingStatus, dayLabel, timeRange } from '../../lib/format';
import { formData } from '../../lib/pick';

function Scanner({ onScan }: { onScan: (text: string) => void }) {
  const [on, setOn] = useState(false);
  const latest = useRef(onScan);
  latest.current = onScan;
  useEffect(() => {
    if (!on) return;
    const scanner = new Html5Qrcode('qr-reader');
    let last = '';
    const started = scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 240 },
        (text) => {
          if (text !== last) {
            last = text;
            latest.current(text);
          }
        },
        () => {},
      )
      .catch((e) => {
        toast.error(`เปิดกล้องไม่ได้: ${errorText(e)}`);
        setOn(false);
      });
    return () => {
      started
        .then(() => {
          if (scanner.isScanning) return scanner.stop();
        })
        .catch(() => {});
    };
  }, [on]);
  return (
    <div className="space-y-3">
      <div id="qr-reader" className="grid min-h-64 place-items-center overflow-hidden rounded-xl bg-sunken text-muted">
        {!on && 'กล้องปิดอยู่'}
      </div>
      <Button variant={on ? 'ghost' : 'turf'} className="w-full" onClick={() => setOn(!on)}>
        {on ? 'ปิดกล้อง' : 'เปิดกล้องสแกน QR'}
      </Button>
    </div>
  );
}

export default function Checkin() {
  const [result, setResult] = useState<Booking | null>(null);
  const checkin = useMutation({
    mutationFn: (token: string) => ok(api.POST('/api/v1/checkin', { body: { token } })),
    onSuccess: (b) => {
      setResult(b);
      toast.success(`เช็คอิน #${b.code} แล้ว`);
    },
    onError: (e) => {
      setResult(null);
      toast.error(errorText(e));
    },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold">เช็คอินหน้าสนาม</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="space-y-5 p-5">
          <Scanner onScan={(text) => checkin.mutate(text)} />
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              const token = String(formData(e).get('token')).trim();
              if (token) checkin.mutate(token);
            }}
          >
            <Field label="หรือพิมพ์เลขที่การจอง">
              <Input name="token" placeholder="เช่น 202610070012" inputMode="numeric" />
            </Field>
            <Button type="submit" variant="primary" pending={checkin.isPending}>
              เช็คอิน
            </Button>
          </form>
        </Panel>
        <Panel className="p-5">
          {result ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="num text-2xl font-semibold">#{result.code}</h2>
                <Badge tone={bookingStatus[result.status].tone}>{bookingStatus[result.status].label}</Badge>
              </div>
              <p className="text-lg">{result.userName}</p>
              <ul className="space-y-2">
                {result.slots.map((s) => (
                  <li key={`s${s.id}`}>
                    {s.sportIcon} {s.courtName} <span className="num text-muted">{dayLabel(s.startAt)} {timeRange(s.startAt, s.endAt)}</span>
                  </li>
                ))}
                {result.equipment.map((e) => (
                  <li key={`e${e.id}`} className="font-medium">
                    ส่งมอบ {e.sportIcon} {e.name} × <span className="num">{e.qty}</span> (เก็บมัดจำ {e.deposit} บาท)
                  </li>
                ))}
              </ul>
              <Link to={`/bookings/${result.id}`} className="inline-block text-info hover:underline">
                เปิดรายละเอียดการจอง
              </Link>
            </div>
          ) : (
            <p className="text-muted">สแกน QR จากหน้าการจองของสมาชิก หรือพิมพ์เลขที่การจอง ระบบจะแสดงรายการที่ต้องเตรียมให้ที่นี่</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
