import { Global, Module } from '@nestjs/common';

import { SPEECH_SYNTHESIZER, VOICE_RESOLVER } from '../../shared/application/ports/speech-synthesizer.port.js';
import { ConfigVoiceResolver } from './config-voice-resolver.js';
import { PiperSynthesizer } from './piper-synthesizer.js';

@Global()
@Module({
  providers: [
    { provide: SPEECH_SYNTHESIZER, useClass: PiperSynthesizer },
    { provide: VOICE_RESOLVER, useClass: ConfigVoiceResolver },
  ],
  exports: [SPEECH_SYNTHESIZER, VOICE_RESOLVER],
})
export class TtsModule {}
