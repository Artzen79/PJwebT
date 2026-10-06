import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorText, type Slot, useMe } from '../api';
import { useCart, useCartActions } from './cart';
import { timeRange } from './format';

// Shared by every slot board: a free hour goes into the cart, an hour already in the cart comes out again.
export function useSlotPicker() {
  const me = useMe().data;
  const cart = useCart(Boolean(me)).data;
  const { addSlot, removeSlot } = useCartActions();
  const navigate = useNavigate();
  const location = useLocation();

  return (court: { courtId: number; courtName: string }, slot: Slot) => {
    if (!me) {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    const label = `${court.courtName} ${timeRange(slot.startAt, slot.endAt)}`;
    if (slot.status === 'in_cart') {
      const item = cart?.slots.find((s) => s.courtId === court.courtId && Date.parse(s.startAt) === Date.parse(slot.startAt));
      if (item) {
        removeSlot.mutate(item.id, {
          onSuccess: () => toast(`เอา ${label} ออกจากตะกร้าแล้ว`),
          onError: (e) => toast.error(errorText(e)),
        });
      }
      return;
    }
    addSlot.mutate(
      { courtId: court.courtId, startAt: slot.startAt },
      {
        onSuccess: () => toast.success(`เพิ่ม ${label} ลงตะกร้าแล้ว`, { action: { label: 'ไปที่ตะกร้า', onClick: () => navigate('/cart') } }),
        onError: (e) => toast.error(errorText(e)),
      },
    );
  };
}

export const formData = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return new FormData(e.currentTarget);
};
