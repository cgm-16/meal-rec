// ABOUTME: Main export file for the database package
// ABOUTME: Exports all models and connection utilities for use in other packages

export { Meal, IMeal } from './models/meal';
export { User, IUser } from './models/user';
export { Feedback, IFeedback } from './models/feedback';
export { connect, disconnect } from './connect';
export { 
  getRecentFeedback, 
  deleteOldFeedback, 
  getFeedbackStats, 
  getMealFeedback
} from './feedback-helpers';
export { PilotStudy } from './models/pilot-study';
export { PilotParticipant } from './models/pilot-participant';
export type { PilotParticipantRecord, PilotDay, PilotSlot, StoredAllocation, StoredVisit } from './models/pilot-participant';
export { enrollParticipant, updateParticipant, createVisit, nextCard, acknowledgeDisplay, submitAction, PilotError } from './pilot/service';
export type { EligiblePool, VisitContext, PilotErrorCode } from './pilot/service';
export type * from './pilot/types';
