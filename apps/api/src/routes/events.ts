import { z } from 'zod';
import { subscribe } from '../lib/events';
import { route } from '../lib/route';

route({
  method: 'get',
  path: '/events/availability',
  tag: 'Realtime',
  summary: 'สตรีมแจ้งเตือนเมื่อตารางว่างเปลี่ยน (Server-Sent Events)',
  description:
    'เปิดค้างไว้ด้วย `new EventSource(url)` ทุกครั้งที่มีการยืนยัน ยกเลิก หรือหมดเวลาการจอง จะได้ event `availability` พร้อมรหัสสนามและอุปกรณ์ที่ได้รับผลกระทบ แล้วให้หน้าเว็บโหลดตารางใหม่',
  response: z.string(),
  produces: 'sse',
  handler: ({ res }) => subscribe(res),
});
