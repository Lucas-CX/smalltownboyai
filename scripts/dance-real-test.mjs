// One explicitly approved local acceptance test; never connected to checkout.
// Credentials only from the environment. A durable lock prevents resubmission.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

const dir = 'data/real-tests/cast-v1';
const key = process.env.KIE_API_KEY;
if (!key) throw new Error('Set KIE_API_KEY securely in the environment.');
const recordPath = dir + '/test.json';
let record = existsSync(recordPath)
  ? JSON.parse(readFileSync(recordPath, 'utf8'))
  : {
      model: 'bytedance/seedance-2-5',
      resolution: '480p',
      outputSeconds: 10,
      referenceSeconds: 20,
      authorization:
        'User approved exactly one 480p call, maximum USD 4. No top-up or retry.',
      estimatedCredits: 510,
      estimatedUsd: 2.55,
      budgetUsd: 4,
      createdAt: new Date().toISOString(),
      reasonForShortOutput:
        'Balance 521 credits cannot cover 20s reference + 20s output. Test 10s output; not a full-length product validation.',
    };
const save = () =>
  writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n');
async function request(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${key}`, ...options.headers },
  });
  if (!r.ok) throw new Error(`Provider HTTP ${r.status}`);
  const data = await r.json();
  if (data.code !== 200)
    throw new Error(`Provider code ${Number(data.code) || 0}`);
  return data.data;
}
const api = (path, body) =>
  request(
    'https://api.kie.ai/api/v1/' + path,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}
  );
try {
  if (!record.taskId)
    throw new Error(
      'Historical Seedance test only. New submissions are disabled; use the Wan adapter after a new budget approval.'
    );
  if (!record.taskId) {
    if (existsSync(dir + '/submission.lock'))
      throw new Error(
        'Prior submission outcome unknown. Check provider Logs; do not resubmit.'
      );
    record.balanceBefore = await api('chat/credit');
    if (
      typeof record.balanceBefore !== 'number' ||
      record.balanceBefore < record.estimatedCredits
    )
      throw new Error('Insufficient balance; no generation submitted.');
    const reference = dir + '/reference-silent-20s.mp4';
    if (!existsSync(reference))
      execFileSync(
        ffmpeg.path,
        [
          '-y',
          '-i',
          'public/media/dance-reference.mp4',
          '-t',
          '20',
          '-an',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          reference,
        ],
        { stdio: 'ignore' }
      );
    const files = [
      'dancer.png',
      'selfie.png',
      'car-exit.png',
      'reference-silent-20s.mp4',
    ];
    const urls = [];
    record.assets = [];
    for (const name of files) {
      const bytes = readFileSync(dir + '/' + name);
      const form = new FormData();
      form.append(
        'file',
        new Blob([bytes], {
          type: name.endsWith('.png') ? 'image/png' : 'video/mp4',
        }),
        name
      );
      form.append('uploadPath', 'dance-acceptance/' + randomUUID());
      form.append('fileName', name);
      const uploaded = await request(
        'https://kieai.redpandaai.co/api/file-stream-upload',
        { method: 'POST', body: form }
      );
      if (
        !uploaded?.downloadUrl ||
        new URL(uploaded.downloadUrl).protocol !== 'https:'
      )
        throw new Error('Upload URL unavailable');
      urls.push(uploaded.downloadUrl);
      record.assets.push({
        name,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
      console.log('Uploaded ' + name);
    }
    const payload = {
      model: record.model,
      input: {
        prompt:
          'Use @Video1 as the motion, camera and shot-order reference. In the same chronological order, recreate all its key beats in a 10-second clip: the opening dance, the selfie shot, and the person stepping out of the car. Replace ONLY the opening dancer with the fictional adult man in @Image1 (blue overshirt, short black curls). Replace ONLY the selfie performer, including any returning selfie shot, with the fictional adult man in @Image2 (rust orange sweatshirt, wavy dark hair, beard). Replace ONLY the person exiting the car with the fictional adult woman in @Image3 (teal jacket, auburn hair). Preserve these three separate faces, hairstyles and outfits across every shot. Never swap, blend, duplicate or introduce people. Preserve the reference gas station setting, dance and camera framing. Generate synchronized upbeat instrumental dance music and natural scene sounds as part of the video. No dialogue, text or logos.',
        reference_image_urls: urls.slice(0, 3),
        reference_video_urls: [urls[3]],
        resolution: '480p',
        aspect_ratio: '9:16',
        duration: 10,
        generate_audio: true,
        output_format: 'mp4',
        nsfw_checker: true,
        web_search: false,
      },
    };
    writeFileSync(
      dir + '/request.json',
      JSON.stringify(payload, null, 2) + '\n'
    );
    save();
    closeSync(openSync(dir + '/submission.lock', 'wx'));
    record.submissionAttemptedAt = new Date().toISOString();
    save();
    const submitted = await api('jobs/createTask', payload);
    if (typeof submitted?.taskId !== 'string')
      throw new Error('Submission outcome unknown. Do not resubmit.');
    record.taskId = submitted.taskId;
    save();
    console.log('Submitted task ' + record.taskId);
  }
  for (let i = 0; i < 120; i++) {
    const task = await api(
      'jobs/recordInfo?taskId=' + encodeURIComponent(record.taskId)
    );
    if (task.state !== record.state) console.log('State: ' + task.state);
    record.state = task.state;
    record.lastCheckedAt = new Date().toISOString();
    record.creditsConsumed =
      typeof task.creditsConsumed === 'number' ? task.creditsConsumed : null;
    record.failCode = task.failCode || null;
    save();
    if (task.state === 'fail') {
      record.balanceAfter = await api('chat/credit');
      save();
      console.log('Generation failed; no retry.');
      break;
    }
    if (task.state === 'success') {
      const result = JSON.parse(task.resultJson || '{}').resultUrls?.[0];
      if (!result || new URL(result).protocol !== 'https:')
        throw new Error('Result URL unavailable');
      const response = await fetch(result, {
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok)
        throw new Error('Result download failed; query same task to recover.');
      writeFileSync(
        dir + '/result-480p.mp4',
        Buffer.from(await response.arrayBuffer())
      );
      record.resultFile = dir + '/result-480p.mp4';
      record.balanceAfter = await api('chat/credit');
      save();
      console.log(
        'Provider result saved without audio replacement. Balance delta: ' +
          (record.balanceBefore - record.balanceAfter)
      );
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
} catch (error) {
  record.lastError = error instanceof Error ? error.message : 'Test failed';
  save();
  console.error(record.lastError);
  process.exitCode = 1;
}
