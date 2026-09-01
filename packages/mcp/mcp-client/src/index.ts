/**
 * MCP client bridge plugin: connects to an external MCP server and registers
 * its tools on `ctx.tools` under server-qualified public names
 * (`mcp__<serverName>__<rawName>`). Each plugin instance connects to one MCP
 * server; load multiple instances in `cordis.yml` for multiple servers.
 *
 * Namespace plugin (named exports, no default export). Lifecycle is
 * effect-scoped: disposal disconnects from the server, unregisters all tools,
 * and releases the `serverName` namespace reservation. HMR hot-swaps by
 * disposing the old instance and creating a new one; identical `serverName`
 * reproduces identical public tool names.
 *
 * @module @deepseek-ai/dsh-mcp-client
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import type { McpOAuthBinding } from '@deepseek-ai/dsh-mcp-oauth'
import { RECONNECT_DEFAULTS, resolveReconnectPolicy, startConnection } from './connection.ts'
import type { ReconnectConfig } from './connection.ts'
// Side-effect type import: declaration-merges `ctx.tools` onto Context.
import type {} from '@deepseek-ai/dsh-tools'

export type { McpResult } from './tools.ts'
export type { ReconnectConfig, ResolvedReconnectPolicy } from './connection.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'mcp-client'

/** Services required by this plugin. */
export const inject = ['tools']

/** Default timeout for individual MCP tool calls (ms). */
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60_000

/** Valid `serverName`, kept below the public tool-name budget. */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/** Credential-key segment grammar (lowercase hyphenated identifier). */
const CREDENTIAL_ID_PATTERN = /^[a-z][a-z0-9-]*$/

/**
 * Live `serverName` reservations per registration scope. Agent-scoped MCP
 * servers may reuse a namespace in another Agent, while global instances and
 * duplicates inside one Agent remain mutually exclusive.
 */
const activeServerNames = new WeakMap<object, Set<string>>()

// ---- Config ----

/** Config for connecting to an MCP server via a spawned child process over stdio. */
export interface StdioConfig {
  /** Selects child-process stdio transport. */
  transport: 'stdio'
  /**
   * Stable local namespace for this server's model-facing tool names
   * (`mcp__<serverName>__<rawName>`). Must match `[A-Za-z0-9_-]{1,32}` and be
   * unique across live mcp-client instances.
   */
  serverName: string
  /** Executable used to start the server. */
  command: string
  /** Arguments passed directly, without shell interpolation. */
  args: string[]
  /** Extra env vars merged on top of scrubbed ambient env. */
  env: Record<string, string>
  /** Working directory for the child process. */
  cwd: string
  /** Per-tool-call timeout in milliseconds. */
  toolCallTimeoutMs: number
  /** Fail plugin activation when the initial connection or tool synchronization fails. */
  failOnStartupError: boolean
  /** Automatic reconnect policy after a lost connection; omission uses the defaults. */
  reconnect?: ReconnectConfig
}

/** OAuth grant selection for one Streamable HTTP entry; presence turns the OAuth path on. */
export interface OAuthConfig {
  /** Stable grant id; the record lives at `mcp-oauth/<credentialId>`. */
  credentialId: string
  /** Scopes to request; empty omits the scope parameter. */
  scopes: string[]
  /** User-facing label; defaults to the serverName. */
  label: string
}

/** Config for connecting to an MCP server over Streamable HTTP (SSE). */
export interface StreamableHttpConfig {
  /** Selects Streamable HTTP transport. */
  transport: 'streamable-http'
  /**
   * Stable local namespace for this server's model-facing tool names
   * (`mcp__<serverName>__<rawName>`). Must match `[A-Za-z0-9_-]{1,32}` and be
   * unique across live mcp-client instances.
   */
  serverName: string
  /** MCP endpoint URL. */
  url: string
  /** Additional headers attached to MCP requests. */
  headers: Record<string, string>
  /** Per-tool-call timeout in milliseconds. */
  toolCallTimeoutMs: number
  /** Fail plugin activation when the initial connection or tool synchronization fails. */
  failOnStartupError: boolean
  /** Automatic reconnect policy after a lost connection; omission uses the defaults. */
  reconnect?: ReconnectConfig
  /** OAuth grant for this server; presence activates the OAuth consumer path through ctx.mcpOAuth. */
  oauth?: OAuthConfig
}

