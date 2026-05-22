import { AsyncLocalStorage } from 'async_hooks';
import { context } from '@opentelemetry/api';
import { setUser, setSession } from '@arizeai/openinference-core';
import { UserIdentity } from '../types';

const contextStore = new AsyncLocalStorage<UserIdentity>();

export function setAgnostContext(identity: UserIdentity): void {
  contextStore.enterWith(identity);
}

export function getAgnostContext(): UserIdentity | undefined {
  return contextStore.getStore();
}

export function withAgnostIdentity<T>(fn: () => Promise<T>): Promise<T> {
  const identity = getAgnostContext();
  if (!identity?.userId && !identity?.sessionId) {
    return fn();
  }

  let otelCtx = context.active();
  if (identity.userId) {
    otelCtx = setUser(otelCtx, { userId: identity.userId });
  }
  if (identity.sessionId) {
    otelCtx = setSession(otelCtx, { sessionId: identity.sessionId });
  }

  return context.with(otelCtx, fn);
}
