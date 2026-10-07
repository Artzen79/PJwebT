import { z } from 'zod';
import { route } from '../lib/route';
import { getSettings, saveSettings, Settings, settingFields } from '../lib/settings';

route({
  method: 'get',
  path: '/settings',
  tag: 'Admin',
  summary: 'ค่าตั้งระบบที่ใช้อยู่',
  description: 'อ่านได้ทุกคน (หน้าเว็บใช้แสดงกฎ เช่น เวลาชำระเงิน) แก้ได้เฉพาะ admin ด้วย `PATCH`',
  response: Settings,
  handler: () => getSettings(),
});

route({
  method: 'patch',
  path: '/settings',
  tag: 'Admin',
  summary: 'แก้ค่าตั้งระบบ',
  description: 'ส่งเฉพาะค่าที่ต้องการแก้ มีผลทันทีกับการทำรายการถัดไป ส่ง `null` เพื่อกลับไปใช้ค่าเริ่มต้น',
  access: 'admin',
  body: z
    .object({
      promptpayId: settingFields.promptpayId.nullable(),
      payWithinMinutes: settingFields.payWithinMinutes.nullable(),
      checkinEarlyMinutes: settingFields.checkinEarlyMinutes.nullable(),
      cancelBeforeHours: settingFields.cancelBeforeHours.nullable(),
      maxDaysAhead: settingFields.maxDaysAhead.nullable(),
      announcement: settingFields.announcement.nullable(),
      contactPhone: settingFields.contactPhone.nullable(),
      contactLine: settingFields.contactLine.nullable(),
      address: settingFields.address.nullable(),
    })
    .partial(),
  response: Settings,
  handler: async ({ user, body }) => {
    await saveSettings(body, user!.id);
    return getSettings();
  },
});
