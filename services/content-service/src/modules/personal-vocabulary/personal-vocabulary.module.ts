import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { PERSONAL_VOCABULARY_REPOSITORY } from './domain/repositories/personal-vocabulary.repository.interface.js';
import { PERSONAL_VOCABULARY_READER } from './domain/repositories/personal-vocabulary.reader.interface.js';
import { PrismaPersonalVocabularyRepository } from './infrastructure/persistence/prisma-personal-vocabulary.repository.js';
import { PrismaPersonalVocabularyReader } from './infrastructure/persistence/prisma-personal-vocabulary.reader.js';
import { CaptureWordHandler } from './application/commands/capture-word/capture-word.handler.js';
import { UpdateMyWordHandler } from './application/commands/update-my-word/update-my-word.handler.js';
import { DeleteMyWordHandler } from './application/commands/delete-my-word/delete-my-word.handler.js';
import { LookupWordHandler } from './application/queries/lookup-word/lookup-word.handler.js';
import { ListMyWordsHandler } from './application/queries/list-my-words/list-my-words.handler.js';
import { GetPersonalWordsForListHandler } from './application/queries/get-personal-words-for-list/get-personal-words-for-list.handler.js';
import { GetMyWordsReaderHandler } from './application/queries/get-my-words-reader/get-my-words-reader.handler.js';
import { PersonalVocabularyController } from './presentation/controllers/personal-vocabulary.controller.js';

/**
 * Words a student adds to their own dictionary from a text (plan 75). Item writes are
 * dispatched to the vocabulary module's commands over the shared bus rather than
 * importing its repositories, so this module never bypasses that module's rules.
 */
@Module({
  imports: [CqrsModule],
  controllers: [PersonalVocabularyController],
  providers: [
    { provide: PERSONAL_VOCABULARY_REPOSITORY, useClass: PrismaPersonalVocabularyRepository },
    { provide: PERSONAL_VOCABULARY_READER, useClass: PrismaPersonalVocabularyReader },
    CaptureWordHandler,
    UpdateMyWordHandler,
    DeleteMyWordHandler,
    LookupWordHandler,
    ListMyWordsHandler,
    GetPersonalWordsForListHandler,
    GetMyWordsReaderHandler,
  ],
})
export class PersonalVocabularyModule {}