/** Configuration for one stdio or Streamable HTTP MCP server. */
export type Config = StdioConfig | StreamableHttpConfig

type StdioConfigInput = Omit<StdioConfig, 'args' | 'env' | 'cwd' | 'toolCallTimeoutMs' | 'failOnStartupError'>
  & Partial<Pick<StdioConfig, 'args' | 'env' | 'cwd' | 'toolCallTimeoutMs' | 'failOnStartupError'>>
type StreamableHttpConfigInput = Omit<StreamableHttpConfig, 'headers' | 'toolCallTimeoutMs' | 'failOnStartupError' | 'oauth'>
  & Partial<Pick<StreamableHttpConfig, 'headers' | 'toolCallTimeoutMs' | 'failOnStartupError' | 'oauth'>>
type ConfigInput = StdioConfigInput | StreamableHttpConfigInput

const Reconnect: z<ReconnectConfig> = z.object({
  enabled: z.boolean().default(RECONNECT_DEFAULTS.enabled),
  initialDelayMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(RECONNECT_DEFAULTS.initialDelayMs),
  maxDelayMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(RECONNECT_DEFAULTS.maxDelayMs),
  maxAttempts: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(RECONNECT_DEFAULTS.maxAttempts),
})

const configSchema = z.union([
  z.object({
    transport: z.const('stdio'),
    serverName: z.string().required().pattern(SERVER_NAME_PATTERN),
    command: z.string().required(),
    args: z.array(String).default([]),
    env: z.dict(String).default({}),
    cwd: z.string().default(''),
    toolCallTimeoutMs: z.number().default(DEFAULT_TOOL_CALL_TIMEOUT_MS),
    failOnStartupError: z.boolean().default(false),
    reconnect: Reconnect,
  }),
  z.object({
    transport: z.const('streamable-http'),
    serverName: z.string().required().pattern(SERVER_NAME_PATTERN),
    url: z.string().required(),
    headers: z.dict(String).default({}),
    toolCallTimeoutMs: z.number().default(DEFAULT_TOOL_CALL_TIMEOUT_MS),
    failOnStartupError: z.boolean().default(false),
    reconnect: Reconnect,
    oauth: z.object({
      credentialId: z.string().required().pattern(CREDENTIAL_ID_PATTERN),
      scopes: z.array(String).default([]),
      label: z.string().default(''),
    }).default(undefined as never),
  }),
]) as unknown as z<ConfigInput, Config>

/**
 * Post-parse validation the schemastery union cannot express: OAuth is valid
 * only for Streamable HTTP and cannot coexist with a static `Authorization`
 * header. Schemastery passes unknown keys through, so an `oauth` block on a
 * stdio entry survives the union and must be rejected here.
 */
function validateOAuthConfig(value: Config): Config {
  if (value.transport === 'streamable-http' && value.oauth !== undefined) {
    const authHeader = Object.keys(value.headers).find(h => h.toLowerCase() === 'authorization')
    if (authHeader !== undefined) {
      throw new Error(`mcp-client(${value.serverName}): oauth cannot be combined with a static "${authHeader}" header — remove one`)
    }
  }
  if (value.transport === 'stdio' && 'oauth' in value) {
    throw new Error(`mcp-client(${value.serverName}): oauth is valid only for streamable-http transport`)
  }
  return value
}

const configStandard = configSchema['~standard'] as { vendor: string; version: number; validate: (input: unknown) => unknown }

export const Config: z<ConfigInput, Config> = Object.assign(
  function config(input: ConfigInput): Config {
    return validateOAuthConfig(configSchema(input) as Config)
  } as z<ConfigInput, Config>,
  configSchema,
  {
    // The Loader validates config through the Standard Schema interface
    // (`runtime.Config['~standard'].validate`). `~standard` lives on the
    // schemastery prototype, so the `Object.assign` above drops it; re-attach
    // it with a `validate` that runs the same parse + OAuth post-check as the
    // wrapper, so a cordis.yml entry fails loud on the same misconfigurations.
    '~standard': {
      vendor: configStandard.vendor,
      version: configStandard.version,
      validate: (input: unknown): { value: Config } | { issues: { message: string }[] } => {
        try {
          return { value: validateOAuthConfig(configSchema(input as ConfigInput) as Config) }
        } catch (error) {
          return { issues: [{ message: error instanceof Error ? error.message : String(error) }] }
        }
      },
    },
  },
)

