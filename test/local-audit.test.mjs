import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { promisify } from 'node:util';
import { auditLocalRepo } from '../src/local.mjs';

const execFileAsync = promisify(execFile);
const serverPath = path.join(import.meta.dirname, '..', 'mcp', 'server.mjs');

async function createRepo(root, name) {
  const repo = path.join(root, name);
  fs.mkdirSync(repo);
  await execFileAsync('git', ['init', repo]);
  await execFileAsync('git', ['-C', repo, 'config', 'user.email', 'scanner@example.invalid']);
  await execFileAsync('git', ['-C', repo, 'config', 'user.name', 'Scanner Fixture']);
  fs.writeFileSync(path.join(repo, 'README.md'), '# Safe fixture\n\nTracked source only.\n');
  fs.writeFileSync(path.join(repo, 'app.js'), 'console.log("safe");\n');
  await execFileAsync('git', ['-C', repo, 'add', 'README.md', 'app.js']);
  await execFileAsync('git', ['-C', repo, 'commit', '-m', 'fixture']);
  return repo;
}

function startMcp(allowedRoots) {
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      REPO_SCANNER_LOCAL_ROOTS: allowedRoots.join(path.delimiter),
    },
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const lines = readline.createInterface({ input: child.stdout });
  const pending = new Map();
  lines.on('line', (line) => {
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (waiter) {
      pending.delete(message.id);
      waiter(message);
    }
  });
  let nextId = 1;
  const request = (method, params = {}) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  return { child, request };
}

test('audit_repo scans only tracked files in an allowlisted local Git root', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-scanner-local-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = await createRepo(root, 'private-project');
  fs.writeFileSync(
    path.join(repo, 'untracked-secret.json'),
    '{"api_key":"abcdefghijklmnopqrstuvwxyz123456"}\n',
  );

  const mcp = startMcp([root]);
  t.after(() => mcp.child.kill());

  const listed = await mcp.request('tools/list');
  const auditTool = listed.result.tools.find((tool) => tool.name === 'audit_repo');
  assert.ok(auditTool.inputSchema.properties.repoPath);
  assert.ok(Array.isArray(auditTool.inputSchema.oneOf));

  const clean = await mcp.request('tools/call', {
    name: 'audit_repo',
    arguments: { repoPath: repo },
  });
  assert.equal(clean.error, undefined);
  const cleanResult = JSON.parse(clean.result.content[0].text);
  assert.equal(cleanResult.source, 'local-tracked-files');
  assert.equal(cleanResult.private, true);
  assert.equal(cleanResult.exposed, false);
  assert.deepEqual(cleanResult.seriousFindings, []);
  assert.equal(cleanResult.trackedFiles, 2);

  fs.writeFileSync(
    path.join(repo, 'app.js'),
    'const api_key = "abcdefghijklmnopqrstuvwxyz123456";\n',
  );
  const dirty = await mcp.request('tools/call', {
    name: 'audit_repo',
    arguments: { repoPath: repo },
  });
  const dirtyResult = JSON.parse(dirty.result.content[0].text);
  assert.equal(dirtyResult.exposed, false, 'audit must read committed bytes, not dirty worktree bytes');
  assert.equal(dirtyResult.commit, cleanResult.commit);
  fs.writeFileSync(path.join(repo, 'app.js'), 'console.log("safe");\n');

  fs.writeFileSync(path.join(repo, 'config.json'), '{"endpoint":"http://192.168.1.30"}\n');
  await execFileAsync('git', ['-C', repo, 'add', 'config.json']);
  await execFileAsync('git', ['-C', repo, 'commit', '-m', 'exposure fixture']);

  const exposed = await mcp.request('tools/call', {
    name: 'audit_repo',
    arguments: { repoPath: repo },
  });
  const exposedResult = JSON.parse(exposed.result.content[0].text);
  assert.equal(exposedResult.exposed, true);
  assert.match(exposedResult.seriousFindings.join('\n'), /private LAN IP in config\.json/);
});

test('audit_repo rejects a local repository outside configured roots', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-scanner-root-'));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-scanner-other-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  const repo = await createRepo(other, 'outside');
  const mcp = startMcp([root]);
  t.after(() => mcp.child.kill());

  const response = await mcp.request('tools/call', {
    name: 'audit_repo',
    arguments: { repoPath: repo },
  });
  assert.equal(response.error.code, -32000);
  assert.match(response.error.message, /outside configured local roots/i);
});

test('auditLocalRepo never reports a newer commit than the tree it scanned', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-scanner-race-'));
  const originalRoots = process.env.REPO_SCANNER_LOCAL_ROOTS;
  process.env.REPO_SCANNER_LOCAL_ROOTS = root;
  t.after(() => {
    if (originalRoots === undefined) delete process.env.REPO_SCANNER_LOCAL_ROOTS;
    else process.env.REPO_SCANNER_LOCAL_ROOTS = originalRoots;
    fs.rmSync(root, { recursive: true, force: true });
  });

  for (const delay of [20, 40, 80, 160]) {
    const repo = await createRepo(root, `race-${delay}`);
    for (let index = 0; index < 12; index += 1) {
      fs.writeFileSync(
        path.join(repo, `config-${String(index).padStart(2, '0')}.json`),
        JSON.stringify({ safe: 'x'.repeat(120_000) }),
      );
    }
    await execFileAsync('git', ['-C', repo, 'add', '.']);
    await execFileAsync('git', ['-C', repo, 'commit', '-m', 'large safe tree']);

    const audit = auditLocalRepo(repo);
    const advanceHead = new Promise((resolve, reject) => {
      setTimeout(async () => {
        try {
          fs.writeFileSync(
            path.join(repo, 'config-00.json'),
            '{"api_key":"abcdefghijklmnopqrstuvwxyz123456"}\n',
          );
          await execFileAsync('git', ['-C', repo, 'add', 'config-00.json']);
          await execFileAsync('git', ['-C', repo, 'commit', '-m', 'advance during audit']);
          resolve();
        } catch (error) {
          reject(error);
        }
      }, delay);
    });

    const [result] = await Promise.all([audit, advanceHead]);
    const currentHead = (await execFileAsync(
      'git',
      ['-C', repo, 'rev-parse', 'HEAD'],
      { encoding: 'utf8' },
    )).stdout.trim();
    assert.equal(
      result.commit === currentHead && result.exposed === false,
      false,
      `reported commit ${currentHead} without scanning its committed credential at ${delay}ms`,
    );
  }
});
