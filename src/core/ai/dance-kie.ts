import { isDanceResolution, type DanceResolution } from '@/lib/dance-settings';
import { danceTemplate } from '@/lib/dance-template';

import { verifyDanceReference } from './dance-reference';

/** Reference-guided contract checked on 2026-10-08.
 * Paid customer calls require verified credits; local tests require a single-use permit.
 * Native provider audio is delivered unchanged; prompt compliance is not guaranteed.
 */
export const DANCE_MODEL = 'wan/3-0-video';
export const DANCE_PROMPT_VERSION = 'smalltown-duo-v2-identity-scale';
export const DANCE_PROMPT = `Recast Video1 using Image1 and Image2. Produce a 14-second vertical video that follows the reference performance at its original speed.

ROLE ASSIGNMENT
Role A = Image1 only, replacing Video1's black-and-white cat, the opening foreground performer holding its head. Role B = Image2 only, replacing Video1's orange tabby cat, the opening background dancer. The cat descriptions identify motion tracks only, never the output appearance. Keep this one-to-one mapping for the entire 14 seconds, through every cut, turn, overlap and change of screen position. In the reference's side-by-side and ending shots, follow the orange cat's track with Role B and the black-and-white cat's track with Role A. Never assign identity by left/right position or by which face is larger. Keep exactly one Role A and one Role B; never two copies of either image.

IDENTITY AND ANATOMY
Each image determines only its own role's identity, species, apparent age, face, head shape, ears, hair or fur, colors, markings, clothing and accessories. Preserve these independently in every shot, including glasses and clothing colors. Never copy one role's face, hairstyle, outfit or body onto the other, blend their features, swap identities, or progressively turn Role B into Role A. After a cut or occlusion, restore each role from its own source image. Replace both original performers completely; do not inherit their appearance or accessories. A human remains human; an animal retains its own head, muzzle, ears, coat, paws and tail where applicable. Adapt gestures naturally to that species. Do not add human hands to an animal or animal features to a human. Avoid extra limbs, fused bodies and duplicate subjects.

HEIGHT, BODY SIZE AND PERSPECTIVE
Preserve each subject's own plausible age- and species-appropriate stature, build and head-to-body proportions. Do not copy the reference cats' matching heights or oversized heads onto human subjects. When the uploads show an adult and a child, keep the adult naturally taller and larger than the child when standing at comparable depth; never shrink the adult into a child-sized body, enlarge the child into an adult, or equalize their heights. Do not infer real height from a portrait's crop or pixel size. If only a face or upper body is visible, complete a plausible body for that subject without borrowing the other image's body or clothing. Keep each role's physical scale stable across cuts. Apparent size changes only with camera distance, perspective and pose: a foreground child may appear larger than a distant adult. Keep feet grounded on the same scene floor, with consistent depth and natural limb proportions.

FACIAL STABILITY
Keep each face recognizable from its own source image through the final frame. Maintain stable eye spacing, nose, jawline, cheeks and mouth structure while expressions move naturally. Convey the reference's surprise and joy with anatomically plausible expressions. Reduce mouth opening, eye widening or facial stretch whenever needed to preserve likeness; do not transfer cartoon feline facial proportions to a human. Avoid rubbery faces, stretched jaws, shifting eyes, malformed teeth, facial melting or frame-to-frame identity drift. During the final approach and hands reaching toward the lens, preserve each face behind any occluding hand and retain two separate identities. Use natural perspective without inflating heads or distorting faces.

PERFORMANCE, COMEDY AND SCENE
Video1 determines choreography, gesture timing, gaze, poses, motion speed, camera movement, shot order, cuts, background and lighting, subject to the identity, facial stability and body-scale rules above. Follow its actual timeline; do not invent extra beats or role swaps. Preserve the comic contrast between the foreground reaction and cheerful background dance, the side-by-side performance, and final approach toward the lens. Adapt movement range to each subject's own anatomy and stature. Keep one recognizable Role A and one recognizable Role B in every two-person shot, especially after the low-angle cut and throughout the final side-by-side dance and close-up. Do not substitute generic dancing, change the scene, insert new shots, loop actions, slow down, or pad with frozen frames.

AUDIO
Preserve Video1's existing soundtrack, melody, tune, rhythm, tempo and timing as closely as possible. Synchronize the performance and cuts with the reference beats. Do not compose a new tune, replace the song, add dialogue, or add sound effects.

PRIORITY
Priority order: separate source-image identities and stable faces first; plausible individual stature and anatomy second; reference choreography and comic expression intensity third. Use Image1 only for Role A and Image2 only for Role B through the ending. Use Video1 for performance tracks, scene, camera, timing and soundtrack, never for the replacements' body sizes or facial geometry. Output 14 seconds, vertical 9:16, natural speed, without text, logos, watermarks, intro, outro or fades.`;

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
