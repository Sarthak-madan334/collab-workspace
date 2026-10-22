import { assert } from './errors.js';

const COMPILERS = Object.freeze({ python: 'cpython-3.13.8', cpp: 'gcc-13.2.0' });
const MAX_CODE_BYTES = 64 * 1024;
const MAX_INPUT_BYTES = 16 * 1024;
const MAX_OUTPUT_CHARS = 32 * 1024;
const MAX_RESPONSE_BYTES = 192 * 1024;
const RUN_TIMEOUT_MS = 20_000;

function output(value) {
  return typeof value === 'string' ? value.slice(0, MAX_OUTPUT_CHARS) : '';
}

async function readResult(response) {
  if (!response.body?.getReader) return response.json();
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error('Compiler response exceeded its size limit');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function createCodeRunner({ codeRunnerUrl }, fetchImpl = fetch) {
  async function run(payload) {
    assert(payload && typeof payload === 'object' && !Array.isArray(payload), 400, 'INVALID_REQUEST', 'A code run request is required');
    assert(Object.keys(payload).every((key) => ['language', 'source', 'stdin'].includes(key)), 400, 'INVALID_REQUEST', 'Unexpected field');
    assert(Object.hasOwn(COMPILERS, payload.language), 422, 'VALIDATION_FAILED', 'Choose Python or C++');
    assert(typeof payload.source === 'string' && payload.source.trim().length > 0, 422, 'VALIDATION_FAILED', 'Add some code before running it');
    assert(Buffer.byteLength(payload.source, 'utf8') <= MAX_CODE_BYTES, 413, 'PAYLOAD_TOO_LARGE', 'Code exceeds 64 KiB');
    assert(typeof (payload.stdin ?? '') === 'string' && Buffer.byteLength(payload.stdin ?? '', 'utf8') <= MAX_INPUT_BYTES, 413, 'PAYLOAD_TOO_LARGE', 'Program input exceeds 16 KiB');

    let response;
    try {
      response = await fetchImpl(`${codeRunnerUrl}/compile.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ compiler: COMPILERS[payload.language], code: payload.source, stdin: payload.stdin || '' }),
        signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
      });
    } catch (failure) {
      const timeout = failure?.name === 'TimeoutError' || failure?.name === 'AbortError';
      const error = new Error(timeout ? 'This run took too long. Try again with a smaller program.' : 'The compiler could not be reached. Try again shortly.');
      error.status = timeout ? 504 : 503;
      error.code = timeout ? 'CODE_RUNNER_TIMEOUT' : 'CODE_RUNNER_UNAVAILABLE';
      throw error;
    }
    if (!response.ok) {
      const error = new Error(response.status === 429 || response.status >= 500
        ? 'The shared compiler is busy. Try again in a moment.'
        : 'The compiler could not accept this run. Try again shortly.');
      error.status = response.status === 429 || response.status >= 500 ? 503 : 502;
      error.code = response.status === 429 || response.status >= 500 ? 'CODE_RUNNER_BUSY' : 'CODE_RUNNER_ERROR';
      throw error;
    }
    let result;
    try { result = await readResult(response); } catch {
      const error = new Error('The compiler returned an unreadable result. Try again.');
      error.status = 502;
      error.code = 'CODE_RUNNER_ERROR';
      throw error;
    }

    const compileOutput = output(result.compiler_output || result.compiler_error);
    const stderr = output(result.program_error);
    const stdout = output(result.program_output);
    const success = result.status === '0' && !result.signal;
    return {
      status: success ? 'Finished' : compileOutput ? 'Compilation Error' : result.signal ? `Stopped (${output(result.signal)})` : 'Runtime Error',
      statusId: success ? 3 : compileOutput ? 6 : 7,
      stdout,
      stderr,
      compileOutput,
      message: output(result.program_message || result.compiler_message),
      time: null,
      memory: null,
    };
  }

  return { run };
}
