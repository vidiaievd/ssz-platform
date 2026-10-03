import { DomainError } from '../../../../shared/domain/domain.error.js';

/**
 * The probe's time is up.
 *
 * Its own error rather than "not found", because the two are different facts and the
 * caller acts on them differently: a probe that never existed is a bug in whatever
 * handed out the id, while an expired one is the feature working — ask for another.
 * The presentation layer answers 410 for this and 404 for the other.
 */
export class ProbeExpiredError extends DomainError {
  constructor(public readonly expiredAt: Date) {
    super('This probe has expired');
  }
}

/** A probe belongs to one learner (see the entity). */
export class ProbeNotYoursError extends DomainError {
  constructor() {
    super('This probe was not dealt to you');
  }
}

/**
 * The engine has no validator for the template the probe was built on.
 *
 * Refused at creation rather than at attempt time: a probe the engine cannot score
 * produces no evidence, and evidence is the only reason it is made. A learner should
 * never be the one to find this out.
 */
export class ProbeTemplateNotScorableError extends DomainError {
  constructor(templateCode: string) {
    super(`The engine cannot score a '${templateCode}' probe`);
  }
}

/** A probe already promoted is not promoted a second time — see `ProbeTask.promote`. */
export class ProbeAlreadyPromotedError extends DomainError {
  constructor(public readonly exerciseId: string) {
    super('This probe has already been promoted into the catalogue');
  }
}
