// Original test card, not a dance sample. No third-party media or music.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import sharp from 'sharp';

mkdirSync('data/fixtures', { recursive: true });
const svg = `<svg width="480" height="720" xmlns="http://www.w3.org/2000/svg"><rect width="480" height="720" fill="#183c36"/><rect x="35" y="270" width="410" height="95" fill="#cfef71"/><text x="240" y="330" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="36" fill="#183c36">SIMULATION</text><text x="240" y="415" text-anchor="middle" font-family="sans-serif" font-size="19" fill="white">NOT AN AI-GENERATED VIDEO</text><text x="240" y="453" text-anchor="middle" font-family="sans-serif" font-size="16" fill="white">Playback and download test only</text></svg>`;
await sharp(Buffer.from(svg)).png().toFile('data/fixtures/test-card.png');
execFileSync(
  ffmpeg.path,
  [
    '-y',
    '-loop',
    '1',
    '-i',
    'data/fixtures/test-card.png',
    '-t',
    '3',
    '-r',
    '15',
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    'libx264',
    '-b:v',
    '150k',
    '-an',
    '-movflags',
    '+faststart',
    'data/fixtures/simulation.mp4',
  ],
  { stdio: 'ignore' }
);
console.log(
  'Created an original 3-second simulation card; no generation provider used.'
);
