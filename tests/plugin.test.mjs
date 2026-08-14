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

console.log('plugin tests passed')
