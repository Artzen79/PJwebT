CREATE TABLE coupons (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code = upper(code)),
  percent_off smallint CHECK (percent_off BETWEEN 1 AND 100),
  amount_off numeric(10,2) CHECK (amount_off > 0),
  min_total numeric(10,2) NOT NULL DEFAULT 0 CHECK (min_total >= 0),
  max_uses int CHECK (max_uses > 0),
  used_count int NOT NULL DEFAULT 0,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((percent_off IS NULL) <> (amount_off IS NULL))
);

-- a cart points at its coupon; on confirm the discount is frozen into bookings.discount
ALTER TABLE bookings
  ADD COLUMN coupon_id int REFERENCES coupons(id),
  ADD COLUMN discount numeric(10,2) NOT NULL DEFAULT 0;

-- existing columns keep their order; subtotal and discount are appended
CREATE OR REPLACE VIEW booking_totals AS
SELECT x.booking_id, x.subtotal - x.discount AS total, x.subtotal, x.discount
FROM (
  SELECT b.id AS booking_id, s.subtotal,
    CASE WHEN b.status = 'cart' THEN
      CASE WHEN c.id IS NOT NULL AND s.subtotal >= c.min_total
        THEN LEAST(s.subtotal, COALESCE(round(s.subtotal * c.percent_off / 100.0, 2), c.amount_off))
        ELSE 0 END
    ELSE b.discount END AS discount
  FROM bookings b
  CROSS JOIN LATERAL (
    SELECT COALESCE((SELECT sum(price) FROM booking_slots WHERE booking_id = b.id), 0)
         + COALESCE((SELECT sum(price) FROM booking_equipment WHERE booking_id = b.id), 0) AS subtotal
  ) s
  LEFT JOIN coupons c ON c.id = b.coupon_id
) x;
