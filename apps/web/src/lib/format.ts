const TZ = 'Asia/Bangkok';

export const baht = (n: number) => `${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`;

const dayFmt = new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
const dateFmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

export const dayLabel = (iso: string) => dayFmt.format(new Date(iso));
export const dateTh = (iso: string) => dateFmt.format(new Date(iso));
export const dateTimeTh = (iso: string) => dateTimeFmt.format(new Date(iso));
export const timeTh = (iso: string) => timeFmt.format(new Date(iso));
export const timeRange = (start: string, end: string) => `${timeTh(start)}–${timeTh(end)}`;
export const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

// YYYY-MM-DD in Thailand, the unit the API's ?date= expects
export const bangkokDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
export const addDays = (date: string, n: number) => bangkokDate(new Date(Date.parse(`${date}T12:00:00+07:00`) + n * 86_400_000));
export const atHour = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}:00:00+07:00`;

export function relativeDay(date: string) {
  const today = bangkokDate();
  if (date === today) return 'วันนี้';
  if (date === addDays(today, 1)) return 'พรุ่งนี้';
  return dayLabel(`${date}T12:00:00+07:00`);
}

export const bookingStatus: Record<string, { label: string; tone: 'mark' | 'turf' | 'info' | 'muted' | 'danger' }> = {
  cart: { label: 'อยู่ในตะกร้า', tone: 'muted' },
  pending_payment: { label: 'รอชำระเงิน', tone: 'mark' },
  paid: { label: 'ชำระแล้ว', tone: 'turf' },
  checked_in: { label: 'เช็คอินแล้ว', tone: 'info' },
  completed: { label: 'เสร็จสิ้น', tone: 'muted' },
  cancelled: { label: 'ยกเลิก', tone: 'danger' },
  expired: { label: 'หมดเวลาชำระ', tone: 'danger' },
};

export const paymentStatus: Record<string, { label: string; tone: 'mark' | 'turf' | 'danger' }> = {
  pending: { label: 'รอตรวจสอบ', tone: 'mark' },
  approved: { label: 'อนุมัติแล้ว', tone: 'turf' },
  rejected: { label: 'ไม่ผ่าน', tone: 'danger' },
};

// Each sport takes a colour from its own playing surface (turf, mat, parquet, hard court, barrier, hall floor).
// Validated as a categorical set (lightness band, chroma, CVD and normal-vision separation, 3:1 contrast)
// against both the light (#ffffff) and dark (#14221b) surfaces; a sport name or icon always sits beside it.
const surfaces: Record<string, string> = {
  '⚽': '#2f8f4e',
  '🏸': '#1c7fa6',
  '🏀': '#b5652b',
  '🎾': '#4c5fd5',
  '🏓': '#b8405e',
  '🏐': '#b3850b',
};
const fallback = Object.values(surfaces);
export const sportColor = (icon: string, id = 0) => surfaces[icon] ?? fallback[id % fallback.length];
