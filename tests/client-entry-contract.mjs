import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const packageJson = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))

assert.equal(
  packageJson.dshClient?.platform,
  'web',
  'DSH Desktop/Web discovers third-party client modules through the dshClient manifest.',
)
assert.deepEqual(
  packageJson.dshClient?.inject,
  packageJson.dsh.client.inject,
  'The compatibility client manifest must request the same DSH services as the bundle manifest.',
)
assert.equal(
  packageJson.exports['./client'],
  './lib/client.js',
  'The manifest must expose the client entry that provides the Settings card.',
)

console.log('reasoning settings client entry contract: PASS')
