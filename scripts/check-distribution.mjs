import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkArtifact } from './check-artifact.mjs'
import { verifyDistributionManifest } from './distribution-manifest.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
// npm and pnpm may rebuild Git packages with these scripts. Distribution is
// deliberately prebuilt; only explicitly named developer commands build it.
for (const hook of ['build', 'prepare', 'prepack', 'postpack', 'prepublish', 'prepublishOnly', 'publish', 'preinstall', 'install', 'postinstall']) {
  assert(!manifest.scripts?.[hook], `Git distribution must not contain the ${hook} script`)
}
assert(!manifest.workspaces, 'Git distribution must not require a workspace build')
assert.deepEqual([...manifest.files].sort(), ['README.md', 'assets/icon.svg', 'cordis.patch.yml', 'lib', 'locale'])
assert.equal(manifest.exports['./locale/*'], './locale/*')
for (const language of ['en', 'zh-CN']) {
  const locale = JSON.parse(await readFile(path.join(root, 'locale', `${language}.json`), 'utf8'))
  assert.equal(locale.meta.title, 'DeepSeek Chat')
}
// The settings namespace must remain aligned with the shipped Cordis entry ID.
const patch = await readFile(path.join(root, 'cordis.patch.yml'), 'utf8')
const identity = await readFile(path.join(root, 'src/identity.ts'), 'utf8')
const entryId = identity.match(/HOST_ENTRY_ID = '([^']+)'/)?.[1]
assert(entryId, 'Missing Host settings entry ID')
assert.equal(patch.match(/^[ \t]*- id: (\S+)/m)?.[1], entryId, 'Cordis entry and settings namespace differ')
const client = await readFile(path.join(root, 'src/client.ts'), 'utf8')
assert(/configForms\.get<\{[^}]*\}>\(HOST_ENTRY_ID\)/.test(client), 'Preferences must use the shared Host entry ID')
await checkArtifact(root)
const release = await verifyDistributionManifest(root)
console.log(`Prebuilt distribution passed: ${release.name}@${release.version}; ${Object.keys(release.artifacts).length} compiled files match source inputs.`)
