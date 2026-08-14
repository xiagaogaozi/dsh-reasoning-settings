import { AsyncLocalStorage } from 'node:async_hooks'

export const name = 'dsh-reasoning-settings'
export const inject = ['tools', 'agents']

const TARGET_TOOL_NAMES = ['subagent', 'subagent_fork']
const REASONING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const TARGET_WRAPPER = Symbol('dsh-reasoning-settings.target-wrapper')

function objectOf(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function routeOf(value) {
  const route = objectOf(value)
  return typeof route.provider === 'string' && route.provider.length > 0
    && typeof route.model === 'string' && route.model.length > 0
    ? route
    : undefined
}

function sameRoute(left, right) {
  return left !== undefined && right !== undefined
    && left.provider === right.provider
    && left.model === right.model
}

/** Whether this request belongs to an in-process Harness subagent. */
export function isSubagent(agent) {
  const header = objectOf(objectOf(agent).session?.header)
  return header.origin === 'subagent'
    || (Number.isSafeInteger(header.delegationDepth) && header.delegationDepth > 0)
}

/** Read the parent's live request route before falling back to its create-time route. */
export function liveParentRoute(parent, fallback) {
  const agent = objectOf(parent)
  const header = agent.session?.requestHeader?.()
  const logged = routeOf(header?.config)
  if (logged !== undefined) {
    // An adapter-owned default is not a user selection. Keep it absent on the
    // child so the target provider re-resolves its current configured default.
    if (objectOf(header?.adapterDefaults).reasoningEffort === true) {
      const { reasoningEffort: _defaultEffort, ...withoutDefaultEffort } = logged
      return withoutDefaultEffort
    }
    return logged
  }
  return routeOf(agent.options) ?? routeOf(fallback)
}

/**
 * Read a request route produced by the child itself. A fork's inherited prefix
 * may contain the parent's request/header; events before the persisted
 * seedLength are seed history and must not make the child look already routed.
 */
export function establishedChildRoute(agent) {
  const session = objectOf(objectOf(agent).session)
  if (!Array.isArray(session.events)) return undefined
  const boundary = Number.isSafeInteger(session.header?.seedLength) ? session.header.seedLength : 0
  for (let index = session.events.length - 1; index >= 0; index -= 1) {
    const event = objectOf(session.events[index])
    if (event.type !== 'request/header' || !Number.isSafeInteger(event.seq) || event.seq < boundary) continue
    return routeOf(objectOf(objectOf(event.data).header).config)
  }
  return undefined
}

/**
 * Return user-declared llm-pi-ai model profiles. Reading the descriptor's user
 * layer deliberately excludes built-in catalog providers, so model-only child
 * overrides prefer the third-party routes configured by the user.
 */
export function configuredProviderProfiles(settings) {
  if (settings === undefined || typeof settings.describe !== 'function') return []
  let descriptor
  try {
    descriptor = settings.describe({ redactSecrets: true })
      .find(entry => String(entry?.ns) === 'llm-pi-ai')
  } catch {
    return []
  }
  const effectiveProviders = objectOf(objectOf(descriptor?.value).providers)
  const userProviders = objectOf(objectOf(descriptor?.user).providers)
  const profiles = []
  for (const [provider, userUnknown] of Object.entries(userProviders)) {
    const user = objectOf(userUnknown)
    if (!Array.isArray(user.models) || user.models.length === 0) continue
    const effective = objectOf(effectiveProviders[provider])
    const effectiveModels = Array.isArray(effective.models) ? effective.models : user.models
    const models = effectiveModels
      .map(model => objectOf(model).id)
      .filter(id => typeof id === 'string' && id.length > 0)
    if (models.length > 0) profiles.push({
      provider,
      models,
      ...(typeof effective.reasoning === 'string' ? { defaultEffort: effective.reasoning } : {}),
    })
  }
  return profiles
}

/** Resolve a model id to a user-configured provider, preferring the parent's live provider. */
export function providerForModel(profiles, model, preferredProvider) {
  if (typeof model !== 'string' || model.length === 0) return undefined
  const matches = profiles.filter(profile => profile.models.includes(model))
  return matches.find(profile => profile.provider === preferredProvider)?.provider
    ?? matches[0]?.provider
}

/** Human-readable exact Provider/model choices for model-facing delegation guidance. */
export function targetCatalog(profiles) {
  return profiles
    .flatMap(profile => profile.models.map(model => `${profile.provider}/${model}`))
    .join(', ')
}

/** Validate and detach the optional per-call target fields added to a delegation tool. */
export function delegationTarget(args, profiles) {
  const input = objectOf(args)
  const provider = input.provider
  const model = input.model
  const reasoningEffort = input.reasoning_effort
  if ((provider === undefined) !== (model === undefined)) {
    throw new Error('provider and model must be supplied together for targeted subagent delegation')
  }
  if (reasoningEffort !== undefined && !REASONING_LEVELS.includes(reasoningEffort)) {
    throw new Error(`unsupported reasoning_effort ${JSON.stringify(reasoningEffort)}; choose ${REASONING_LEVELS.join(', ')}`)
  }
  if (provider === undefined) {
    return reasoningEffort === undefined ? undefined : { reasoningEffort }
  }
  if (typeof provider !== 'string' || typeof model !== 'string') {
    throw new Error('provider and model must be strings')
  }
  const profile = profiles.find(entry => entry.provider === provider)
  if (profile === undefined) {
    throw new Error(`unknown configured Provider ${JSON.stringify(provider)}; choose ${profiles.map(entry => entry.provider).join(', ') || '(none configured)'}`)
  }
  if (!profile.models.includes(model)) {
    throw new Error(`model ${JSON.stringify(model)} is not configured for Provider ${JSON.stringify(provider)}; choose ${profile.models.join(', ')}`)
  }
  return {
    provider,
    model,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  }
}

/** Strip this plugin's routing-only fields before calling the official tool body. */
export function baseDelegationArgs(args) {
  const { provider: _provider, model: _model, reasoning_effort: _effort, ...base } = objectOf(args)
  return base
}

/** Add exact per-call route fields to an existing official subagent schema. */
export function targetedParameters(parameters, profiles) {
  const schema = objectOf(parameters)
  const properties = objectOf(schema.properties)
  const providers = profiles.map(profile => profile.provider)
  const models = [...new Set(profiles.flatMap(profile => profile.models))]
  return {
    ...schema,
    properties: {
      ...properties,
      provider: {
        type: 'string',
        ...(providers.length > 0 ? { enum: providers } : {}),
        description: 'Exact configured LLM Provider id for this child. Supply together with model; omit both to inherit the parent route.',
      },
      model: {
        type: 'string',
        ...(models.length > 0 ? { enum: models } : {}),
        description: 'Exact model id owned by provider. Supply together with provider; ambiguous shorthand such as "5.6" is invalid.',
      },
      reasoning_effort: {
        type: 'string',
        enum: REASONING_LEVELS,
        description: 'Optional reasoning effort for this child. Omit it to use the selected Provider/model default.',
      },
    },
  }
}

/**
 * Correct one subagent's initial request.
 *
 * Precedence:
 * 1. A previously logged child route is already durable and is left untouched.
 * 2. Explicit child provider+model stays authoritative.
 * 3. A model-only child override is resolved against user-configured providers.
 * 4. With no child override, inherit the parent's live provider+model.
 * 5. Inherit the parent's explicit/effective effort only for the same route;
 *    otherwise leave it absent so the target provider applies its own default.
 */
export function resolveSubagentRequest({
  proposal,
  childOptions,
  parentOptions,
  parentRoute,
  existingRoute,
  profiles = [],
  inheritRoute = true,
  resolveModelOnly = true,
  inheritReasoning = true,
  parentMissing = false,
}) {
  const proposed = routeOf(proposal)
  if (proposed === undefined || routeOf(existingRoute) !== undefined) return proposal

  const createdParent = routeOf(parentOptions)
  const childCreated = routeOf(childOptions) ?? proposed
  const live = routeOf(parentRoute)
  let target = proposed

  if (inheritRoute && live !== undefined) {
    // Comparing with the parent's create-time route distinguishes an inherited
    // child route from a deliberate tool-level provider/model override. With no
    // live parent, preserve the child's own route rather than guessing.
    const noChildOverride = createdParent !== undefined && sameRoute(childCreated, createdParent)
      && sameRoute(proposed, createdParent)
    const modelOnlyOverride = resolveModelOnly
      && createdParent !== undefined
      && proposed.provider === createdParent.provider
      && proposed.model !== createdParent.model

    if (modelOnlyOverride) {
      const provider = providerForModel(profiles, proposed.model, live.provider)
      if (provider !== undefined) target = { provider, model: proposed.model }
    } else if (noChildOverride || parentMissing) {
      target = { provider: live.provider, model: live.model }
    }
  }

  const resolved = { ...proposal, provider: target.provider, model: target.model }
  if (resolved.reasoningEffort !== undefined || !inheritReasoning || !sameRoute(target, live)) {
    return resolved
  }
  return typeof parentRoute?.reasoningEffort === 'string' && parentRoute.reasoningEffort.length > 0
    ? { ...resolved, reasoningEffort: parentRoute.reasoningEffort }
    : resolved
}

/** Apply one bound per-call target after normal inheritance has been resolved. */
export function applyDelegationTarget(proposal, resolved, explicitTarget) {
  if (explicitTarget === undefined) return resolved
  if (explicitTarget.provider === undefined) return { ...resolved, ...explicitTarget }
  const { reasoningEffort: _inheritedEffort, ...withoutEffort } = proposal
  return { ...withoutEffort, ...explicitTarget }
}

/** Build a same-name wrapper that preserves the official tool lifecycle and output contract. */
export function targetToolDefinition(original, profilesOf, targetContext) {
  if (original?.[TARGET_WRAPPER] === true) return original
  const wrapper = {
    ...original,
    [TARGET_WRAPPER]: true,
    description: `${original.description} When the user names a Provider or model, you MUST delegate instead of answering the task yourself; pass the exact provider/model pair. Ambiguous shorthand must be clarified. Available routes: ${targetCatalog(profilesOf()) || '(none configured)'}.`,
    parameters: targetedParameters(original.parameters, profilesOf()),
    async execute(args, exec) {
      const target = delegationTarget(args, profilesOf())
      const baseArgs = baseDelegationArgs(args)
      if (target === undefined) return original.execute(baseArgs, exec)
      if (exec?.agent === undefined) throw new Error('targeted subagent delegation requires a calling agent')
      return targetContext.run({ parent: exec.agent, target }, () => original.execute(baseArgs, exec))
    },
  }
  return wrapper
}

/** Install scoped wrappers around the ordinary model-facing delegation tools. */
export function installTargetTools(ctx, profilesOf, targetContext) {
  if (ctx.get('tools') === undefined || ctx.get('agents') === undefined) return
  const mounted = new Map()
  let syncing = false
  const syncAgent = (agent, refresh = false) => {
    if (agent?.ctx?.tools?.register === undefined) return
    let records = mounted.get(agent)
    if (records === undefined) {
      records = new Map()
      mounted.set(agent, records)
    }
    if (refresh) {
      for (const { dispose } of records.values()) dispose()
      records.clear()
    }
    for (const toolName of TARGET_TOOL_NAMES) {
      const visible = ctx.get('tools')?.get?.(toolName, agent)
      if (visible === undefined || visible[TARGET_WRAPPER] === true) continue
      const definition = targetToolDefinition(visible, profilesOf, targetContext)
      const dispose = agent.ctx.tools.register(definition)
      records.set(toolName, { original: visible, dispose })
    }
  }
  const syncOne = (agent) => {
    if (syncing) return
    syncing = true
    try {
      syncAgent(agent)
    } finally {
      syncing = false
    }
  }
  const syncAll = () => {
    if (syncing) return
    syncing = true
    try {
      for (const agent of ctx.get('agents')?.list?.() ?? []) syncAgent(agent, true)
    } finally {
      syncing = false
    }
  }
  ctx.on('agent/created', ({ agent }) => { syncOne(agent) })
  ctx.on('agent/disposed', ({ agent }) => {
    const records = mounted.get(agent)
    if (records === undefined) return
    mounted.delete(agent)
    for (const { dispose } of records.values()) dispose()
  })
  ctx.on('tools/change', syncAll)
  ctx.on('settings/updated', (namespace) => {
    if (String(namespace) === 'llm-pi-ai') syncAll()
  })
  ctx.effect(() => () => {
    syncing = true
    try {
      for (const records of mounted.values()) {
        for (const { dispose } of records.values()) dispose()
      }
      mounted.clear()
    } finally {
      syncing = false
    }
  }, 'dsh-reasoning-settings.target-tools')
  syncAll()
}

/** Install the host-plane correction and per-call targeting for in-process children. */
export function apply(ctx, config = {}) {
  if (config.subagentRouting === false) return
  const targetContext = new AsyncLocalStorage()
  const targetByAgent = new WeakMap()
  const profilesOf = () => configuredProviderProfiles(ctx.get('settings'))

  ctx.on('agent/created', ({ agent }) => {
    const pending = targetContext.getStore()
    if (pending === undefined || !isSubagent(agent)) return
    const parentId = agent.session?.header?.parentSession
    if (parentId !== pending.parent?.id) return
    targetByAgent.set(agent, pending.target)
  })

  ctx.on('agent/request', async ({ agent }, next) => {
    const proposal = await next()
    if (!isSubagent(agent)) return proposal

    // A child with a request header has already established its durable route.
    // This matters for later steps and cold-resumed continuable children.
    const existingRoute = establishedChildRoute(agent)
    if (existingRoute !== undefined) return proposal

    const explicitTarget = targetByAgent.get(agent)
    if (explicitTarget?.provider !== undefined) {
      return applyDelegationTarget(proposal, proposal, explicitTarget)
    }

    const parentId = agent.session?.header?.parentSession
    const parent = typeof parentId === 'string' ? ctx.get('agents')?.get?.(parentId) : undefined
    const fallback = ctx.get('agentDefaultModel')?.currentSelection?.()
    const parentRoute = liveParentRoute(parent, fallback)
    const profiles = profilesOf()

    const resolved = resolveSubagentRequest({
      proposal,
      childOptions: agent.options,
      parentOptions: parent?.options,
      parentRoute,
      existingRoute,
      profiles,
      inheritRoute: config.inheritRoute !== false,
      resolveModelOnly: config.resolveModelOnly !== false,
      inheritReasoning: config.inheritReasoning !== false,
      parentMissing: parent === undefined,
    })
    return applyDelegationTarget(proposal, resolved, explicitTarget)
  })

  installTargetTools(ctx, profilesOf, targetContext)
}
