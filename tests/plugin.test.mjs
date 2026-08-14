import assert from 'node:assert/strict'

let definition
globalThis.window = {
  __ModuleLoader__: {
    load(value) { definition = value },
  },
}
globalThis.document = {
  head: { appendChild() {} },
  createElement() { return { dataset: {}, textContent: '' } },
}

await import('../lib/client.js')
assert.equal(definition.id, 'dsh-reasoning-settings')

const React = {
  Fragment: Symbol('Fragment'),
  createElement() {},
  useCallback() {},
  useEffect() {},
  useMemo() {},
  useRef() {},
  useState() {},
}
const plugin = definition.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected dependency: ${id}`)
})
const test = plugin.__test

const drafts = test.providerDrafts({
  revision: 2,
  value: {
    providers: {
      relay: {
        api: 'openai-responses',
        displayName: 'Relay',
        reasoning: 'high',
        models: [{ id: 'alpha', name: 'Alpha' }],
      },
    },
  },
  user: {
    providers: {
      relay: {
        api: 'openai-responses',
        models: [{ id: 'alpha', name: 'Alpha', contextWindow: 1000 }],
      },
    },
  },
})
assert.equal(drafts.length, 1)
assert.equal(drafts[0].models[0].mode, 'inherit')
assert.equal(drafts[0].defaultEffort, 'high')

const catalogOnly = test.providerDrafts({
  value: { providers: { openai: { models: [{ id: 'catalog-model' }] } } },
  user: { providers: { openai: { apiKeyEnv: 'OPENAI_API_KEY' } } },
})
assert.deepEqual(catalogOnly, [])

const configured = {
  ...drafts[0],
  defaultEffort: 'high',
  models: [{
    ...drafts[0].models[0],
    mode: 'custom',
    efforts: { low: 'low', medium: 'medium', high: 'high' },
  }],
}
assert.equal(test.validateProvider(configured), undefined)
assert.deepEqual(test.commonLevels(configured), ['low', 'medium', 'high'])
assert.deepEqual(test.buildModels(configured), [{
  id: 'alpha', name: 'Alpha', contextWindow: 1000,
  reasoningEfforts: { low: 'low', medium: 'medium', high: 'high' },
}])

const invalid = {
  ...configured,
  defaultEffort: 'max',
}
assert.equal(test.validateProvider(invalid).key, 'validationDefault')

const offOnly = {
  ...configured,
  defaultEffort: '',
  models: [{ ...configured.models[0], efforts: { off: null } }],
}
assert.equal(test.validateProvider(offOnly).key, 'validationNoLevel')

// Server-side subagent routing.
const server = await import('../lib/index.js')

assert.equal(server.isSubagent({ session: { header: { origin: 'subagent' } } }), true)
assert.equal(server.isSubagent({ session: { header: { delegationDepth: 1 } } }), true)
assert.equal(server.isSubagent({ session: { header: { parentSession: 'ordinary-fork' } } }), false)
assert.equal(server.isSubagent({ session: { header: {} } }), false)

const settingsDescriptor = {
  describe() {
    return [{
      ns: 'llm-pi-ai',
      value: {
        providers: {
          relay: { models: [{ id: 'grok-4.5' }, { id: 'shared' }] },
          backup: { models: [{ id: 'shared' }] },
          openai: { models: [{ id: 'catalog-only' }] },
        },
      },
      user: {
        providers: {
          relay: { models: [{ id: 'grok-4.5' }, { id: 'shared' }] },
          backup: { models: [{ id: 'shared' }] },
          openai: { apiKeyEnv: 'OPENAI_API_KEY' },
        },
      },
    }]
  },
}
const profiles = server.configuredProviderProfiles(settingsDescriptor)
assert.deepEqual(profiles, [
  { provider: 'relay', models: ['grok-4.5', 'shared'] },
  { provider: 'backup', models: ['shared'] },
])
assert.equal(server.providerForModel(profiles, 'grok-4.5', 'deepseek-official'), 'relay')
assert.equal(server.providerForModel(profiles, 'shared', 'backup'), 'backup')
assert.equal(server.providerForModel(profiles, 'missing', 'relay'), undefined)

const parentOptions = { provider: 'deepseek-official', model: 'deepseek-v4-flash' }
const liveParent = { provider: 'relay', model: 'grok-4.5', reasoningEffort: 'high' }
assert.deepEqual(server.liveParentRoute({
  options: parentOptions,
  session: { requestHeader: () => ({ config: liveParent }) },
}), liveParent)
assert.deepEqual(server.liveParentRoute({
  options: parentOptions,
  session: {
    requestHeader: () => ({ config: liveParent, adapterDefaults: { reasoningEffort: true } }),
  },
}), { provider: 'relay', model: 'grok-4.5' })

// No child override: inherit the parent's actual live route and effort.
assert.deepEqual(server.resolveSubagentRequest({
  proposal: parentOptions,
  childOptions: parentOptions,
  parentOptions,
  parentRoute: liveParent,
  profiles,
}), liveParent)

// A model-only override must resolve to the user-configured provider rather
// than keep the inherited official route. Its target provider default remains
// authoritative, so an effort from a different parent model is not copied.
assert.deepEqual(server.resolveSubagentRequest({
  proposal: { provider: 'deepseek-official', model: 'grok-4.5' },
  childOptions: { provider: 'deepseek-official', model: 'grok-4.5' },
  parentOptions,
  parentRoute: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'max' },
  profiles,
}), { provider: 'relay', model: 'grok-4.5' })

// Explicit provider/model and explicit effort stay authoritative.
assert.deepEqual(server.resolveSubagentRequest({
  proposal: { provider: 'backup', model: 'shared', reasoningEffort: 'low' },
  childOptions: { provider: 'backup', model: 'shared' },
  parentOptions,
  parentRoute: liveParent,
  profiles,
}), { provider: 'backup', model: 'shared', reasoningEffort: 'low' })
assert.deepEqual(server.resolveSubagentRequest({
  proposal: { provider: 'deepseek-official', model: 'unknown-model' },
  childOptions: { provider: 'deepseek-official', model: 'unknown-model' },
  parentOptions,
  parentRoute: liveParent,
  profiles,
}), { provider: 'deepseek-official', model: 'unknown-model' })

// Fork seed headers are parent history, while a live child header is sticky.
const sticky = { provider: 'relay', model: 'grok-4.5' }
assert.equal(server.establishedChildRoute({
  session: {
    header: { seedLength: 5 },
    firstLiveSeq: 12,
    events: [
      { type: 'request/header', seq: 2, data: { header: { config: parentOptions } } },
      { type: 'request/header', seq: 6, data: { header: { config: sticky } } },
    ],
  },
}), sticky)
assert.equal(server.establishedChildRoute({
  session: {
    header: { seedLength: 5 },
    firstLiveSeq: 12,
    events: [{ type: 'request/header', seq: 2, data: { header: { config: parentOptions } } }],
  },
}), undefined)
// Cold resume moves firstLiveSeq to the end of the existing log, but seedLength
// still identifies the child's own durable request header.
assert.equal(server.establishedChildRoute({
  session: {
    header: { seedLength: 5 },
    firstLiveSeq: 12,
    events: [{ type: 'request/header', seq: 8, data: { header: { config: sticky } } }],
  },
}), sticky)

// Once the child has logged a route, later steps and cold resumes remain sticky.
assert.equal(server.resolveSubagentRequest({
  proposal: sticky,
  childOptions: parentOptions,
  parentOptions,
  parentRoute: liveParent,
  existingRoute: sticky,
  profiles,
}), sticky)

// Exercise the actual Cordis-style listener without Harness runtime imports.
let requestListener
const parentAgent = {
  options: parentOptions,
  session: { requestHeader: () => ({ config: liveParent }) },
}
const fakeCtx = {
  on(event, listener) {
    assert.equal(event, 'agent/request')
    requestListener = listener
  },
  get(service) {
    if (service === 'agents') return { get: id => id === 'parent' ? parentAgent : undefined }
    if (service === 'agentDefaultModel') return { currentSelection: () => parentOptions }
    if (service === 'settings') return settingsDescriptor
    return undefined
  },
}
server.apply(fakeCtx)
const childAgent = {
  options: parentOptions,
  session: {
    header: { origin: 'subagent', parentSession: 'parent', delegationDepth: 1 },
    requestHeader: () => undefined,
  },
}
assert.deepEqual(await requestListener(
  { agent: childAgent },
  async () => ({ ...parentOptions }),
), liveParent)
assert.deepEqual(await requestListener(
  { agent: { options: parentOptions, session: { header: {}, requestHeader: () => undefined } } },
  async () => ({ ...parentOptions }),
), parentOptions)

const missingParentCtx = {
  on(event, listener) {
    assert.equal(event, 'agent/request')
    requestListener = listener
  },
  get(service) {
    if (service === 'agents') return { get: () => undefined }
    if (service === 'agentDefaultModel') return {
      currentSelection: () => ({ provider: 'relay', model: 'grok-4.5' }),
    }
    return undefined
  },
}
server.apply(missingParentCtx)
assert.deepEqual(await requestListener(
  { agent: childAgent },
  async () => ({ ...parentOptions }),
), { provider: 'relay', model: 'grok-4.5' })

// If the parent is being disposed, use the current default selection instead
// of reverting to the child's stale create-time official route.
assert.deepEqual(server.resolveSubagentRequest({
  proposal: parentOptions,
  childOptions: parentOptions,
  parentOptions: undefined,
  parentRoute: { provider: 'relay', model: 'grok-4.5' },
  parentMissing: true,
  profiles,
}), { provider: 'relay', model: 'grok-4.5' })

console.log('plugin tests passed')
