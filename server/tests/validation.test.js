const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateEmail,
  validatePassword,
  isValidObjectId
} = require('../utils/validation');

test('validateEmail accepts and normalizes valid email', () => {
  const result = validateEmail('  USER@example.com ');
  assert.equal(result.valid, true);
  assert.equal(result.email, 'user@example.com');
});

test('validateEmail rejects malformed email', () => {
  const result = validateEmail('invalid-email');
  assert.equal(result.valid, false);
});

test('validatePassword defaults to minimum length 8', () => {
  const short = validatePassword('abc123');
  assert.equal(short.valid, false);

  const valid = validatePassword('abc12345');
  assert.equal(valid.valid, true);
});

test('isValidObjectId validates mongodb object id format', () => {
  assert.equal(isValidObjectId('507f191e810c19729de860ea'), true);
  assert.equal(isValidObjectId('not-an-object-id'), false);
});
