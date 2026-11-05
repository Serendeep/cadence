// Starts the Vite dev server, then opens it in Electron. Closing the window stops both.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'vite'

const server = await createServer()
await server.listen()
const url = server.resolvedUrls?.local[0]
if (!url) throw new Error('Vite did not report a local URL')

const electron = createRequire(import.meta.url)('electron')
// a parent Electron app (an editor, a terminal) may leak this, which would start Electron as plain Node
const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...env, VITE_DEV_SERVER_URL: url } })
child.on('exit', async (code) => {
  await server.close()
  process.exit(code ?? 0)
})
