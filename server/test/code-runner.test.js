import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodeRunner } from '../src/code-runner.js';

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('compiler sends Python source and stdin to its sandbox and normalizes output', async () => {
  let call;
  const fetchMock = async (url, options) => {
    call = { url, options };
    return response({ status: '0', program_output: '4\n', program_error: '', compiler_output: '', compiler_error: '', compiler_message: '' });
  };
  const runner = createCodeRunner({ codeRunnerUrl: 'https://runner.example/api' }, fetchMock);
  const result = await runner.run({ language: 'python', source: 'print(2 + 2)', stdin: 'value' });
  assert.equal(call.url, 'https://runner.example/api/compile.json');
  assert.deepEqual(JSON.parse(call.options.body), { compiler: 'cpython-3.13.8', code: 'print(2 + 2)', stdin: 'value' });
  assert.equal(result.status, 'Finished');
  assert.equal(result.stdout, '4\n');
  assert.equal(result.statusId, 3);
});

test('compiler uses C++ and distinguishes compilation errors from runtime output', async () => {
  let submitted;
  const fetchMock = async (_url, options) => {
    submitted = JSON.parse(options.body);
    return response({ status: '1', compiler_output: 'main.cpp:1: error: expected ;', program_output: '', program_error: '' });
  };
  const runner = createCodeRunner({ codeRunnerUrl: 'https://runner.example/api' }, fetchMock);
  const result = await runner.run({ language: 'cpp', source: 'int main() { return 0; }', stdin: '' });
  assert.equal(submitted.compiler, 'gcc-13.2.0');
  assert.equal(result.status, 'Compilation Error');
  assert.equal(result.compileOutput, 'main.cpp:1: error: expected ;');
});

test('compiler validates language, source, input, and UTF-8 byte limits before calling its provider', async () => {
  let requests = 0;
  const runner = createCodeRunner({ codeRunnerUrl: 'https://runner.example/api' }, async () => { requests++; return response({}); });
  await assert.rejects(runner.run({ language: 'ruby', source: 'puts 1' }), { code: 'VALIDATION_FAILED' });
  await assert.rejects(runner.run({ language: 'cpp', source: ' ' }), { code: 'VALIDATION_FAILED' });
  await assert.rejects(runner.run({ language: 'python', source: 'x'.repeat(64 * 1024 + 1) }), { code: 'PAYLOAD_TOO_LARGE' });
  await assert.rejects(runner.run({ language: 'python', source: 'print(1)', stdin: 'x'.repeat(16 * 1024 + 1) }), { code: 'PAYLOAD_TOO_LARGE' });
  assert.equal(requests, 0);
});

test('compiler drops oversized provider responses instead of buffering unbounded output', async () => {
  const runner = createCodeRunner({ codeRunnerUrl: 'https://runner.example/api' }, async () =>
    new Response(JSON.stringify({ status: '0', program_output: 'x'.repeat(200 * 1024) }), { status: 200 }),
  );
  await assert.rejects(runner.run({ language: 'python', source: 'print(1)' }), { code: 'CODE_RUNNER_ERROR' });
});

