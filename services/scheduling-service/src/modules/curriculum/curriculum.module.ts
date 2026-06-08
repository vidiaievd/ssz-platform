import { Module } from '@nestjs/common';
import { CurriculumController } from './presentation/controllers/curriculum.controller.js';

@Module({ controllers: [CurriculumController] })
export class CurriculumModule {}
