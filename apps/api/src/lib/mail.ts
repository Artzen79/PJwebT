import nodemailer, { type SendMailOptions } from 'nodemailer';
import QRCode from 'qrcode';
import { env } from '../env';
import type { BookingRow } from './bookings';

const transport = nodemailer.createTransport(env.smtpUrl);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const when = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
const time = new Intl.DateTimeFormat('th-TH', { timeStyle: 'short', timeZone: 'Asia/Bangkok' });
const baht = (n: number) => `${n.toLocaleString('th-TH')} บาท`;

function items(b: BookingRow) {
  const rows = [
    ...b.slots.map((s) => `${esc(s.courtName)} — ${when.format(new Date(s.startAt))} - ${time.format(new Date(s.endAt))}`),
    ...b.equipment.map((e) => `${esc(e.name)} × ${e.qty} — ${when.format(new Date(e.startAt))} - ${time.format(new Date(e.endAt))}`),
  ];
  return `<ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul>`;
}

function layout(b: BookingRow, heading: string, body: string) {
  return `<div style="font-family:sans-serif;max-width:560px">
  <h2 style="color:#0f766e">${heading}</h2>
  <p>สวัสดีคุณ ${esc(b.userName)}</p>
  ${body}
  <p><b>เลขที่การจอง:</b> ${b.code}<br><b>ยอดรวม:</b> ${baht(b.total)}</p>
  ${items(b)}
  <p><a href="${env.appUrl}/bookings/${b.id}">ดูรายละเอียดการจอง</a></p>
  <p style="color:#64748b;font-size:12px">SportHub — ระบบจองสนามกีฬาและยืมอุปกรณ์</p></div>`;
}

// Fire-and-forget: a mail outage must never fail the request that triggered it.
function send(to: string, subject: string, html: string, attachments: SendMailOptions['attachments'] = []) {
  transport.sendMail({ from: env.mailFrom, to, subject, html, attachments }).catch((err) => console.error(`mail to ${to} failed:`, err.message));
}

export const mail = {
  confirmed: (b: BookingRow) =>
    send(
      b.userEmail,
      `[SportHub] ยืนยันการจอง #${b.code} — กรุณาชำระเงินภายใน 15 นาที`,
      layout(b, 'ได้รับการจองแล้ว', '<p>กรุณาสแกน QR PromptPay และแนบสลิปภายใน 15 นาที ไม่เช่นนั้นการจองจะถูกยกเลิกอัตโนมัติ</p>'),
    ),
  approved: (b: BookingRow) =>
    QRCode.toBuffer(b.checkinToken ?? b.code)
      .then((qr) =>
        send(
          b.userEmail,
          `[SportHub] ชำระเงินสำเร็จ #${b.code}`,
          layout(b, 'ชำระเงินสำเร็จ', '<p>แสดง QR นี้ที่เคาน์เตอร์เพื่อเช็คอิน</p><img src="cid:checkin" width="200" alt="QR เช็คอิน">'),
          [{ filename: 'checkin.png', content: qr, cid: 'checkin' }],
        ),
      )
      .catch((err) => console.error('approval mail failed:', err.message)),
  rejected: (b: BookingRow, note: string | null) =>
    send(
      b.userEmail,
      `[SportHub] สลิปไม่ผ่านการตรวจสอบ #${b.code}`,
      layout(b, 'สลิปไม่ผ่านการตรวจสอบ', `<p>เหตุผล: ${esc(note ?? '-')}</p><p>กรุณาแนบสลิปใหม่ภายใน 15 นาที</p>`),
    ),
  cancelled: (b: BookingRow, reason: string) =>
    send(b.userEmail, `[SportHub] การจอง #${b.code} ถูกยกเลิก`, layout(b, 'การจองถูกยกเลิก', `<p>${esc(reason)}</p>`)),
  reminder: (b: BookingRow) =>
    send(b.userEmail, `[SportHub] อีก 1 ชั่วโมงถึงเวลาจอง #${b.code}`, layout(b, 'ใกล้ถึงเวลาแล้ว', '<p>อย่าลืมแสดง QR เช็คอินที่เคาน์เตอร์</p>')),
};
