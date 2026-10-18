// ABOUTME: Shared version-one pilot records and credential-free export types.
// ABOUTME: Keeps acknowledged exposures separate from immutable appeal responses.

export type UtcTimestamp = string;
export type Hunger = 'not_hungry' | 'somewhat_hungry' | 'very_hungry' | null;
export type AppealAnswer = 'yes' | 'no' | 'not_sure';

export interface CitySelection {
  cityId: string;
  label: string;
  country: string;
  adminArea: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface WeatherSnapshot {
  provider: string | null;
  providerHost: string | null;
  accessMode: string | null;
  status: 'ok' | 'partial' | 'unavailable';
  requestedLatitude: number;
  requestedLongitude: number;
  gridLatitude: number | null;
  gridLongitude: number | null;
  validAt: UtcTimestamp | null;
  sourceIntervalSeconds: number | null;
  requestedAt: UtcTimestamp;
  retrievedAt: UtcTimestamp | null;
  temperatureC: number | null;
  precipitationMm: number | null;
  weatherCode: number | null;
  units: { temperature: 'celsius'; precipitation: 'mm' };
  sourceTimeFormat: 'unixtime';
  timezone: string | null;
  failureReason: string | null;
}

export interface MealSnapshot {
  id: string;
  name: string;
  cuisine: string | null;
  primaryIngredients: string[];
  allergens: string[];
  weather: string[];
  timeOfDay: string[];
  spiciness: number;
  heaviness: number;
  imageUrl: string | null;
  description: string | null;
  flavorTags: string[];
}

export interface StudyConfig {
  studyId: string;
  studyVersion: string;
  protocolVersion: string;
  catalogVersion: string;
  catalogSha256: string;
  startsAt: UtcTimestamp;
  seed: number;
  cityOptions: CitySelection[];
}

export interface StudyRecord extends StudyConfig {
  schemaVersion: 1;
  trainingEndsAt: UtcTimestamp;
  developmentEndsAt: UtcTimestamp;
  endsAt: UtcTimestamp;
  quotaTimezoneRule: 'enrollment';
}

export interface FreezeLink {
  freezeManifestSha256: string;
  frozenAt: UtcTimestamp;
  developmentSnapshotSha256: string;
}

export interface ExportManifest extends Omit<StudyRecord, 'cityOptions'> {
  phase: 'development' | 'final';
  exportedAt: UtcTimestamp;
  sourceProvenance: {
    name: string;
    url: string | null;
    license: string;
    attribution: string;
  };
  freezeLink: FreezeLink | null;
}

export interface EnrollmentSettings {
  version: number;
  effectiveAt: UtcTimestamp;
  city: CitySelection;
  dietaryExclusions: string[];
}

export interface ParticipantView {
  participantId: string;
  enrolledAt: UtcTimestamp;
  enrollmentTimezone: string;
  settings: EnrollmentSettings[];
}

export interface VisitRecord {
  visitId: string;
  participantId: string;
  settingsVersion: number;
  startedAt: UtcTimestamp;
  expiresAt: UtcTimestamp;
  contextCapturedAt: UtcTimestamp;
  city: CitySelection;
  hunger: Hunger;
  weather: WeatherSnapshot | null;
}

export interface CardAllocation {
  allocationId: string;
  participantId: string;
  localDate: string;
  settingsVersion: number;
  itemId: string;
  allocatedAt: UtcTimestamp;
  eligiblePoolSize: number;
  selectionProbability: number;
}

export interface ExposureRecord {
  eventId: string;
  participantId: string;
  visitId: string;
  allocationId: string;
  settingsVersion: number;
  itemId: string;
  displayedAt: UtcTimestamp;
  clientDisplayedAt: UtcTimestamp;
  meal: MealSnapshot;
}

export interface ResponseRecord {
  responseId: string;
  eventId: string;
  participantId: string;
  answer: AppealAnswer;
  actionAt: UtcTimestamp;
  receivedAt: UtcTimestamp;
}

export interface AuditEntry {
  eventId: string;
  reason: string;
}

export interface PilotSnapshot {
  schemaVersion: 1;
  source: 'pilot';
  manifest: ExportManifest;
  participants: ParticipantView[];
  visits: VisitRecord[];
  allocations: CardAllocation[];
  exposures: ExposureRecord[];
  responses: ResponseRecord[];
  audit: AuditEntry[];
}

export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };
