-- a campaign name for the admin screen, and how many times one member may use the coupon (NULL = no per-member limit)
ALTER TABLE coupons
  ADD COLUMN name text NOT NULL DEFAULT '',
  ADD COLUMN per_user_limit int CHECK (per_user_limit > 0);
