import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Booking, ok } from '../api';

export function useCart(enabled: boolean) {
  return useQuery({ queryKey: ['cart'], queryFn: () => ok(api.GET('/api/v1/cart')), enabled });
}

export function useCartActions() {
  const qc = useQueryClient();
  const changed = (cart: Booking) => {
    qc.setQueryData(['cart'], cart);
    qc.invalidateQueries({ queryKey: ['board'] });
    qc.invalidateQueries({ queryKey: ['availability'] });
  };
  return {
    addSlot: useMutation({
      mutationFn: (body: { courtId: number; startAt: string; repeatWeeks?: number }) => ok(api.POST('/api/v1/cart/slots', { body })),
      onSuccess: changed,
    }),
    removeSlot: useMutation({
      mutationFn: (id: number) => ok(api.DELETE('/api/v1/cart/slots/{id}', { params: { path: { id } } })),
      onSuccess: changed,
    }),
    addEquipment: useMutation({
      mutationFn: (body: { equipmentId: number; qty: number; startAt: string; endAt: string }) => ok(api.POST('/api/v1/cart/equipment', { body })),
      onSuccess: changed,
    }),
    removeEquipment: useMutation({
      mutationFn: (id: number) => ok(api.DELETE('/api/v1/cart/equipment/{id}', { params: { path: { id } } })),
      onSuccess: changed,
    }),
    applyCoupon: useMutation({
      mutationFn: (code: string) => ok(api.POST('/api/v1/cart/coupon', { body: { code } })),
      onSuccess: changed,
    }),
    removeCoupon: useMutation({
      mutationFn: () => ok(api.DELETE('/api/v1/cart/coupon')),
      onSuccess: changed,
    }),
    clear: useMutation({
      mutationFn: () => ok(api.DELETE('/api/v1/cart')),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['cart'] });
        qc.invalidateQueries({ queryKey: ['board'] });
        qc.invalidateQueries({ queryKey: ['availability'] });
      },
    }),
    confirm: useMutation({
      mutationFn: () => ok(api.POST('/api/v1/cart/confirm')),
      onSuccess: (booking) => {
        qc.setQueryData(['booking', booking.id], booking);
        qc.invalidateQueries({ queryKey: ['cart'] });
        qc.invalidateQueries({ queryKey: ['bookings'] });
      },
      onError: () => qc.invalidateQueries({ queryKey: ['cart'] }),
    }),
  };
}
