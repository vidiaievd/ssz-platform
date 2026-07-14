import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TextParagraphResult } from '../../../application/queries/get-text-paragraphs/get-text-paragraphs.handler.js';

export class TextParagraphResponseDto {
  @ApiProperty({ example: 'Hei, hvordan har du det?' })
  target: string;

  @ApiPropertyOptional({ example: 'Hi, how are you?' })
  translation: string | null;

  static from(result: TextParagraphResult): TextParagraphResponseDto {
    const dto = new TextParagraphResponseDto();
    dto.target = result.target;
    dto.translation = result.translation;
    return dto;
  }
}
