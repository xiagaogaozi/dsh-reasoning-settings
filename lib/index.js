export const name = 'dsh-reasoning-settings'
export const inject = []

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
    if (models.length > 0) profiles.push({ provider, models })
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

/** Install the host-plane correction for in-process spawn/fork/workflow children. */
export function apply(ctx, config = {}) {
  if (config.subagentRouting === false) return
  ctx.on('agent/request', async ({ agent }, next) => {
    const proposal = await next()
    if (!isSubagent(agent)) return proposal

    // A child with a request header has already established its durable route.
    // This matters for later steps and cold-resumed continuable children.
    const existingRoute = establishedChildRoute(agent)
    if (existingRoute !== undefined) return proposal

    const parentId = agent.session?.header?.parentSession
    const parent = typeof parentId === 'string' ? ctx.get('agents')?.get?.(parentId) : undefined
    const fallback = ctx.get('agentDefaultModel')?.currentSelection?.()
    const parentRoute = liveParentRoute(parent, fallback)
    const profiles = configuredProviderProfiles(ctx.get('settings'))

    return resolveSubagentRequest({
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
  })
}
