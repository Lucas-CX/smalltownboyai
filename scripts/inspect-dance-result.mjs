import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

const p = 'data/dance-acceptance/downloaded.mp4';
const r = spawnSync(
  ffmpeg.path,
  ['-i', p, '-af', 'volumedetect', '-f', 'null', '-'],
  { encoding: 'utf8', windowsHide: true }
);
writeFileSync('data/dance-acceptance/media-inspection.log', r.stderr);
console.log(
  r.stderr
    .split('\n')
    .filter((x) => /Duration:|Stream #|mean_volume|max_volume/.test(x))
    .join('\n')
);
console.log(
  'decodeExit',
  r.status,
  'sha256',
  createHash('sha256').update(readFileSync(p)).digest('hex')
);
const sheet = spawnSync(
  ffmpeg.path,
  [
    '-y',
    '-i',
    p,
    '-vf',
    'fps=1/2,scale=192:-1,tile=5x2',
    '-frames:v',
    '1',
    'data/dance-acceptance/contact-sheet.jpg',
  ],
  { windowsHide: true }
);
console.log('contactSheet', sheet.status);
