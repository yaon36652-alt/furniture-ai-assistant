const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
let mockModel;
let appProcess;
let appUrl;
let receivedRequest;
let runtimeRoot;

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function waitForServer(url, child) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (child.exitCode !== null) return reject(new Error('app server exited before listening'));
      http.get(`${url}/api/health`, response => {
        response.resume();
        if (response.statusCode === 200) return resolve();
        retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - started > 5000) return reject(new Error('app server did not start'));
      setTimeout(check, 50);
    };
    check();
  });
}

before(async () => {
  mockModel = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedRequest = { authorization: req.headers.authorization, body: JSON.parse(body) };
      const question = receivedRequest.body.messages.at(-1).content;
      if (question === 'test-auth' || question === 'test-rate-limit' || question === 'test-model-not-found' || question === 'test-endpoint-not-found') {
        const status = question === 'test-auth' ? 401 : question === 'test-rate-limit' ? 429 : 404;
        const message = question === 'test-model-not-found' ? 'model does not exist' : question === 'test-endpoint-not-found' ? 'route not found' : 'private upstream error';
        res.writeHead(status, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: { message } }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '已结合卧室尺寸、预算和家具清单回答。' } }] }));
    });
  });
  const mockPort = await listen(mockModel);
  const probe = http.createServer();
  const appPort = await listen(probe);
  await new Promise(resolve => probe.close(resolve));
  appUrl = `http://127.0.0.1:${appPort}`;
  runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'furniguide-proxy-test-'));
  fs.copyFileSync(path.join(projectRoot, 'server.js'), path.join(runtimeRoot, 'server.js'));
  appProcess = spawn(process.execPath, ['server.js'], {
    cwd: runtimeRoot,
    env: { ...process.env, PORT: String(appPort), OPENAI_API_KEY: 'test-only-key', OPENAI_BASE_URL: `http://127.0.0.1:${mockPort}/v1`, OPENAI_MODEL: 'test-model' },
    stdio: 'ignore'
  });
  await waitForServer(appUrl, appProcess);
});

after(async () => {
  if (appProcess && appProcess.exitCode === null) {
    appProcess.kill();
    await once(appProcess, 'exit');
  }
  if (runtimeRoot) fs.rmSync(runtimeRoot, { recursive: true, force: true });
  if (mockModel?.listening) await new Promise(resolve => mockModel.close(resolve));
});

test('uses runtime environment configuration without a .env.local file', async () => {
  const response = await fetch(`${appUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'base-url-priority' })
  });
  assert.equal(response.status, 200);
  assert.equal(receivedRequest.body.model, 'test-model');
});

test('runtime OpenAI and Supabase variables survive missing or conflicting local files', () => {
  const envRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'furniguide-env-priority-test-'));
  try {
    fs.copyFileSync(path.join(projectRoot, 'server.js'), path.join(envRoot, 'server.js'));
    const runtimeEnv = {
      OPENAI_API_KEY: 'runtime-test-only-key',
      OPENAI_BASE_URL: 'https://runtime-env.example/v1',
      OPENAI_MODEL: 'runtime-test-model',
      SUPABASE_URL: 'https://runtime-supabase.example',
      SUPABASE_ANON_KEY: 'runtime-test-only-anon-key'
    };
    const script = `require('./server.js'); const keys = ${JSON.stringify(Object.keys(runtimeEnv))}; process.stdout.write(JSON.stringify(Object.fromEntries(keys.map(key => [key, process.env[key]]))))`;
    for (const hasLocalFiles of [false, true]) {
      if (hasLocalFiles) {
        for (const file of ['.env.local', '.env']) {
          fs.writeFileSync(path.join(envRoot, file), Object.keys(runtimeEnv).map(key => `${key}=file-test-only-value`).join('\n'));
        }
      }
      const result = spawnSync(process.execPath, ['-e', script], {
        cwd: envRoot,
        env: { ...process.env, FURNIGUIDE_ROOT: envRoot, ...runtimeEnv },
        encoding: 'utf8'
      });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), runtimeEnv);
    }
  } finally {
    fs.rmSync(envRoot, { recursive: true, force: true });
  }
});

test('forwards chat and sanitized room, budget, and selected furniture context to the model', async () => {
  const response = await fetch(`${appUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: '这个书桌放得下吗？',
      context: {
        roomName: '卧室',
        dimensions: { length: 360, width: 270, doorWidth: 82, height: 275, injected: 'discard-me' },
        household: 3,
        budget: { limit: 12000, spent: 5498, remaining: 6502 },
        shopping: [{ id: 'desk', name: '静音书桌', category: '书桌', price: 1499, size: '120 × 60 × 75 cm' }]
      }
    })
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.mode, 'model');
  assert.match(result.answer, /卧室尺寸/);
  assert.equal(receivedRequest.authorization, 'Bearer test-only-key');
  assert.equal(receivedRequest.body.model, 'test-model');
  const systemPrompt = receivedRequest.body.messages.find(message => message.role === 'system').content;
  assert.match(systemPrompt, /"roomName":"卧室"/);
  assert.match(systemPrompt, /"width":270/);
  assert.match(systemPrompt, /"limit":12000/);
  assert.match(systemPrompt, /"name":"静音书桌"/);
  assert.match(systemPrompt, /高效、亲切、接地气的 C 端电商软装 AI 导购/);
  assert.match(systemPrompt, /结论先行 \+ 核心原因 \+ 建议动作/);
  assert.match(systemPrompt, /最多 3 条/);
  assert.doesNotMatch(systemPrompt, /discard-me/);
  assert.doesNotMatch(JSON.stringify(result), /test-only-key/);
});

test('does not serve secrets or backend source files', async () => {
  for (const file of ['.env', '.env.local', '.env.example', 'server.js', 'tests/ai-proxy.test.js']) {
    const response = await fetch(`${appUrl}/${file}`);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), 'Not found');
  }
});

test('rejects invalid input without forwarding it to the model', async () => {
  for (const body of ['{invalid', 'null', '[]', '{"message":""}']) {
    const response = await fetch(`${appUrl}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, 400);
  }
  const response = await fetch(`${appUrl}/api/chat`, { method: 'POST', body: JSON.stringify({ message: 'x'.repeat(2001) }) });
  assert.equal(response.status, 413);
});

test('maps provider authentication and rate limits to actionable safe errors', async () => {
  for (const [message, code] of [['test-auth', 'model_auth_failed'], ['test-rate-limit', 'model_rate_limited']]) {
    const response = await fetch(`${appUrl}/api/chat`, { method: 'POST', body: JSON.stringify({ message }) });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.error, code);
    assert.doesNotMatch(JSON.stringify(body), /test-only-key|private upstream error/);
  }
});

test('distinguishes missing models from an invalid API endpoint', async () => {
  for (const [message, code] of [['test-model-not-found', 'model_not_found'], ['test-endpoint-not-found', 'model_endpoint_not_found']]) {
    const response = await fetch(`${appUrl}/api/chat`, { method: 'POST', body: JSON.stringify({ message }) });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.error, code);
    assert.match(body.message, /OPENAI_(MODEL|BASE_URL)/);
  }
});
