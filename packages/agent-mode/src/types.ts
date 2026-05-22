export interface AgnostConfig {
  orgId: string;
  endpoint?: string;
}

export interface AgnostSetupConfig extends AgnostConfig {
  integrations?: {
    openai?: boolean;
    vercelAI?: boolean;
  };
}

export interface UserIdentity {
  userId: string;
  email?: string;
  name?: string;
  organization?: string;
  plan?: string;
  [key: string]: any;
}

export interface TrackOptions {
  userId?: string;
  sessionId?: string;
  conversationId?: string;
  metadata?: Record<string, any>;
  toolName?: string;
  input?: string | Record<string, any>;
}


