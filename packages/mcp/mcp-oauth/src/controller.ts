/**
 * Remote owner for the safe MCP OAuth surface (`mcpOAuth` namespace) over
 * `ctx.mcpOAuth`. Generic over any provider; contains no protocol behavior.
 * @module @deepseek-ai/dsh-mcp-oauth/controller
 */

import { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { mcpOAuthCredentialId } from './index.ts'
import type { McpOAuthEntry } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `mcpOAuth` Remote namespace. */
    mcpOAuthController: McpOAuthController
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The id names no live OAuth MCP binding. */
    'mcp-oauth/unknown-credential': { readonly credentialId: string }
  }
}

/** Host service backing the generated `ctx.remote.mcpOAuth` namespace. */
export class McpOAuthController extends TypertRemoteService {
  static inject = ['mcpOAuth']

  constructor(ctx: Context) {
    super(ctx, 'mcpOAuthController', { namespace: 'mcpOAuth' })
  }

  /**
   * List every live binding's safe entry.
   * @returns the safe entries of all live bindings.
   */
  @Remote('list')
  list(): readonly McpOAuthEntry[] {
    return this.ctx.mcpOAuth.list()
  }

  /**
   * Delete one binding's local grant.
   * @param request - the binding's credential id.
   */
  @Remote('signOut')
  async signOut(request: { credentialId: string }): Promise<void> {
    try {
      await this.ctx.mcpOAuth.signOut(mcpOAuthCredentialId(request.credentialId))
    } catch (error) {
      throw new RemoteError('mcp-oauth/unknown-credential',
        error instanceof Error ? error.message : String(error),
        { credentialId: request.credentialId }, { cause: error })
    }
  }
}

export default McpOAuthController
