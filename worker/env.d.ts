import type { Bindings } from './types'

declare module 'cloudflare:workers' {
  namespace Cloudflare {
    export interface Env extends Bindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Bindings {
    TEST_MIGRATIONS: D1Migration[]
  }
}
