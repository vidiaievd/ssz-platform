import { Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
import ffprobeInstaller = require('@ffprobe-installer/ffprobe');
import type { IAudioInspector, Waveform } from '../../shared/application/ports/audio-inspector.port.js';
import {
  durationFromPackets,
  parseFormatDuration,
  pcmSamples,
  peaksOf,
} from './audio-measure.js';

// Low enough to keep a three-minute decode at ~3 MB, high enough for a waveform.
const PCM_RATE = 8000;
// A recording is capped at 8 MB and three minutes; anything slower than this is stuck.
const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

@Injectable()
export class FfmpegAudioInspector implements IAudioInspector {
  async durationMs(data: Buffer, extension: string): Promise<number | null> {
    return this.withFile(data, extension, async (path) => {
      const header = await run(ffprobeInstaller.path, [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        path,
      ]).catch(() => null);
      if (header === null) return null;

      const declared = parseFormatDuration(header.toString('utf8'));
      if (declared !== null) return declared;

      const packets = await run(ffprobeInstaller.path, [
        '-v', 'error',
        '-select_streams', 'a:0',
        '-show_entries', 'packet=pts_time,duration_time',
        '-of', 'csv=p=0',
        path,
      ]).catch(() => null);
      return packets === null ? null : durationFromPackets(packets.toString('utf8'));
    });
  }

  async waveform(data: Buffer, extension: string, bins: number): Promise<Waveform> {
    return this.withFile(data, extension, async (path) => {
      const pcm = await run(ffmpegInstaller.path, [
        '-v', 'error',
        '-i', path,
        '-vn',
        '-ac', '1',
        '-ar', String(PCM_RATE),
        '-f', 's16le',
        'pipe:1',
      ]);
      const samples = pcmSamples(pcm);
      return {
        peaks: peaksOf(samples, bins),
        durationMs: Math.round((samples.length / PCM_RATE) * 1000),
      };
    });
  }

  private async withFile<T>(data: Buffer, extension: string, fn: (path: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), 'ssz-inspect-'));
    try {
      const path = join(dir, `input.${extension.replace(/[^a-z0-9]/gi, '') || 'bin'}`);
      await writeFile(path, data);
      return await fn(path);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function run(binary: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      { encoding: 'buffer', timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });
}
