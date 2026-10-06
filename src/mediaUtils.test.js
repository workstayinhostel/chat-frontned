import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCompressedImage, validateImageFile, MAX_IMAGE_BYTES } from './mediaUtils.js';

test('image validation accepts supported types without a minimum size', () => {
  const file = new Blob(['x'], { type: 'image/webp' });
  assert.equal(validateImageFile(file), file);
  assert.equal(validateCompressedImage(file), file);
  assert.equal(MAX_IMAGE_BYTES, 500_000);
});

test('compressed images over 500,000 bytes are rejected', () => {
  assert.throws(
    () => validateCompressedImage(new Blob([new Uint8Array(500_001)])),
    { name: 'RangeError', message: 'Compressed image must be no larger than 500,000 bytes.' }
  );
});

test('image validation rejects unsupported file types', () => {
  assert.throws(
    () => validateImageFile(new Blob(['not an image'], { type: 'text/plain' })),
    { name: 'TypeError', message: 'Choose a JPEG, PNG, WebP, or AVIF image.' }
  );
});

test('image validation rejects non-Blob inputs', () => {
  assert.throws(() => validateImageFile(null), TypeError);
});
