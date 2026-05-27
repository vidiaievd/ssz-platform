export type Exchange =
  | 'auth.events'
  | 'organization.events'
  | 'profile.events'
  | 'content.events'
  | 'learning.events'
  | 'exercise-engine.events'
  | 'media.events'
  | 'notification.events';

export const EXCHANGES: Record<string, Exchange> = {
  AUTH: 'auth.events',
  ORGANIZATION: 'organization.events',
  PROFILE: 'profile.events',
  CONTENT: 'content.events',
  LEARNING: 'learning.events',
  EXERCISE_ENGINE: 'exercise-engine.events',
  MEDIA: 'media.events',
  NOTIFICATION: 'notification.events',
};
