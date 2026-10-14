import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import ffmpeg = require('fluent-ffmpeg');
import ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * WAV → mono mp3. Synthesized speech is stored as mp3: a single word is under 10 KB
 * instead of ~40 KB of PCM, and every browser plays it without a decoder question.
 */
export async function encodeMp3(wav: Buffer, bitrate = '64k'): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'tts-'));
  const wavPath = join(dir, 'in.wav');
  const mp3Path = join(dir, 'out.mp3');

  try {
    await writeFile(wavPath, wav);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(wavPath)
        .audioCodec('libmp3lame')
        .audioBitrate(bitrate)
        .audioChannels(1)
        .on('end', () => resolve())
        .on('error', reject)
        .save(mp3Path);
    });
    return await readFile(mp3Path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
