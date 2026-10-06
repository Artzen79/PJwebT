-- optional evening/peak rate: hours from peak_from_hour onwards cost peak_price_per_hour
ALTER TABLE courts
  ADD COLUMN peak_price_per_hour numeric(10,2) CHECK (peak_price_per_hour >= 0),
  ADD COLUMN peak_from_hour smallint CHECK (peak_from_hour BETWEEN 0 AND 23),
  ADD CONSTRAINT peak_both_or_neither CHECK ((peak_price_per_hour IS NULL) = (peak_from_hour IS NULL));