// ---- Plugin apply ----

/**
 * Connect one MCP server and publish its initial tool generation before activation.
 * This entry remains explicitly `async`: Cordis treats a prototype-bearing
 * ordinary function as a constructor, whose returned Promise is not startup work.
 * @param ctx - plugin context carrying the tool registry.
 * @param config - resolved transport and server namespace configuration.
 * @returns startup readiness after connection and initial tool discovery settle.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  // Fail loud at load: reconnect misconfiguration (including programmatic
  // construction that bypassed Schemastery) rejects THIS instance before any
  // effect registers.
  const reconnect = resolveReconnectPolicy(config.reconnect, `mcp-client(${config.serverName}): reconnect`)

  // Reserve the namespace next: a duplicate `serverName` fails THIS instance
  // at load with an actionable error and leaves the earlier instance intact.
  ctx.effect(() => {
    const owner = scopeOf(ctx) ?? ctx.root
    let names = activeServerNames.get(owner)
    if (!names) {
      names = new Set()
      activeServerNames.set(owner, names)
    }
    if (names.has(config.serverName)) {
      throw new Error(
        `mcp-client: serverName "${config.serverName}" is already in use by another mcp-client instance — pick a unique serverName in cordis.yml`,
      )
    }
    names.add(config.serverName)
    return () => void names.delete(config.serverName)
  }, 'mcp-client.serverName')

  // Acquire the OAuth binding before starting the supervisor. `ctx.get` keeps
  // mcpOAuth out of `inject` so non-OAuth deployments run without the seam;
  // the loud throw satisfies "fails that entry loudly" when the provider is
  // absent. The mcp-oauth peer is optional, so its value import is deferred to
  // this call site (the only path that needs it) rather than loaded at module
  // scope. The effect disposer returns a single Disposable (not the tuple
  // form the plan's prose suggested) — see vendor/cordis/src/fiber.ts:74-93.
  let binding: (McpOAuthBinding & { dispose(): void }) | undefined
  if (config.transport === 'streamable-http' && config.oauth !== undefined) {
    const mcpOAuth = ctx.get('mcpOAuth')
    if (mcpOAuth === undefined) {
      throw new Error(
        `mcp-client(${config.serverName}): oauth is configured but no mcpOAuth provider is installed — add '@deepseek-ai/dsh-mcp-oauth-web' to the profile`,
      )
    }
    const { mcpOAuthCredentialId } = await import('@deepseek-ai/dsh-mcp-oauth')
    const registered = mcpOAuth.register({
      credentialId: mcpOAuthCredentialId(config.oauth.credentialId),
      serverUrl: new URL(config.url),
      scopes: config.oauth.scopes,
      label: config.oauth.label === '' ? config.serverName : config.oauth.label,
    })
    binding = registered
    ctx.effect(() => () => registered.dispose(), 'mcp-client.oauth-binding')
  }

  // The supervisor owns the client/transport generations, the reconnect
  // loop, and the live tool registrations; disposal stops reconnection,
  // quiesces in-flight work, and unregisters the current generation.
  const connection = startConnection(ctx, config, reconnect, binding)

  ctx.effect(() => {
    return () => connection.dispose()
  }, 'mcp-client.connection')

  // Block plugin activation on the initial connection + tool discovery so
  // Cordis consumers observe the tools immediately after the fiber activates.
  // When failOnStartupError is true, a failed initial attempt rejects the
  // fiber (Cordis rolls it back); otherwise the error is logged and the
  // supervisor enters its reconnect loop.
  const outcome = await connection.ready
  if (outcome.error !== undefined && config.failOnStartupError) {
    throw new Error(`mcp-client(${config.serverName}): initial connection or tool synchronization failed`, { cause: outcome.error })
  }
}
