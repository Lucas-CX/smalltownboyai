import { isDanceResolution, type DanceResolution } from '@/lib/dance-settings';
import { danceTemplate } from '@/lib/dance-template';

import { verifyDanceReference } from './dance-reference';

/** Reference-guided contract checked on 2026-10-08.
 * Paid customer calls require verified credits; local tests require a single-use permit.
 * Native provider audio is delivered unchanged; prompt compliance is not guaranteed.
 */
export const DANCE_MODEL = 'wan/3-0-video';
export const DANCE_PROMPT_VERSION = 'smalltown-duo-v1';
export const DANCE_PROMPT = `Recast Video1 using Image1 and Image2. Produce a 14-second vertical video that follows the reference performance at its original speed.

ROLE ASSIGNMENT
Image1 replaces the subject nearest the camera at the opening, performing the exaggerated head-clutching and open-mouth reaction. Image2 replaces the subject dancing behind that opening foreground performer. These assignments refer to the original performers, not fixed left/right positions. Track each identity through movement, cuts, overlap and changes in screen position. Keep exactly these two performers throughout the video.

IDENTITY AND ANATOMY
Each image determines its assigned subject's identity, species, face, head shape, ears, hair or fur, colors, markings, body proportions, clothing and accessories where present. Preserve those distinctive features consistently. Replace both original performers completely in every shot. Do not inherit the original performers' appearance or accessories. Do not blend or swap identities. Keep the species and anatomy of each uploaded subject: a human remains human; an animal retains its own head, muzzle, ears, coat, paws and tail where applicable. Transfer the performance's upright poses and gestures naturally to that subject without changing its species. Do not add human hands to an animal or animal features to a human. Avoid extra limbs, fused bodies and duplicate subjects.

PERFORMANCE, COMEDY AND SCENE
Video1 determines the complete choreography, gestures, expressive timing, gaze, head movement, poses, motion speed, camera movement, lens perspective, shot order, cuts, background and lighting. Follow its actual timeline exactly; do not invent extra beats or role swaps. Preserve the comic contrast between the exaggerated foreground reaction and the cheerful background dance, the following side-by-side performance, and the final approach toward the lens. Preserve the size and timing of the expressions and physical gestures, adapted to each subject's anatomy. Keep both identities recognizable during close-ups, turns, wide shots and the ending. Do not substitute generic dancing, change the scene, insert new shots, loop actions, slow down, or pad with frozen frames.

AUDIO
Preserve Video1's existing soundtrack, melody, tune, rhythm, tempo and timing as closely as possible. Synchronize the performance and cuts with the reference beats. Do not compose a new tune, replace the song, add dialogue, or add sound effects.

PRIORITY
Use Image1 and Image2 for identity and appearance; use Video1 for performance, scene, camera, timing and soundtrack. Output 14 seconds, vertical 9:16, natural speed, without text, logos, watermarks, intro, outro or fades.`;

// Metadata must come from server-side media inspection, never a browser assertion.
export type DanceReference = { url: string; durationSeconds: number };

export function dancePayload(
  images: string[],
  reference: DanceReference,
  resolution: DanceResolution = '720P'
) {
  if (!isDanceResolution(resolution)) throw new Error('Invalid resolution');
  if (images.length !== 2)
    throw new Error('Exactly two character images required');
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
  private async call(path: string, body?: unknown, timeoutMs = 30_000) {
    const response = await this.transport(`https://api.kie.ai/api/v1/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Kie HTTP ${response.status}`);
    const result = await response.json();
    if (result.code !== 200) throw new Error(`Kie error ${result.code}`);
    return result.data;
  }
  // Never retry submission automatically: a timeout may hide an accepted task.
  async balance() {
    // Only this read-only preflight can retry. Keep its total timeout below
    // the Workers post-response execution window; never retry createTask.
    let value: unknown;
    try {
      value = await this.call('chat/credit', undefined, 8_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/^Kie (HTTP|error) [34]\d\d$/.test(message)) throw error;
      value = await this.call('chat/credit', undefined, 8_000);
    }
    if (typeof value !== 'number')
      throw new Error('Provider balance unavailable');
    return value;
  }
  async submit(
    images: string[],
    reference: DanceReference,
    resolution: DanceResolution = '720P',
    callbackUrl?: string
  ) {
    const data = await this.call('jobs/createTask', {
      ...dancePayload(images, reference, resolution),
      ...(callbackUrl ? { callBackUrl: callbackUrl } : {}),
    });
    if (typeof data?.taskId !== 'string')
      throw new Error('Submission outcome unknown; reconcile in Kie Logs');
    return data.taskId as string;
  }
  async status(taskId: string, timeoutMs = 30000) {
    const data = await this.call(
      `jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      undefined,
      timeoutMs
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
    let parameters: any = {};
    try {
      parameters =
        typeof data.param === 'string'
          ? JSON.parse(data.param)
          : data.param || {};
    } catch {}
    return {
      taskId: typeof data.taskId === 'string' ? data.taskId : null,
      model: typeof data.model === 'string' ? data.model : null,
      callbackUrl:
        typeof parameters.callBackUrl === 'string'
          ? parameters.callBackUrl
          : null,
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
