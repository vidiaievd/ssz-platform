import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import type { SoundAtomCatalogEntry } from '../../../internal/application/queries/sound-atom-catalog/sound-atom-catalog.handler.js';
import { GetSoundAtomQuery } from '../../application/queries/get-sound-atom/get-sound-atom.query.js';
import { SoundAtomResponseDto } from '../dto/sound-atom.response.dto.js';

// The card of a sound (plan 86, step 9.2): what a pronunciation remark's `atomRef`
// (`atomType: 'sound'`, `atomId: 'nb:kj'`) opens. The articulation base is the platform's,
// not a school's — any signed-in user may read it.
@ApiTags('Sound atoms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sound-atoms')
export class SoundAtomController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':atomId')
  @ApiOperation({
    summary: 'One sound with its articulation base, for the learner’s card',
    description:
      'Texts in the asked interface locale (`en`, `nb`, `ru`, `uk`; a region is dropped — `nb-NO` is `nb`), ' +
      'English where the locale has none. `commonError` is written for speakers of Russian and Ukrainian in ' +
      'every locale; `ukNote` says where Ukrainian differs.',
  })
  @ApiParam({
    name: 'atomId',
    example: 'nb:kj',
    description: '`<language>:<family>`; `nb%3Akj` works too',
  })
  @ApiQuery({ name: 'locale', required: false, example: 'uk' })
  @ApiOkResponse({ type: SoundAtomResponseDto })
  @ApiNotFoundResponse({ description: '`SOUND_ATOM_NOT_FOUND` — not a sound of the catalogue.' })
  @ApiUnauthorizedResponse({ description: 'No valid access token.' })
  async findOne(
    @Param('atomId') atomId: string,
    @Query('locale') locale?: string,
  ): Promise<SoundAtomResponseDto> {
    const atom = await this.queryBus.execute<GetSoundAtomQuery, SoundAtomCatalogEntry | null>(
      new GetSoundAtomQuery(atomId, locale ?? 'en'),
    );
    if (!atom) {
      throw new NotFoundException({
        code: 'SOUND_ATOM_NOT_FOUND',
        message: `No sound atom "${atomId}"`,
      });
    }
    return SoundAtomResponseDto.from(atom);
  }
}
