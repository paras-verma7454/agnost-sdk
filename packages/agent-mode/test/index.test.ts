import { describe, it, expect, vi } from 'vitest';
import { setupAgnost, withAgnost, setAgnostContext, getAgnostContext } from '../src/index';

describe('AgnostAgent', () => {
  it('should create agent with orgId', () => {
    const agent = withAgnost({ orgId: 'test-org' });
    expect(agent).toBeDefined();
  });

  it('should setup agent with integrations config', async () => {
    const agent = await setupAgnost({
      orgId: 'test-org',
      integrations: {},
    });
    expect(agent).toBeDefined();
  });

  it('should throw without orgId', () => {
    expect(() => withAgnost({} as any)).toThrow('[Agnost] orgId is required');
  });

  it('should track successful promise', async () => {
    const agent = withAgnost({ orgId: 'test-org' });
    const result = await agent.track(Promise.resolve('hello'), { userId: 'user-1' });
    expect(result).toBe('hello');
  });

  it('should track failed promise', async () => {
    const agent = withAgnost({ orgId: 'test-org' });
    await expect(
      agent.track(Promise.reject(new Error('fail')), { userId: 'user-1' }),
    ).rejects.toThrow('fail');
  });

  it('should track function form', async () => {
    const agent = withAgnost({ orgId: 'test-org' });
    const fn = vi.fn().mockResolvedValue('from-fn');
    const result = await agent.track(fn, { userId: 'user-1' });
    expect(result).toBe('from-fn');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should track failed function form', async () => {
    const agent = withAgnost({ orgId: 'test-org' });
    const fn = vi.fn().mockRejectedValue(new Error('fn-fail'));
    await expect(
      agent.track(fn, { userId: 'user-1' }),
    ).rejects.toThrow('fn-fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should prefix span name with tool.', async () => {
    const agent = withAgnost({ orgId: 'test-org' });
    const result = await agent.track(Promise.resolve('ok'), {
      toolName: 'search_web',
      userId: 'user-1',
    });
    expect(result).toBe('ok');
  });

  it('should not double-prefix span name', async () => {
    const agent = withAgnost({ orgId: 'test-org' });
    const result = await agent.track(Promise.resolve('ok'), {
      toolName: 'tool.search_web',
      userId: 'user-1',
    });
    expect(result).toBe('ok');
  });
});

describe('Context', () => {
  it('should set and get context', () => {
    setAgnostContext({ userId: 'user-42', email: 'test@example.com' });
    const ctx = getAgnostContext();
    expect(ctx?.userId).toBe('user-42');
    expect(ctx?.email).toBe('test@example.com');
  });
});
