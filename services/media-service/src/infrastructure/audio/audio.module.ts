import { Global, Module } from '@nestjs/common';
import { AUDIO_INSPECTOR } from '../../shared/application/ports/audio-inspector.port.js';
import { FfmpegAudioInspector } from './ffmpeg-audio-inspector.js';

@Global()
@Module({
  providers: [{ provide: AUDIO_INSPECTOR, useClass: FfmpegAudioInspector }],
  exports: [AUDIO_INSPECTOR],
})
export class AudioModule {}
