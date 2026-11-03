import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  uploadImage,
  validateImageUpload,
} from '../../src/modules/uploads/image-upload.service.js';
import {
  createBookSchema,
  updateBookSchema,
} from '../../src/modules/books/book.validation.js';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
const originalApiKey = process.env.IMGBB_API_KEY;

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.IMGBB_API_KEY;
  else process.env.IMGBB_API_KEY = originalApiKey;
});

describe('image upload validation', () => {
  it('accepts a PNG whose signature matches its content type', () => {
    assert.equal(validateImageUpload('image/png', png), 'image/png');
  });

  it('rejects unsupported types and mismatched signatures', () => {
    assert.throws(() => validateImageUpload('image/gif', png), {
      code: 'INVALID_IMAGE',
    });
    assert.throws(() => validateImageUpload('image/jpeg', png), {
      code: 'INVALID_IMAGE',
    });
  });

  it('rejects images larger than 500 KB', () => {
    const oversizedPng = Buffer.concat([png, Buffer.alloc(500_000)]);
    assert.throws(() => validateImageUpload('image/png', oversizedPng), {
      code: 'IMAGE_TOO_LARGE',
    });
  });

  it('uploads base64 image data and returns only the hosted HTTPS URL', async () => {
    process.env.IMGBB_API_KEY = 'server-only-test-key';
    let requestUrl = '';
    let requestBody = '';
    const fakeFetch: typeof fetch = async (input, init) => {
      requestUrl = String(input);
      requestBody = String(init?.body);
      return new Response(
        JSON.stringify({ data: { url: 'https://i.ibb.co/example/cover.png' } }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };

    const result = await uploadImage(png, 'image/png', fakeFetch);

    assert.equal(result, 'https://i.ibb.co/example/cover.png');
    assert.equal(
      new URL(requestUrl).searchParams.get('key'),
      'server-only-test-key'
    );
    assert.ok(requestBody.includes(png.toString('base64')));
    assert.equal(
      createBookSchema.safeParse({
        body: {
          title: 'Hosted Cover Test',
          author: 'Test Author',
          category: 'Fiction',
          image: result,
          description: 'A valid description for schema verification.',
          totalCopies: 2,
        },
      }).success,
      true
    );
    assert.equal(
      updateBookSchema.safeParse({
        params: { id: '507f1f77bcf86cd799439011' },
        body: { image: result },
      }).success,
      true
    );
  });
});
