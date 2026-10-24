// ABOUTME: Captures nullable pilot weather and disambiguated city options.
// ABOUTME: Uses explicit hosted-access configuration and preserves source provenance.

import type { CitySelection, WeatherSnapshot } from '../../../../packages/database/src/pilot/types';

function providerAccess() {
  const mode = typeof window === 'undefined' ? process.env.PILOT_WEATHER_ACCESS_MODE : undefined;
  const key = typeof window === 'undefined' ? process.env.PILOT_WEATHER_CUSTOMER_KEY : undefined;
  if (mode === 'noncommercial') return { mode, prefix: '', key: null };
  if (mode === 'customer' && key?.trim()) return { mode, prefix: 'customer-', key };
  return { mode: 'disabled', prefix: '', key: null };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

function coordinate(value: unknown, bound: number): number | null {
  const number = finiteNumber(value);
  return number !== null && Math.abs(number) <= bound ? number : null;
}

function canonicalZone(value: unknown): string | null {
  // shortcut: fixed IANA namespaces plus UTC/GMT; extend this guard if IANA adds a namespace.
  if (!text(value) || (!value.includes('/') && !/^(UTC|GMT)$/i.test(value))) return null;
  try {
    const timezone = new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
    const supportedNamespace = /^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Etc|Europe|Indian|Pacific)\//.test(timezone);
    return supportedNamespace || timezone === 'UTC' || timezone === 'GMT' ? timezone : null;
  } catch {
    return null;
  }
}

function validCity(city: CitySelection): boolean {
  if (city === null || typeof city !== 'object') return false;
  const timezone = canonicalZone(city.timezone);
  return text(city.cityId) && text(city.label) && text(city.country)
    && (city.adminArea === null || text(city.adminArea))
    && coordinate(city.latitude, 90) !== null && coordinate(city.longitude, 180) !== null
    && timezone !== null && (timezone === city.timezone || city.timezone === 'GMT');
}

class ProviderFailure extends Error {}

async function fetchJson(url: URL): Promise<{ body: unknown; retrievedAt: string }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { cache: 'no-store', redirect: 'error', signal: controller.signal });
        if (!response.ok) throw new ProviderFailure('http_error');
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new ProviderFailure('invalid_response');
        }
        return { body, retrievedAt: new Date().toISOString() };
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new ProviderFailure('timeout'));
          controller.abort();
        }, 3000);
      }),
    ]);
  } catch (error) {
    throw error instanceof ProviderFailure ? error : new ProviderFailure('network_error');
  } finally {
    clearTimeout(timer);
  }
}

export async function searchCities(query: string, configured: readonly CitySelection[]): Promise<CitySelection[]> {
  const term = query.trim();
  const choices = configured.flatMap(city => {
    const timezone = canonicalZone(city.timezone);
    if (timezone === null) return [];
    const choice = { ...city, timezone };
    return validCity(choice) && [choice.label, choice.country, choice.adminArea]
      .some(value => value?.toLowerCase().includes(term.toLowerCase())) ? [choice] : [];
  });
  const access = providerAccess();
  if (access.mode === 'disabled' || term.length < 2) return choices;

  const url = new URL(`https://${access.prefix}geocoding-api.open-meteo.com/v1/search`);
  url.search = new URLSearchParams({ name: term, count: '5', language: 'en' }).toString();
  if (access.key) url.searchParams.set('apikey', access.key);
  try {
    const { body } = await fetchJson(url);
    const results = record(body).results;
    if (!Array.isArray(results)) return choices;
    for (const result of results) {
      const city = record(result);
      const id = integer(city.id);
      const country = text(city.country) ? city.country : city.country_code;
      const latitude = coordinate(city.latitude, 90);
      const longitude = coordinate(city.longitude, 180);
      const timezone = canonicalZone(city.timezone);
      if (id === null || id <= 0 || !text(city.name) || !text(country)
        || latitude === null || longitude === null || timezone === null) continue;
      const cityId = `geonames:${id}`;
      if (!choices.some(choice => choice.cityId === cityId)) {
        choices.push({
          cityId, label: city.name, country, adminArea: text(city.admin1) ? city.admin1 : null,
          latitude, longitude, timezone,
        });
      }
    }
  } catch {
    // Provider failures leave the configured city options available without exposing request details.
  }
  return choices;
}

