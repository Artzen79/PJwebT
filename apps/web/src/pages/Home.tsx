import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { api, ok } from '../api';
import { DateStrip, SportChips } from '../components/Pickers';
import { BoardLegend, SlotBoard } from '../components/SlotBoard';
import { Empty, ErrorNote, LinkButton, Loading } from '../components/ui';
import { bangkokDate, relativeDay } from '../lib/format';
import { useSlotPicker } from '../lib/pick';

export default function Home() {
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? bangkokDate();
  const sport = params.get('sport') ? Number(params.get('sport')) : undefined;
  const update = (key: string, value?: string | number) =>
    setParams(
      (p) => {
        if (value === undefined) p.delete(key);
        else p.set(key, String(value));
        return p;
      },
      { replace: true },
    );

  const board = useQuery({
    queryKey: ['board', date, sport],
    queryFn: () => ok(api.GET('/api/v1/availability', { params: { query: { date, sport } } })),
    placeholderData: keepPreviousData,
  });
  const pick = useSlotPicker();
  const courts = board.data?.courts ?? [];
  const freeHours = courts.reduce((n, c) => n + c.slots.filter((s) => s.status === 'free').length, 0);
  const openCourts = courts.filter((c) => c.slots.some((s) => s.status === 'free')).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-4 border-mark pb-5">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-bold sm:text-5xl">ตารางสนามว่าง</h1>
          <p className="mt-3 text-lg text-muted">
            {relativeDay(date)} ยังว่าง <span className="num font-semibold text-ink">{freeHours}</span> ชั่วโมงใน{' '}
            <span className="num font-semibold text-ink">{openCourts}</span> สนาม กดช่องสีเขียวเพื่อเพิ่มลงตะกร้า แล้วยืนยันและจ่ายด้วย PromptPay ได้ทันที
          </p>
        </div>
        <LinkButton to="/equipment">ยืมอุปกรณ์เพิ่ม</LinkButton>
      </div>

      <div className="space-y-3">
        <DateStrip value={date} onChange={(d) => update('date', d === bangkokDate() ? undefined : d)} />
        <SportChips value={sport} onChange={(s) => update('sport', s)} />
      </div>

      {board.isPending ? (
        <Loading label="กำลังโหลดตาราง" />
      ) : board.error ? (
        <ErrorNote error={board.error} />
      ) : courts.length === 0 ? (
        <Empty title="ยังไม่มีสนามของกีฬานี้">ลองเลือกกีฬาอื่น</Empty>
      ) : (
        <SlotBoard rows={courts} onPick={pick} linkCourt={(id) => `/courts/${id}?date=${date}`} />
      )}
      <BoardLegend />
    </div>
  );
}
