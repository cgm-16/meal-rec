// ABOUTME: Stores each pilot participant as one atomic versioned aggregate.
// ABOUTME: Retains private identity mapping and immutable allocation, context and response history.

import mongoose, { Schema } from 'mongoose';
import type { CardAllocation, ExposureRecord, MealSnapshot, ParticipantView, ResponseRecord, VisitRecord } from '../pilot/types';

export interface PilotSlot {
  slotId: string;
  allocationId: string | null;
  visitId: string | null;
  validatedSettingsVersion: number;
  status: 'unshown' | 'shown' | 'answered' | 'skipped' | 'expired' | 'closed';
}
export interface PilotDay {
  localDate: string;
  shortage: number;
  slots: PilotSlot[];
}
export interface StoredVisit extends VisitRecord {
  operationId: string;
  closedAt: string | null;
}
export interface StoredAllocation extends CardAllocation {
  meal: MealSnapshot;
}
export interface PilotParticipantRecord extends ParticipantView {
  studyId: string;
  userId: string;
  version: number;
  days: PilotDay[];
  visits: StoredVisit[];
  allocations: StoredAllocation[];
  exposures: ExposureRecord[];
  responses: ResponseRecord[];
  issuances: { operationId: string; visitId: string; allocationId: string | null }[];
}

const ParticipantSchema = new Schema<PilotParticipantRecord>({
  studyId: { type: String, required: true, immutable: true },
  userId: { type: String, required: true, immutable: true, select: false },
  participantId: { type: String, required: true, unique: true, immutable: true },
  enrolledAt: { type: String, required: true, immutable: true },
  enrollmentTimezone: { type: String, required: true, immutable: true },
  version: { type: Number, required: true, default: 0 },
  settings: { type: [{ type: Schema.Types.Mixed }], required: true, default: [] },
  days: { type: [{ type: Schema.Types.Mixed }], required: true, default: [] },
  visits: { type: [{ type: Schema.Types.Mixed }], required: true, default: [] },
  allocations: { type: [{ type: Schema.Types.Mixed }], required: true, default: [] },
  exposures: { type: [{ type: Schema.Types.Mixed }], required: true, default: [] },
  responses: { type: [{ type: Schema.Types.Mixed }], required: true, default: [] },
  issuances: { type: [{ type: Schema.Types.Mixed }], required: true, default: [] },
}, { versionKey: false });
ParticipantSchema.index({ studyId: 1, userId: 1 }, { unique: true });

export const PilotParticipant = (mongoose.models.PilotParticipant as mongoose.Model<PilotParticipantRecord> | undefined)
  ?? mongoose.model<PilotParticipantRecord>('PilotParticipant', ParticipantSchema);
