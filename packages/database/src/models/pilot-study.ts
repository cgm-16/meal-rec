// ABOUTME: Stores immutable pilot study configuration and shared UTC cutoffs.
// ABOUTME: Validates selected geographic cities without accepting ICU-only timezone names.

import mongoose, { Schema } from 'mongoose';
import type { CitySelection, StudyRecord } from '../pilot/types';

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizePilotCity(value: unknown): CitySelection | null {
  if (value === null || typeof value !== 'object') return null;
  const city = value as Record<string, unknown>;
  if (!nonempty(city.cityId) || !nonempty(city.label) || !nonempty(city.country)
    || !(city.adminArea === null || nonempty(city.adminArea))
    || typeof city.latitude !== 'number' || !Number.isFinite(city.latitude) || Math.abs(city.latitude) > 90
    || typeof city.longitude !== 'number' || !Number.isFinite(city.longitude) || Math.abs(city.longitude) > 180
    || !nonempty(city.timezone) || (!city.timezone.includes('/') && !/^(UTC|GMT)$/i.test(city.timezone))) return null;
  try {
    const timezone = new Intl.DateTimeFormat('en', { timeZone: city.timezone }).resolvedOptions().timeZone;
    // shortcut: fixed IANA namespaces plus UTC/GMT; extend if IANA adds a namespace.
    if (!/^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Etc|Europe|Indian|Pacific)\//.test(timezone)
      && timezone !== 'UTC' && timezone !== 'GMT') return null;
    return {
      cityId: city.cityId, label: city.label, country: city.country, adminArea: city.adminArea,
      latitude: city.latitude, longitude: city.longitude, timezone,
    };
  } catch {
    return null;
  }
}

export function isPilotCity(value: unknown): value is CitySelection {
  const city = normalizePilotCity(value);
  const timezone = (value as CitySelection | null)?.timezone;
  return city !== null && (timezone === city.timezone || timezone === 'GMT');
}

function timestampFraction(value: string): string {
  return (value.match(/\.(\d+)/)?.[1] ?? '').replace(/0+$/, '');
}

export function isPilotTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|\+00:00)$/.exec(value);
  if (!parts || Number(parts[1]) === 0) return false;
  const date = new Date(value);
  const components = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()];
  return components.every((component, index) => component === Number(parts[index + 1]));
}

export function comparePilotTimestamps(left: string, right: string): number {
  const milliseconds = Date.parse(left) - Date.parse(right);
  if (milliseconds !== 0) return milliseconds;
  const a = timestampFraction(left);
  const b = timestampFraction(right);
  const width = Math.max(a.length, b.length);
  return a.padEnd(width, '0') < b.padEnd(width, '0') ? -1 : a.padEnd(width, '0') > b.padEnd(width, '0') ? 1 : 0;
}

const StudySchema = new Schema<StudyRecord>({
  studyId: { type: String, required: true, unique: true, immutable: true },
  schemaVersion: { type: Number, required: true, enum: [1], immutable: true },
  studyVersion: { type: String, required: true, immutable: true },
  protocolVersion: { type: String, required: true, immutable: true },
  catalogVersion: { type: String, required: true, immutable: true },
  catalogSha256: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
  startsAt: { type: String, required: true, immutable: true },
  trainingEndsAt: { type: String, required: true, immutable: true },
  developmentEndsAt: { type: String, required: true, immutable: true },
  endsAt: { type: String, required: true, immutable: true },
  seed: { type: Number, required: true, validate: Number.isSafeInteger, immutable: true },
  quotaTimezoneRule: { type: String, required: true, enum: ['enrollment'], immutable: true },
  cityOptions: {
    type: [{ type: Schema.Types.Mixed }], required: true, immutable: true,
    set: (cities: unknown) => Array.isArray(cities) ? cities.map(city => normalizePilotCity(city) ?? city) : cities,
    validate: (cities: unknown) => Array.isArray(cities) && cities.every(isPilotCity)
      && new Set(cities.map(city => city.cityId)).size === cities.length,
  },
}, { versionKey: false });

StudySchema.pre('validate', function () {
  if (!isPilotTimestamp(this.startsAt)) {
    this.invalidate('startsAt', 'Expected a valid UTC timestamp');
    return;
  }
  const start = Date.parse(this.startsAt);
  for (const [key, days] of [['trainingEndsAt', 5], ['developmentEndsAt', 7], ['endsAt', 14]] as const) {
    if (!isPilotTimestamp(this[key]) || Date.parse(this[key]) !== start + days * 86400000
      || timestampFraction(this[key]) !== timestampFraction(this.startsAt)) this.invalidate(key, 'Study cutoffs must follow the fixed UTC protocol');
  }
});
StudySchema.pre('save', function () {
  if (!this.isNew && this.isModified()) throw new Error('Pilot study configuration is immutable');
});
StudySchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'], function () {
  throw new Error('Pilot study configuration is immutable');
});

export const PilotStudy = (mongoose.models.PilotStudy as mongoose.Model<StudyRecord> | undefined)
  ?? mongoose.model<StudyRecord>('PilotStudy', StudySchema);