export async function captureWeather(city: CitySelection, startedAt: Date): Promise<WeatherSnapshot> {
  if (!validCity(city)) throw new Error('invalid_city');
  const access = providerAccess();
  const snapshot: WeatherSnapshot = {
    provider: 'Open-Meteo',
    providerHost: access.mode === 'disabled' ? null : `${access.prefix}api.open-meteo.com`,
    accessMode: access.mode, status: 'unavailable',
    requestedLatitude: city.latitude, requestedLongitude: city.longitude,
    gridLatitude: null, gridLongitude: null, validAt: null, sourceIntervalSeconds: null,
    requestedAt: startedAt.toISOString(), retrievedAt: null,
    temperatureC: null, precipitationMm: null, weatherCode: null,
    units: { temperature: 'celsius', precipitation: 'mm' }, sourceTimeFormat: 'unixtime',
    timezone: null, failureReason: 'access_disabled',
  };
  if (access.mode === 'disabled') return snapshot;

  const url = new URL(`https://${snapshot.providerHost}/v1/forecast`);
  url.search = new URLSearchParams({
    latitude: String(city.latitude), longitude: String(city.longitude),
    current: 'temperature_2m,precipitation,weather_code', temperature_unit: 'celsius',
    precipitation_unit: 'mm', timeformat: 'unixtime', timezone: 'auto',
  }).toString();
  if (access.key) url.searchParams.set('apikey', access.key);

  try {
    const { body, retrievedAt } = await fetchJson(url);
    const response = record(body);
    const current = record(response.current);
    const units = record(response.current_units);
    snapshot.retrievedAt = retrievedAt;
    snapshot.temperatureC = units.temperature_2m === '°C' ? finiteNumber(current.temperature_2m) : null;
    snapshot.precipitationMm = units.precipitation === 'mm' ? finiteNumber(current.precipitation) : null;
    snapshot.weatherCode = units.weather_code === 'wmo code' ? integer(current.weather_code) : null;
    snapshot.gridLatitude = coordinate(response.latitude, 90);
    snapshot.gridLongitude = coordinate(response.longitude, 180);
    snapshot.timezone = canonicalZone(response.timezone);
    snapshot.sourceIntervalSeconds = units.interval === 'seconds' ? integer(current.interval) : null;
    const seconds = units.time === 'unixtime' ? integer(current.time) : null;
    const validAt = new Date(seconds === null ? NaN : seconds * 1000);
    if (validAt.getUTCFullYear() >= 1 && validAt.getUTCFullYear() <= 9999) {
      snapshot.validAt = validAt.toISOString();
    }

    const measurements = [snapshot.temperatureC, snapshot.precipitationMm, snapshot.weatherCode];
    const age = Date.parse(retrievedAt) - validAt.getTime();
    snapshot.failureReason = snapshot.validAt === null ? 'missing_valid_time'
      : age > 3600000 ? 'stale' : age < -300000 ? 'future_valid_time'
        : measurements.every(value => value === null) ? 'missing_fields' : null;
    if (snapshot.failureReason === null) {
      const partial = [...measurements, snapshot.gridLatitude, snapshot.gridLongitude,
        snapshot.sourceIntervalSeconds, snapshot.timezone].some(value => value === null);
      snapshot.status = partial ? 'partial' : 'ok';
      snapshot.failureReason = partial ? 'missing_fields' : null;
    }
    if (snapshot.timezone !== null && snapshot.timezone !== canonicalZone(city.timezone)) {
      snapshot.failureReason = snapshot.status === 'unavailable'
        ? `${snapshot.failureReason};timezone_mismatch` : 'timezone_mismatch';
      if (snapshot.status === 'ok') snapshot.status = 'partial';
    }
    return snapshot;
  } catch (error) {
    return { ...snapshot, failureReason: error instanceof ProviderFailure ? error.message : 'invalid_response' };
  }
}
