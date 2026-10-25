import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { api, ok } from '../api';
import { DateStrip, SportChips } from '../components/Pickers';
import { BoardLegend, SlotBoard } from '../components/SlotBoard';
import { Empty, ErrorNote, FilterRow, LinkButton, Loading, PageHeader, StatBox, Steps } from '../components/ui';
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
    <div className="space-y-5">
      <PageHeader title="ตารางสนามว่าง" sub="ดูช่วงเวลาว่างของทุกสนามในวันเดียว แล้วกดช่องที่ต้องการเพื่อจอง">
        <StatBox label={`ว่าง${relativeDay(date)}`} value={freeHours} unit={`ชม. · ${openCourts} สนาม`} />
        <LinkButton to="/equipment">ยืมอุปกรณ์</LinkButton>
      </PageHeader>

      <Steps items={['เลือกวันและกีฬา', 'กดช่องสีเขียวเพื่อเพิ่มลงตะกร้า', 'ยืนยันที่ตะกร้า', 'จ่ายด้วย PromptPay']} />

      <div className="space-y-3 rounded-xl border-2 border-line bg-sunken/60 p-3">
        <FilterRow label="วันที่">
          <DateStrip value={date} onChange={(d) => update('date', d === bangkokDate() ? undefined : d)} />
        </FilterRow>
        <FilterRow label="กีฬา">
          <SportChips value={sport} onChange={(s) => update('sport', s)} />
        </FilterRow>
      </div>

      <BoardLegend />
      {board.isPending ? (
        <Loading label="กำลังโหลดตาราง" />
      ) : board.error ? (
        <ErrorNote error={board.error} />
      ) : courts.length === 0 ? (
        <Empty title="ยังไม่มีสนามของกีฬานี้">ลองเลือกกีฬาอื่น</Empty>
      ) : (
        <SlotBoard rows={courts} onPick={pick} linkCourt={(id) => `/courts/${id}?date=${date}`} />
      )}
    </div>
  );
}
