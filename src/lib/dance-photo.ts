import {
  dancePhotoOutputSize,
  MAX_DANCE_PHOTO_RATIO,
  MIN_DANCE_PHOTO_EDGE,
} from './dance-photo-policy';

export const MAX_DANCE_SOURCE_BYTES = 20 * 1024 * 1024;
export const MAX_DANCE_SOURCE_PIXELS = 64_000_000;
const MAX_DECODED_PIXELS = 36_000_000;
export const DANCE_PHOTO_ACCEPT =
  'image/jpeg,image/jpg,image/png,image/webp,image/bmp,image/x-ms-bmp,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.bmp,.avif,.heic,.heif';
export type DancePhotoStage =
  | 'selection'
  | 'decode'
  | 'validation'
  | 'encoding';
export type DancePhotoReason =
  | 'file_too_large'
  | 'unsupported_format'
  | 'image_too_small'
  | 'image_dimensions_exceeded'
  | 'image_aspect_ratio'
  | 'image_decode_failed'
  | 'image_processing_failed'
  | 'heic_not_supported'
  | 'image_resize_unavailable'
  | 'image_decode_timeout';

export class DancePhotoError extends Error {
  constructor(
    public reason: DancePhotoReason,
    public stage: DancePhotoStage = 'validation'
  ) {
    super(reason);
  }
}

export function validateDancePhotoFile(
  file: Pick<File, 'type' | 'name' | 'size'>
) {
  if (file.size <= 0)
    throw new DancePhotoError('image_decode_failed', 'selection');
  if (file.size > MAX_DANCE_SOURCE_BYTES)
    throw new DancePhotoError('file_too_large', 'selection');
  // Some mobile file pickers leave MIME empty. The decoder still verifies bytes.
  if (
    ![
      'image/jpeg',
      'image/jpg',
      'image/pjpeg',
      'image/png',
      'image/webp',
      'image/bmp',
      'image/x-ms-bmp',
      'image/avif',
      'image/heic',
      'image/heif',
    ].includes(file.type.toLowerCase()) &&
    !(
      ['', 'application/octet-stream'].includes(file.type.toLowerCase()) &&
      /\.(jpe?g|png|webp|bmp|avif|heic|heif)$/i.test(file.name)
    )
  )
    throw new DancePhotoError('unsupported_format', 'selection');
}

export function validateDancePhotoDimensions(
  width: number,
  height: number,
  maxPixels = MAX_DECODED_PIXELS
) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new DancePhotoError('image_decode_failed');
  if (width < MIN_DANCE_PHOTO_EDGE || height < MIN_DANCE_PHOTO_EDGE)
    throw new DancePhotoError('image_too_small');
  if (width * height > maxPixels)
    throw new DancePhotoError('image_dimensions_exceeded');
  if (Math.max(width / height, height / width) > MAX_DANCE_PHOTO_RATIO)
    throw new DancePhotoError('image_aspect_ratio');
}

// Read bounded headers, not decoded pixels. A failed header probe retains the
// existing conservative decode path; it never grants the larger source limit.
export async function readDancePhotoDimensions(file: File) {
  try {
    const { imageSize } = await import('image-size');
    const size = imageSize(
      new Uint8Array(await file.slice(0, 1_048_576).arrayBuffer())
    );
    if (
      !['jpg', 'png', 'webp', 'bmp', 'heif', 'avif'].includes(size.type || '')
    )
      return undefined;
    return { width: size.width, height: size.height };
  } catch {
    return undefined;
  }
}

// Some mobile photo providers cannot be decoded through a blob URL. Read the
// selected bytes explicitly only on that failure path, with a bounded timeout.
function photoDataUrl(file: File, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const timer = setTimeout(() => {
      reader.abort();
      reject(new DancePhotoError('image_decode_timeout', 'decode'));
    }, timeoutMs);
    reader.onload = () => {
      clearTimeout(timer);
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new DancePhotoError('image_decode_failed', 'decode'));
    };
    reader.onerror = () => {
      clearTimeout(timer);
      reject(new DancePhotoError('image_decode_failed', 'decode'));
    };
    reader.readAsDataURL(file);
  });
}

