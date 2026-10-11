import { isDanceResolution, type DanceResolution } from '@/lib/dance-settings';
import { danceTemplate } from '@/lib/dance-template';

import { verifyDanceReference } from './dance-reference';

/** Reference-guided contract checked on 2026-10-08.
 * Paid customer calls require verified credits; local tests require a single-use permit.
 * Native provider audio is delivered unchanged; prompt compliance is not guaranteed.
 */
export const DANCE_MODEL = 'wan/3-0-video';
export const DANCE_PROMPT_VERSION = 'reference-replacement-v1';
export const DANCE_PROMPT = `Create a 15-second video by replacing the three main performers in Video1 with the corresponding people from Image1, Image2, and Image3.

ROLE MAPPING
- Image1 replaces the opening dancer.
- Image2 replaces the selfie-camera performer.
- Image3 replaces the person revealed at the car.
Keep this mapping fixed throughout the video, including when a person turns away, becomes partially occluded, or reappears.

APPEARANCE
Use each image as the primary appearance reference for its assigned person. Preserve their facial features, hairstyle, hair color, visible body proportions, clothing, footwear, and accessories as closely as possible.
Do not blend identities or inherit the original video performers' appearance.
Where the photo does not show a detail, infer it conservatively and keep it consistent throughout the video.
Adapt lighting and perspective naturally to the scene without changing the person's defining appearance.

MOTION AND SCENE
Use Video1 as the primary reference for choreography, gestures, poses, expressions, movement speed, camera motion, framing, shot order, transitions, and timing.
Preserve the background, vehicles, objects, and interactions with the environment.
Replace the people while retaining the reference performance. Do not invent new dance moves, add scenes, reorder shots, or change the ending.

AUDIO
Preserve the reference video's music, melody, rhythm, tempo, and audio timing as closely as possible. Keep the movements synchronized with the reference beat.
Do not compose replacement music or add new speech or sound effects.

PRIORITY
For identity and appearance, prioritize the assigned image.
For movement, camera, scene structure, and timing, prioritize Video1.
For music and synchronization, prioritize the reference audio.

Output a coherent vertical video at natural speed, without added text, subtitles, logos, or watermarks.`;

// Metadata must come from server-side media inspection, never a browser assertion.
export type DanceReference = { url: string; durationSeconds: number };

export function dancePayload(
  images: string[],
  reference: DanceReference,
  resolution: DanceResolution = '480P'
) {
  if (!isDanceResolution(resolution)) throw new Error('Invalid resolution');
  if (images.length !== 3)
    throw new Error('Exactly three character images required');
  if (
    !reference ||
    !Number.isFinite(reference.durationSeconds) ||
    reference.durationSeconds < 1 ||
    reference.durationSeconds > 15 ||
    reference.durationSeconds + danceTemplate.outputSeconds > 30
  )
    throw new Error(
      'A measured 1–15 second video reference is required; reference plus output must not exceed 30 seconds'
    );
  for (const value of [...images, reference.url]) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('HTTPS references without credentials required');
  }
  return {
    model: DANCE_MODEL,
    input: {
      prompt: DANCE_PROMPT,
      reference_image_urls: images,
      reference_video_urls: [reference.url],
      resolution,
      aspect_ratio: '9:16',
      duration: danceTemplate.outputSeconds,
      audio: true,
      nsfw_checker: true,
    },
  };
}

export class KieDanceClient {
  constructor(
    private key: string,
    // Workers' native fetch must not be invoked with the client as its receiver.
    private transport: typeof fetch = (input, init) => fetch(input, init)
  ) {}
  async uploadReference(bytes: Uint8Array): Promise<DanceReference> {
    await verifyDanceReference(bytes);
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }),
      `${danceTemplate.version}.mp4`
    );
    form.append('uploadPath', `dance-references/${danceTemplate.version}`);
    const response = await this.transport(
      'https://kieai.redpandaai.co/api/file-stream-upload',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.key}` },
        body: form,
        redirect: 'manual',
        signal: AbortSignal.timeout(60000),
      }
    );
    if (!response.ok) throw new Error('Reference upload failed');
    const result = await response.json();
    if (result.code !== 200 || typeof result.data?.downloadUrl !== 'string')
      throw new Error('Reference upload failed');
    const url = new URL(result.data.downloadUrl);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('Invalid reference upload URL');
    return { url: url.href, durationSeconds: danceTemplate.durationSeconds };
  }
  private async call(path: string, body?: unknown) {
    const response = await this.transport(`https://api.kie.ai/api/v1/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Kie HTTP ${response.status}`);
    const result = await response.json();
    if (result.code !== 200) throw new Error(`Kie error ${result.code}`);
    return result.data;
  }
  // Never retry submission automatically: a timeout may hide an accepted task.
  async balance() {
    const value = await this.call('chat/credit');
    if (typeof value !== 'number')
      throw new Error('Provider balance unavailable');
    return value;
  }
  async submit(
    images: string[],
    reference: DanceReference,
    resolution: DanceResolution = '480P'
  ) {
    const data = await this.call(
      'jobs/createTask',
      dancePayload(images, reference, resolution)
    );
    if (typeof data?.taskId !== 'string')
      throw new Error('Submission outcome unknown; reconcile in Kie Logs');
    return data.taskId as string;
  }
  async status(taskId: string) {
    const data = await this.call(
      `jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`
    );
    if (
      !['waiting', 'queuing', 'generating', 'success', 'fail'].includes(
        data?.state
      )
    ) {
      throw new Error('Unknown provider state; do not resubmit');
    }
    const urls =
      data.state === 'success'
        ? JSON.parse(data.resultJson || '{}').resultUrls
        : [];
    return {
      state: data.state as string,
      urls: Array.isArray(urls) ? (urls as string[]) : [],
      errorCode: data.failCode ? String(data.failCode).slice(0, 100) : null,
      creditsConsumed:
        typeof data.creditsConsumed === 'number' &&
        Number.isFinite(data.creditsConsumed) &&
        data.creditsConsumed >= 0 &&
        ['success', 'fail'].includes(data.state)
          ? data.creditsConsumed
          : null,
    };
  }

  async consumption(taskId: string): Promise<number | null> {
    const data = await this.call(
      `jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`
    );
    return ['success', 'fail'].includes(data?.state) &&
      typeof data.creditsConsumed === 'number' &&
      Number.isFinite(data.creditsConsumed) &&
      data.creditsConsumed >= 0
      ? data.creditsConsumed
      : null;
  }
}
