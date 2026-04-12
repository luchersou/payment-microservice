import { AsyncLocalStorage } from 'async_hooks';

type Store = {
  correlationId: string;
};

export const correlationIdStorage = new AsyncLocalStorage<Store>();
