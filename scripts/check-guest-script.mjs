import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'

/**
 * The guest command script is built with Function.prototype.toString, so every
 * identifier it references must be declared inside the serialized functions.
 * A module-level constant compiles fine but throws ReferenceError in the website
 * guest, where the whole injected command then fails as "Script failed to execute".
 * This guard serializes the real command and rejects any undeclared reference.
 */
export async function checkGuestScript(projectRoot) {
  // The system temp directory is not writable under this host's sandbox; build
  // inside the repository, exactly like scripts/test.mjs.
  const directory = await mkdtemp(path.join(projectRoot, '.guest-build-'))
  try {
    const entry = path.join(directory, 'navigation.mjs')
    await build({
      stdin: { contents: "export { websiteCommandScript } from './src/website-navigation.ts'", resolveDir: projectRoot, loader: 'ts' },
      bundle: true, format: 'esm', platform: 'neutral', outfile: entry, logLevel: 'silent',
    })
    const { websiteCommandScript } = await import(pathToFileURL(entry))
    const scripts = [
      websiteCommandScript({ type: 'snapshot', showOriginal: false, headerInset: 24 }, 14, 'dark'),
      websiteCommandScript({ type: 'restore' }, 14, 'dark'),
    ]
    for (const script of scripts) {
      // Only the serialized function bodies are meaningful; the wrapper declares
      // its own locals (document, location, command, shareCopy, typography, theme).
      const declared = new Set([...script.matchAll(/\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]))
      const wrapperLocals = ['shareCopy', 'typography', 'theme', 'collapseWebsiteSidebar', 'adaptWebsiteSettings', 'adaptWebsiteHeader', 'dismissWebsiteEnvironmentNotice', 'adapt', 'command', 'before', 'error']
      // Module constants are SCREAMING_SNAKE; those are the ones that leaked before.
      const referenced = new Set([...script.matchAll(/\b([A-Z][A-Z0-9_]{3,})\b/g)].map(m => m[1]))
      const leaked = [...referenced].filter(name => !declared.has(name) && !wrapperLocals.includes(name))
      if (leaked.length > 0) {
        throw new Error(`Guest script references undeclared module constants: ${leaked.join(', ')}. Declare them inside the serialized function.`)
      }
      // Parse the script too: a syntax error is also "Script failed to execute".
      new Function('document', 'location', 'return (' + script + ')')
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function pathToFileURL(value) { return 'file:///' + value.replace(/\\/g, '/').replace(/^\//, '') }
