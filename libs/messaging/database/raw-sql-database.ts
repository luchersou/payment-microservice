/**
 * The part of a Prisma client the messaging jobs (outbox relay, DLQ replay)
 * need. Both services' generated clients satisfy it, so the lib depends on
 * neither of them; the tables it touches exist in both databases.
 */
export interface RawSqlTransaction {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): PromiseLike<T>;
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): PromiseLike<number>;
}

export interface RawSqlDatabase {
  $transaction<R>(
    fn: (tx: RawSqlTransaction) => Promise<R>,
    options?: { timeout?: number },
  ): PromiseLike<R>;
}
