import type { CanDoDescriptorEntity } from '../entities/can-do-descriptor.entity.js';
import type { CanDoScope } from '../value-objects/can-do-scope.vo.js';
import type { CanDoSkill } from '../value-objects/can-do-skill.vo.js';
import type { CefrLevel } from '../entities/can-do-descriptor.entity.js';

export const CAN_DO_DESCRIPTOR_REPOSITORY = Symbol('ICanDoDescriptorRepository');

export interface CanDoDescriptorFilter {
  scope?: CanDoScope;
  ownerSchoolId?: string | null;
  cefrLevel?: CefrLevel;
  skill?: CanDoSkill;
}

export interface ICanDoDescriptorRepository {
  findById(id: string): Promise<CanDoDescriptorEntity | null>;
  findByIds(ids: string[]): Promise<CanDoDescriptorEntity[]>;
  findAll(filter: CanDoDescriptorFilter): Promise<CanDoDescriptorEntity[]>;
  findByModuleId(moduleContainerId: string): Promise<CanDoDescriptorEntity[]>;
  save(entity: CanDoDescriptorEntity): Promise<void>;
}
