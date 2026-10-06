import { createClient } from '@supabase/supabase-js';
import { API_BASE_URL, tok } from './api.js';

export const MAX_IMAGE_BYTES = 500_000;
const UPLOAD_REQUEST_TIMEOUT_MS = 45_000;
const BUCKET = 'metufy';
const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const env = import.meta.env || {};
let storageClient;
let storageClientConfig;

async function fetchWithTimeout(input, init = {}) {
  const controller = new AbortController();
  const propagateAbort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) propagateAbort();
  else init.signal?.addEventListener('abort', propagateAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), UPLOAD_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new Error('Upload request timed out. Check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', propagateAbort);
  }
}

export function validateImageFile(file) {
  if (!(file instanceof Blob) || !supportedImageTypes.has(file.type)) {
    throw new TypeError('Choose a JPEG, PNG, WebP, or AVIF image.');
  }
  return file;
}

export function validateCompressedImage(blob) {
  if (!(blob instanceof Blob)) throw new TypeError('Compressed image data is invalid.');
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new RangeError('Compressed image must be no larger than 500,000 bytes.');
  }
  return blob;
}

const canvasBlob = (canvas, mime, quality) => new Promise((resolve, reject) => {
  canvas.toBlob(blob => {
    if (!blob) {
      reject(new Error('Your browser could not encode this image.'));
      return;
    }
    resolve(blob);
  }, mime, quality);
});

export async function compressImage(file) {
  validateImageFile(file);
  let bitmap;
  let objectUrl;
  try {
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file);
      } catch {
        // Fall back to the image element decoder used by browsers with partial bitmap support.
      }
    }
    if (!bitmap) {
      objectUrl = URL.createObjectURL(file);
      bitmap = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('The selected image could not be decoded.'));
        image.src = objectUrl;
      });
    }

    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    if (!originalWidth || !originalHeight) throw new Error('The selected image has invalid dimensions.');
    const outputMime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    let scale = Math.min(1, 2560 / Math.max(originalWidth, originalHeight));

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(originalWidth * scale));
      canvas.height = Math.max(1, Math.floor(originalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Browser image processing is unavailable.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      let low = 0.1;
      let high = 0.98;
      let best;
      const highestQualityBlob = await canvasBlob(canvas, outputMime, high);
      if (highestQualityBlob.size <= MAX_IMAGE_BYTES) return highestQualityBlob;
      const lowestQualityBlob = await canvasBlob(canvas, outputMime, low);
      if (lowestQualityBlob.size <= MAX_IMAGE_BYTES) best = lowestQualityBlob;
      for (let iteration = 0; iteration < 8; iteration += 1) {
        const quality = (low + high) / 2;
        const blob = await canvasBlob(canvas, outputMime, quality);
        if (blob.size <= MAX_IMAGE_BYTES) {
          best = blob;
          low = quality;
        } else {
          high = quality;
        }
      }
      if (best) return best;
      scale *= 0.85;
    }
    throw new RangeError('Could not compress the image to 500,000 bytes or less.');
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw error;
    throw new Error(`Could not prepare this image for upload: ${error.message}`);
  } finally {
    bitmap?.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function getStorageClient(options) {
  if (options.supabaseClient?.storage) return options.supabaseClient;
  const url = options.supabaseUrl || env.VITE_SUPABASE_URL;
  const key = options.publishableKey || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('Image uploads are not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
  }
  const config = `${url}\0${key}`;
  if (!storageClient || storageClientConfig !== config) {
    storageClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: fetchWithTimeout }
    });
    storageClientConfig = config;
  }
  return storageClient;
}

async function uploadImage(file, options = {}) {
  const folder = options.folder || 'conversations';
  if (!['conversations', 'profiles'].includes(folder)) {
    throw new TypeError('Image folder must be conversations or profiles.');
  }
  const storage = getStorageClient(options);
  options.onProgress?.('Compressing image…');
  const compressed = validateCompressedImage(await compressImage(file));

  const apiBaseUrl = (options.apiBaseUrl || API_BASE_URL).replace(/\/+$/, '');
  const request = async (path, body) => {
    const token = options.authToken || tok();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try {
      response = await fetchWithTimeout(`${apiBaseUrl}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(body)
      });
    } catch (error) {
      throw new Error(`Could not reach the chat server: ${error.message}`);
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `Media request failed (${response.status}).`);
    }
    return result;
  };

  const mime = compressed.type || 'image/webp';
  options.onProgress?.('Preparing secure upload…');
  const signedUpload = await request('/api/media/upload-url', {
    folder,
    mime,
    size: compressed.size
  });
  if (!signedUpload.fileKey || !signedUpload.token) {
    throw new Error('The chat server returned an invalid upload ticket.');
  }

  options.onProgress?.('Uploading image…');
  const { error } = await storage.storage.from(BUCKET).uploadToSignedUrl(
    signedUpload.fileKey,
    signedUpload.token,
    compressed,
    { contentType: mime, upsert: false }
  );
  if (error) throw new Error(`Image upload failed: ${error.message}`);

  options.onProgress?.('Finishing upload…');
  const uploaded = await request('/api/media/complete', {
    folder,
    fileKey: signedUpload.fileKey,
    mime,
    size: compressed.size
  });
  if (typeof uploaded.url !== 'string' || !uploaded.url) {
    throw new Error('The chat server did not return an image URL.');
  }
  options.onProgress?.('Upload complete');
  return uploaded;
}

export const uploadConversationImage = (file, options = {}) =>
  uploadImage(file, { ...options, folder: 'conversations' });

export const uploadProfilePhoto = (file, options = {}) =>
  uploadImage(file, { ...options, folder: 'profiles' });
