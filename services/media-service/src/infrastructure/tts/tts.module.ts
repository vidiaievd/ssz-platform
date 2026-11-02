import { Global, Module } from '@nestjs/common';

import { REFERENCE_SYNTHESIZER } from '../../shared/application/ports/reference-synthesizer.port.js';
import { SPEECH_SYNTHESIZER, VOICE_RESOLVER } from '../../shared/application/ports/speech-synthesizer.port.js';
import { ConfigVoiceResolver } from './config-voice-resolver.js';
import { HttpReferenceSynthesizer } from './http-reference-synthesizer.js';
import { PiperSynthesizer } from './piper-synthesizer.js';

@Global()
@Module({
  providers: [
    { provide: SPEECH_SYNTHESIZER, useClass: PiperSynthesizer },
    { provide: VOICE_RESOLVER, useClass: ConfigVoiceResolver },
    { provide: REFERENCE_SYNTHESIZER, useClass: HttpReferenceSynthesizer },
  ],
  exports: [SPEECH_SYNTHESIZER, VOICE_RESOLVER, REFERENCE_SYNTHESIZER],
})
export class TtsModule {}
