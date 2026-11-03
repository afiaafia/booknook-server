import { AppError } from '../../utils/app-error.js';

const MAX_IMAGE_SIZE_BYTES = 500_000;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateImageUpload(
  contentType: string,
  image: Buffer
): string {
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const isPng = image
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  const isWebp =
    image.toString('ascii', 0, 4) === 'RIFF' &&
    image.toString('ascii', 8, 12) === 'WEBP';
  const signatureMatches =
    (mediaType === 'image/png' && isPng) ||
    (mediaType === 'image/jpeg' && isJpeg) ||
    (mediaType === 'image/webp' && isWebp);

  if (!IMAGE_TYPES.has(mediaType) || !signatureMatches) {
    throw new AppError(
      'Upload a valid JPEG, PNG, or WebP image',
      400,
      'INVALID_IMAGE'
    );
  }
  if (image.length === 0) {
    throw new AppError('The uploaded image is empty', 400, 'EMPTY_IMAGE');
  }
  if (image.length > MAX_IMAGE_SIZE_BYTES) {
    throw new AppError(
      'Image must be 500 KB or smaller',
      413,
      'IMAGE_TOO_LARGE'
    );
  }

  return mediaType;
}

export async function uploadImage(
  image: Buffer,
  contentType: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const mediaType = validateImageUpload(contentType, image);
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    throw new AppError(
      'Image uploads are not configured',
      503,
      'UPLOAD_NOT_CONFIGURED'
    );
  }

  const url = new URL('https://api.imgbb.com/1/upload');
  url.searchParams.set('key', apiKey);
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      image: image.toString('base64'),
      type: 'base64',
      name: `book-cover-${mediaType.split('/')[1]}`,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new AppError(
      'The image host could not accept this image',
      502,
      'IMAGE_HOST_FAILED'
    );
  }

  const payload: unknown = await response.json();
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('data' in payload) ||
    typeof payload.data !== 'object' ||
    payload.data === null ||
    !('url' in payload.data) ||
    typeof payload.data.url !== 'string'
  ) {
    throw new AppError(
      'The image host returned an invalid response',
      502,
      'IMAGE_HOST_INVALID_RESPONSE'
    );
  }

  let hostedUrl: URL;
  try {
    hostedUrl = new URL(payload.data.url);
  } catch {
    throw new AppError(
      'The image host returned an invalid URL',
      502,
      'IMAGE_HOST_INVALID_RESPONSE'
    );
  }
  if (hostedUrl.protocol !== 'https:') {
    throw new AppError(
      'The image host returned an insecure URL',
      502,
      'IMAGE_HOST_INVALID_RESPONSE'
    );
  }

  return hostedUrl.toString();
}