export async function decodeDancePhoto(
  file: File,
  timeoutMs = 10_000,
  resize?: { width: number; required: boolean },
  onDecoder?: (decoder: 'bitmap' | 'image') => void
) {
  let source: ImageBitmap | HTMLImageElement;
  let release = () => {};
  try {
    onDecoder?.('bitmap');
    source = await new Promise<ImageBitmap>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(new DancePhotoError('image_decode_timeout', 'decode'));
      }, timeoutMs);
      Promise.resolve()
        // Width only preserves the browser's EXIF/HEIF orientation and aspect
        // ratio. Even an 8:1 portrait stays below the legacy decoded-pixel cap.
        .then(() =>
          createImageBitmap(
            file,
            resize
              ? {
                  resizeWidth: resize.width,
                  resizeQuality: 'high',
                  imageOrientation: 'from-image',
                }
              : undefined
          )
        )
        .then(
          (bitmap) => {
            if (settled) {
              bitmap.close();
              return;
            }
            settled = true;
            clearTimeout(timer);
            resolve(bitmap);
          },
          (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
          }
        );
    });
    release = () => (source as ImageBitmap).close();
    if (
      resize &&
      (source.width > resize.width ||
        source.width * source.height > MAX_DECODED_PIXELS)
    ) {
      release();
      if (resize.required)
        throw new DancePhotoError('image_resize_unavailable', 'decode');
      throw new Error('Bitmap resizing unavailable');
    }
  } catch (error) {
    if (
      error instanceof DancePhotoError &&
      error.reason === 'image_resize_unavailable'
    )
      throw error;
    // Never fall back to a full-resolution DOM decode for large sources.
    if (resize?.required)
      throw new DancePhotoError('image_resize_unavailable', 'decode');
    onDecoder?.('image');
    const url = URL.createObjectURL(file);
    release = () => URL.revokeObjectURL(url);
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          image.onload = null;
          image.onerror = null;
        };
        const timer = setTimeout(() => {
          cleanup();
          image.src = '';
          reject(new DancePhotoError('image_decode_timeout', 'decode'));
        }, timeoutMs);
        image.onload = () => {
          cleanup();
          resolve();
        };
        let retried = false;
        image.onerror = () => {
          if (!retried && typeof FileReader !== 'undefined') {
            retried = true;
            void photoDataUrl(file, timeoutMs).then(
              (data) => {
                if (image.onload) image.src = data;
              },
              () => {
                if (image.onerror) image.onerror(new Event('error'));
              }
            );
            return;
          }
          cleanup();
          const heic =
            /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
          reject(
            new DancePhotoError(
              heic ? 'heic_not_supported' : 'image_decode_failed',
              'decode'
            )
          );
        };
        image.src = url;
      });
      source = image;
    } catch (error) {
      release();
      throw error;
    }
  }
  return { source, release };
}

export async function prepareDancePhoto(
  file: File,
  onDecoded?: (width: number, height: number) => void,
  onDecoder?: (decoder: 'bitmap' | 'image') => void
): Promise<string> {
  validateDancePhotoFile(file);
  const dimensions = await readDancePhotoDimensions(file);
  let resize: { width: number; required: boolean } | undefined;
  if (dimensions) {
    onDecoded?.(dimensions.width, dimensions.height);
    validateDancePhotoDimensions(
      dimensions.width,
      dimensions.height,
      MAX_DANCE_SOURCE_PIXELS
    );
    const output = dancePhotoOutputSize(dimensions.width, dimensions.height);
    if (dimensions.width * dimensions.height > 4_000_000)
      resize = {
        width: Math.max(output.width, output.height),
        required: dimensions.width * dimensions.height > MAX_DECODED_PIXELS,
      };
  }
  const { source, release } = await decodeDancePhoto(
    file,
    10_000,
    resize,
    onDecoder
  );
  try {
    const width =
      source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const height =
      source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    if (!dimensions) onDecoded?.(width, height);
    validateDancePhotoDimensions(width, height);
    const output = dancePhotoOutputSize(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext('2d');
    if (!context)
      throw new DancePhotoError('image_processing_failed', 'encoding');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/jpeg', 0.9);
    if (!result.startsWith('data:image/jpeg;base64,'))
      throw new DancePhotoError('image_processing_failed', 'encoding');
    return result;
  } catch (error) {
    if (error instanceof DancePhotoError) throw error;
    throw new DancePhotoError('image_processing_failed', 'encoding');
  } finally {
    release();
  }
}
