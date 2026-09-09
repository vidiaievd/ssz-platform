import { ApiProperty } from '@nestjs/swagger';

/**
 * What the clip said — plan 56 §3.3.
 *
 * Only for a listening exercise whose teacher set the transcript to show after the
 * answer, and only once the exercise is over: the transcript is what the recording says,
 * which on a listening exercise is the answer, so it travels with the key rather than
 * with the document. One shape, shared by every verdict that can carry it — three
 * declarations would be three schema names for one thing.
 */
export class AudioTranscriptDto {
  @ApiProperty({ description: 'What the clip says' })
  transcript!: string;

  @ApiProperty({ description: "The author's translation of it, or an empty string" })
  translation!: string;
}
