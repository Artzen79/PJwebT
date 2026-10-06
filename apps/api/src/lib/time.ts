// ponytail: Thailand is a fixed UTC+7 with no DST, so plain offset math is exact
export const HOUR = 3_600_000;
const OFFSET = 7 * HOUR;

export const atBangkok = (date: string, hour: number) => new Date(Date.parse(`${date}T00:00:00+07:00`) + hour * HOUR);
export const bangkokIso = (d: Date) => `${new Date(d.getTime() + OFFSET).toISOString().slice(0, 19)}+07:00`;
export const bangkokHour = (d: Date) => new Date(d.getTime() + OFFSET).getUTCHours();
export const bangkokDate = (d: Date) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
