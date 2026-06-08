import { Module } from '@nestjs/common';
import { ClashesController } from './presentation/controllers/clashes.controller.js';

@Module({ controllers: [ClashesController] })
export class ClashesModule {}
