import { AsyncLocalStorage } from 'async_hooks';
import { UserIdentity } from '../types';

const contextStore = new AsyncLocalStorage<UserIdentity>();

export function setAgnostContext(identity: UserIdentity): void {
  contextStore.enterWith(identity);
}

export function getAgnostContext(): UserIdentity | undefined {
  return contextStore.getStore();
}
