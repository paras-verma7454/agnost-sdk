import { SpanData } from '../types';

const MAX_BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 1000;

export class SpanBatcher {
  private buffer: SpanData[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushFn: (spans: SpanData[]) => Promise<void>;

  constructor(flushFn: (spans: SpanData[]) => Promise<void>) {
    this.flushFn = flushFn;
    this.startTimer();
    this.setupExitHandler();
  }

  add(span: SpanData): void {
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.buffer.shift();
      console.warn('[Agnost] Span buffer full, dropped oldest span');
    }
    this.buffer.push(span);
    if (this.buffer.length >= MAX_BATCH_SIZE) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      await this.flushFn(batch);
    } catch (err) {
      console.error('[Agnost] Flush failed:', (err as Error).message);
    }
  }

  private startTimer(): void {
    this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    if (this.timer && typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }
  }

  private setupExitHandler(): void {
    process.on('SIGTERM', () => this.flush());
    process.on('SIGINT', () => this.flush());
    process.on('beforeExit', () => this.flush());
  }

  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
}
