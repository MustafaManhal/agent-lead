import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from '../../skills/agent-lead/tools/mcp-client.mjs'

test('pending and later MCP calls reject promptly when the child exits', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-lead-mcp-'))
  const script = join(dir, 'server.mjs')
  await writeFile(script, `
    import readline from 'node:readline'
    const rl = readline.createInterface({ input: process.stdin })
    rl.on('line', line => {
      const msg = JSON.parse(line)
      if (msg.method === 'initialize') {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'fake', version: '1' } } }) + '\\n')
        setTimeout(() => process.exit(0), 80)
      }
    })
  `)
  let client
  try {
    client = await connect({ command: process.execPath, args: [script] }, { timeout: 5000 })
    const started = Date.now()
    await assert.rejects(client.call('never-replies', {}, 5000), /MCP server exited before replying \(code 0\)/)
    assert.ok(Date.now() - started < 1500, 'pending request should fail on process exit, not its 5s timeout')
    await assert.rejects(client.call('after-exit', {}, 5000), /MCP server exited before replying \(code 0\)/)
  } finally {
    await client?.close()
    await rm(dir, { recursive: true, force: true })
  }
})
