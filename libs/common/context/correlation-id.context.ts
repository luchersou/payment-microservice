import { AsyncLocalStorage } from 'async_hooks';

type Store = {
  correlationId: string | undefined;
};

export const correlationIdStorage = new AsyncLocalStorage<Store>();
