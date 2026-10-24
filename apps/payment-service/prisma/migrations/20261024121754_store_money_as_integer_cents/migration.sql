-- Money as integer cents: a float cannot represent most decimal amounts
-- exactly. Renamed and converted in place (not dropped and re-added, as
-- Prisma would generate) so existing amounts, stored in currency units, are
-- kept: 19.99 becomes 1999.
ALTER TABLE "Payment" RENAME COLUMN "amount" TO "amountCents";
ALTER TABLE "Payment"
  ALTER COLUMN "amountCents" TYPE INTEGER USING ROUND("amountCents" * 100)::INTEGER;
