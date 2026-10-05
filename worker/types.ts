export type Bindings = {
  WORKSPACES: DurableObjectNamespace
  WORKSPACE_BYTES?: number
  OWNER_ID?: string
  REGISTRY?: D1Database
  DB: D1Database
  ATTACHMENTS: R2Bucket
  AI: Ai
  ASSETS: Fetcher
  AI_MODEL: string
  /** Conversational model for assistant questions; defaults to a strong instruct model. */
  ASSISTANT_MODEL?: string
  schedulePlatonusRetry?: (at:number|null)=>Promise<void>
  scheduleStudyRetry?: (at:number|null)=>Promise<void>
  PUBLIC_APP_URL: string
  CREDENTIALS_ENCRYPTION_KEY: string
  TELEGRAM_WEBHOOK_SECRET?: string
  SUPPORT_BOT_TOKEN?: string
  SUPPORT_WEBHOOK_SECRET?: string
  SUPPORT_SETUP_KEY?: string
  ADMIN_ACCOUNT_ID?: string
  WHATSAPP_BRIDGE_SECRET?: string
}

export type ApiErrorBody = {
  ok: false
  error: {
    code: string
    message: string
    issues?: Array<{ path: string; message: string }>
  }
}

export type ApiSuccess<T> = {
  ok: true
  data: T
  meta?: Record<string, unknown>
}
