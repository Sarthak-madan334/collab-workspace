import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAuthFields } from '../src/auth-validation.js';

test('requires a nonblank name, valid email, and a 12-character registration password', () => {
  assert.deepEqual(validateAuthFields({ register: true, name: '  ', email: 'bad-email', password: 'short' }), {
    name: 'Enter your full name.',
    email: 'Enter a valid email address.',
    password: 'Password must be at least 12 characters.',
  });
});

test('accepts registration details supported by the existing API', () => {
  assert.deepEqual(validateAuthFields({
    register: true,
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'long-enough-password',
  }), {});
});

test('requires email and password for sign in without imposing registration password rules', () => {
  assert.deepEqual(validateAuthFields({ register: false, name: '', email: '', password: '' }), {
    email: 'Enter your email address.',
    password: 'Enter your password.',
  });
  assert.deepEqual(validateAuthFields({ register: false, name: '', email: 'ada@example.com', password: 'short' }), {});
});

test('trims email for validation and enforces the server maximum', () => {
  assert.deepEqual(validateAuthFields({
    register: true,
    name: 'Ada',
    email: ' ada@example.com ',
    password: 'long-enough-password',
  }), {});
  assert.match(validateAuthFields({
    register: false,
    name: '',
    email: `${'a'.repeat(247)}@example.com`,
    password: 'password',
  }).email, /valid email/);
});
