import { Module } from '@nestjs/common';
import { CurriculumController } from './presentation/controllers/curriculum.controller.js';
import { InternalDeliveryController } from './presentation/controllers/internal-delivery.controller.js';

@Module({ controllers: [CurriculumController, InternalDeliveryController] })
export class CurriculumModule {}
