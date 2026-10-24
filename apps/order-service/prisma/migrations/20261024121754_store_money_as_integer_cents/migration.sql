-- Money as integer cents: a float cannot represent most decimal amounts
-- exactly. Renamed and converted in place (not dropped and re-added, as
-- Prisma would generate) so existing totals, stored in currency units, are
-- kept: 19.99 becomes 1999.
ALTER TABLE "Order" RENAME COLUMN "total" TO "totalCents";
ALTER TABLE "Order"
  ALTER COLUMN "totalCents" TYPE INTEGER USING ROUND("totalCents" * 100)::INTEGER;
