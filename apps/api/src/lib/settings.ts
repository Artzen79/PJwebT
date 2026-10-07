import { z } from 'zod';
import { type Db, pool, query } from '../db';
import { env } from '../env';

// Rules an admin can change from the web; a key without a row in `settings` uses its default.
export const settingFields = {
  promptpayId: z.string().regex(/^(0\d{9}|\d{13})$/, 'เบอร์มือถือ 10 หลัก หรือเลขประจำตัว 13 หลัก').describe('PromptPay ที่รับเงิน'),
  payWithinMinutes: z.number().int().min(5).max(1440).describe('ต้องแนบสลิปภายในกี่นาทีหลังยืนยัน'),
  checkinEarlyMinutes: z.number().int().min(0).max(43_200).describe('เช็คอินได้ก่อนเวลาเริ่มกี่นาที'),
  cancelBeforeHours: z.number().int().min(0).max(720).describe('สมาชิกยกเลิกการจองที่ชำระแล้วได้ก่อนเริ่มกี่ชั่วโมง'),
  maxDaysAhead: z.number().int().min(0).max(365).describe('จองล่วงหน้าได้กี่วันตามปฏิทิน (0 = วันนี้เท่านั้น, 1 = วันนี้และพรุ่งนี้)'),
  announcement: z.string().trim().max(500).describe('ข้อความประกาศบนหน้าแรก (ว่าง = ไม่แสดง)'),
  contactPhone: z.string().trim().max(30).describe('เบอร์ติดต่อสนาม'),
  contactLine: z.string().trim().max(50).describe('LINE ID ของสนาม'),
  address: z.string().trim().max(300).describe('ที่อยู่สนาม'),
};

export const Settings = z.object(settingFields).meta({ id: 'Settings', description: 'ค่าตั้งระบบที่ใช้อยู่ตอนนี้' });
export type SettingsValue = z.infer<typeof Settings>;

const defaults = (): SettingsValue => ({
  promptpayId: env.promptpayId,
  payWithinMinutes: 15,
  checkinEarlyMinutes: env.checkinEarlyMinutes,
  cancelBeforeHours: 24,
  // today and tomorrow only, unless the admin opens a longer window
  maxDaysAhead: Number(process.env.MAX_DAYS_AHEAD || 1),
  announcement: '',
  contactPhone: '',
  contactLine: '',
  address: '',
});

export async function getSettings(db: Db = pool): Promise<SettingsValue> {
  const base = defaults();
  const rows = await query<{ key: string; value: unknown }>('SELECT key, value FROM settings', [], db);
  return { ...base, ...Object.fromEntries(rows.filter((r) => r.key in base).map((r) => [r.key, r.value])) };
}

// null resets a key to its default
export async function saveSettings(changes: Partial<Record<keyof SettingsValue, unknown>>, userId: number) {
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    if (value === null) await query('DELETE FROM settings WHERE key = $1', [key]);
    else
      await query(
        `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`,
        [key, JSON.stringify(value), userId],
      );
  }
}
