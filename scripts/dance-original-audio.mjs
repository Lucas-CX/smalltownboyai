import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

function run(args) {
  const result = spawnSync(ffmpeg.path, args, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error('Audio processing failed: ' + result.stderr.slice(-1500));
  return result;
}
function inspect(path) {
  const result = run(['-hide_banner', '-i', path, '-f', 'null', '-']);
  const match = result.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!match) throw new Error('Cannot determine media duration');
  return {
    seconds: Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]),
    audio: /Stream #.*Audio:/.test(result.stderr),
  };
}
const videoHash = (path) =>
  run([
    '-v',
    'error',
    '-i',
    path,
    '-map',
    '0:v:0',
    '-c:v',
    'copy',
    '-f',
    'hash',
    '-hash',
    'sha256',
    '-',
  ]).stdout.trim();

/** Local post-processing only. Keep original video; fail closed for missing/silent audio. */
export function addOriginalAudio(video, reference, output) {
  if ([video, reference].some((path) => resolve(path) === resolve(output)))
    throw new Error('Output must be a new file');
  const source = inspect(reference),
    generated = inspect(video);
  if (!source.audio) throw new Error('Reference has no audio track');
  if (source.seconds + 0.05 < generated.seconds)
    throw new Error(
      'Reference audio is shorter than the video; do not loop or stretch automatically'
    );
  if (!existsSync(output))
    run([
      '-n',
      '-i',
      video,
      '-i',
      reference,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-t',
      String(generated.seconds),
      '-movflags',
      '+faststart',
      output,
    ]);
  const verified = inspect(output);
  if (!verified.audio || Math.abs(verified.seconds - generated.seconds) > 0.1)
    throw new Error('Output audio/duration validation failed');
  if (videoHash(video) !== videoHash(output))
    throw new Error('Output video does not match original generated frames');
  const analysis = run([
    '-hide_banner',
    '-i',
    output,
    '-vn',
    '-af',
    'volumedetect',
    '-f',
    'null',
    '-',
  ]).stderr;
  const mean = Number(analysis.match(/mean_volume: ([-\d.]+) dB/)?.[1]);
  if (!Number.isFinite(mean) || mean < -65)
    throw new Error('Audio missing or effectively silent; do not deliver');
  const report = {
    output,
    video,
    reference,
    durationSeconds: verified.seconds,
    hasAudio: true,
    meanVolumeDb: mean,
    videoBitstreamUnchanged: true,
    audioStartSeconds: 0,
    source: 'Original reference audio, user requested',
    verifiedAt: new Date().toISOString(),
  };
  writeFileSync(
    output + '.verification.json',
    JSON.stringify(report, null, 2) + '\n'
  );
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv.length !== 5)
    throw new Error(
      'Usage: node scripts/dance-original-audio.mjs video reference output'
    );
  console.log(
    JSON.stringify(addOriginalAudio(...process.argv.slice(2)), null, 2)
  );
}
