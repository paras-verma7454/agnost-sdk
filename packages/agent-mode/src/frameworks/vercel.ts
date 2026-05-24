import { getAgnostConfig, initAgnost } from '../agnost';
import { getAgnostContext } from '../core/context';

type TelemetryAttributeValue = string | number | boolean;

export interface VercelTelemetryConfig {
  isEnabled: true;
  metadata: Record<string, TelemetryAttributeValue>;
}

export async function instrumentVercelAI(config?: import('../types').AgnostConfig): Promise<void> {
  if (config) initAgnost(config);
  getAgnostConfig();
}

export function createVercelTelemetry(metadata: Record<string, TelemetryAttributeValue> = {}): VercelTelemetryConfig {
  const identity = getAgnostContext();

  return {
    isEnabled: true,
    metadata: {
      ...metadata,
      ...(identity?.userId ? { userId: identity.userId } : {}),
      ...(identity?.sessionId ? { sessionId: identity.sessionId } : {}),
    },
  };
}
