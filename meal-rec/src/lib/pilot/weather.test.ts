// ABOUTME: Unit checks for pilot city options and nullable weather provenance.
// ABOUTME: Uses fetch fixtures and fake clocks; these checks are not live provider evidence.

/** @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CitySelection } from '../../../../packages/database/src/pilot/types';
import { captureWeather, searchCities } from './weather';

const startedAt = new Date('2026-10-18T12:00:00.000Z');
const seoul: CitySelection = {
  cityId: 'geonames:1835848', label: 'Seoul', country: 'South Korea',
  adminArea: 'Seoul', latitude: 37.5665, longitude: 126.978, timezone: 'Asia/Seoul',
};
const springfields: CitySelection[] = [
  { cityId: 'geonames:4250542', label: 'Springfield', country: 'United States',
    adminArea: 'Illinois', latitude: 39.8017, longitude: -89.6437, timezone: 'America/Chicago' },
  { cityId: 'geonames:4951788', label: 'Springfield', country: 'United States',
    adminArea: 'Massachusetts', latitude: 42.1015, longitude: -72.5898, timezone: 'America/New_York' },
];
const currentResponse = () => ({
  latitude: 37.55, longitude: 126.98, timezone: 'Asia/Seoul', utc_offset_seconds: 32400,
  generationtime_ms: 0.1,
  current_units: { time: 'unixtime', interval: 'seconds', temperature_2m: '°C',
    precipitation: 'mm', weather_code: 'wmo code' },
  current: { time: 1792324800, interval: 900, temperature_2m: 0, precipitation: 0, weather_code: 0 },
});
const cityResponse = () => ({ results: [
  { id: 4250542, name: 'Springfield', country: 'United States', country_code: 'US',
    admin1: 'Illinois', latitude: 39.8017, longitude: -89.6437, timezone: 'America/Chicago' },
  { id: 4951788, name: 'Springfield', country: 'United States', country_code: 'US',
    admin1: 'Massachusetts', latitude: 42.1015, longitude: -72.5898, timezone: 'America/New_York' },
] });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(startedAt);
  vi.stubEnv('PILOT_WEATHER_ACCESS_MODE', 'noncommercial');
  vi.stubEnv('PILOT_WEATHER_CUSTOMER_KEY', undefined);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function respond(body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
}

describe('pilot weather (unit fixtures, no live requests)', () => {
  it('zero_is_valid', async () => {
    respond(currentResponse());
    expect(await captureWeather(seoul, startedAt)).toEqual({
      provider: 'Open-Meteo', providerHost: 'api.open-meteo.com', accessMode: 'noncommercial',
      status: 'ok', requestedLatitude: 37.5665, requestedLongitude: 126.978,
      gridLatitude: 37.55, gridLongitude: 126.98,
      validAt: '2026-10-18T12:00:00.000Z', sourceIntervalSeconds: 900,
      requestedAt: '2026-10-18T12:00:00.000Z', retrievedAt: '2026-10-18T12:00:00.000Z',
      temperatureC: 0, precipitationMm: 0, weatherCode: 0,
      units: { temperature: 'celsius', precipitation: 'mm' }, sourceTimeFormat: 'unixtime',
      timezone: 'Asia/Seoul', failureReason: null,
    });
    const [url, options] = fetchMock.mock.calls[0];
    const request = new URL(String(url));
    expect(request.origin + request.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(Object.fromEntries(request.searchParams)).toEqual({
      latitude: '37.5665', longitude: '126.978',
      current: 'temperature_2m,precipitation,weather_code', temperature_unit: 'celsius',
      precipitation_unit: 'mm', timeformat: 'unixtime', timezone: 'auto',
    });
    expect(options).toMatchObject({ cache: 'no-store', redirect: 'error' });
  });

  it('timeout_is_unknown at exactly 3000ms, even when fetch ignores abort', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    let finished = false;
    const snapshot = captureWeather(seoul, startedAt).then(value => { finished = true; return value; });
    await vi.advanceTimersByTimeAsync(2999);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await snapshot).toMatchObject({
      status: 'unavailable', failureReason: 'timeout', retrievedAt: null,
      requestedAt: '2026-10-18T12:00:00.000Z',
      temperatureC: null, precipitationMm: null, weatherCode: null, validAt: null,
    });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out while reading the response body', async () => {
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({ start() {} })));
    const pending = captureWeather(seoul, startedAt);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toMatchObject({ status: 'unavailable', failureReason: 'timeout', retrievedAt: null });
  });

  it('partial_and_stale_provenance_is_preserved', async () => {
    const body = currentResponse();
    body.current.time = 1792321199;
    respond({ ...body, current: { ...body.current, temperature_2m: null, weather_code: 999 } });
    expect(await captureWeather(seoul, startedAt)).toMatchObject({
      status: 'unavailable', failureReason: 'stale',
      temperatureC: null, precipitationMm: 0, weatherCode: 999,
      validAt: '2026-10-18T10:59:59.000Z', sourceIntervalSeconds: 900,
      requestedAt: '2026-10-18T12:00:00.000Z', retrievedAt: '2026-10-18T12:00:00.000Z',
      gridLatitude: 37.55, gridLongitude: 126.98, timezone: 'Asia/Seoul',
    });
  });

  it('retains usable independent zero fields and unfamiliar integer codes', async () => {
    const body = currentResponse();
    respond({ ...body, current: { ...body.current, temperature_2m: null, weather_code: 999 } });
    expect(await captureWeather(seoul, startedAt)).toMatchObject({
      status: 'partial', temperatureC: null, precipitationMm: 0, weatherCode: 999,
      failureReason: 'missing_fields',
    });
  });

  it.each([
    { seconds: 1792321200, status: 'ok', reason: null },
    { seconds: 1792321199, status: 'unavailable', reason: 'stale' },
    { seconds: 1792325100, status: 'ok', reason: null },
    { seconds: 1792325101, status: 'unavailable', reason: 'future_valid_time' },
    { seconds: null, status: 'unavailable', reason: 'missing_valid_time' },
    { seconds: '1792324800', status: 'unavailable', reason: 'missing_valid_time' },
    { seconds: 1e30, status: 'unavailable', reason: 'missing_valid_time' },
  ])('uses inclusive retrieval freshness: $seconds', async ({ seconds, status, reason }) => {
    const body = currentResponse();
    respond({ ...body, current: { ...body.current, time: seconds } });
    expect(await captureWeather(seoul, startedAt)).toMatchObject({
      status, failureReason: reason, temperatureC: 0, precipitationMm: 0, weatherCode: 0,
    });
  });

  it.each([
    { seconds: 1792321200, status: 'unavailable', reason: 'stale' },
    { seconds: 1792325101, status: 'ok', reason: null },
  ])('anchors freshness to response retrieval rather than request start: $seconds', async ({ seconds, status, reason }) => {
    const body = currentResponse();
    fetchMock.mockImplementationOnce(async () => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return new Response(JSON.stringify({ ...body, current: { ...body.current, time: seconds } }));
    });
    const snapshot = captureWeather(seoul, startedAt);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await snapshot).toMatchObject({
      status, failureReason: reason, requestedAt: '2026-10-18T12:00:00.000Z',
      retrievedAt: '2026-10-18T12:00:02.000Z',
    });
  });

  it('preserves selected city zone and flags the returned grid-zone mismatch', async () => {
    respond({ ...currentResponse(), timezone: 'Asia/Tokyo' });
    expect(await captureWeather(seoul, startedAt)).toMatchObject({
      status: 'partial', timezone: 'Asia/Tokyo', failureReason: 'timezone_mismatch', temperatureC: 0,
    });
    expect(seoul.timezone).toBe('Asia/Seoul');
  });

  it.each([
    { temperature_2m: '12', precipitation: 0, weather_code: 0, want: { status: 'partial', temperatureC: null, precipitationMm: 0, weatherCode: 0 } },
    { temperature_2m: 0, precipitation: null, weather_code: 0, want: { status: 'partial', temperatureC: 0, precipitationMm: null, weatherCode: 0 } },
    { temperature_2m: 0, precipitation: 0, weather_code: 1.5, want: { status: 'partial', temperatureC: 0, precipitationMm: 0, weatherCode: null } },
    { temperature_2m: false, precipitation: '0', weather_code: '0', want: { status: 'unavailable', temperatureC: null, precipitationMm: null, weatherCode: null } },
  ])('validates each raw measurement without coercion: $temperature_2m/$precipitation/$weather_code', async ({ want, ...fields }) => {
    const body = currentResponse();
    respond({ ...body, current: { ...body.current, ...fields } });
    expect(await captureWeather(seoul, startedAt)).toMatchObject(want);
  });

  it('rejects non-finite measurements without losing valid zeros', async () => {
    const body = currentResponse();
    const response = new Response('{}');
    vi.spyOn(response, 'json').mockResolvedValue({ ...body, current: { ...body.current, temperature_2m: Infinity } });
    fetchMock.mockResolvedValueOnce(response);
    expect(await captureWeather(seoul, startedAt)).toMatchObject({
      status: 'partial', temperatureC: null, precipitationMm: 0, weatherCode: 0,
    });
  });

  it('rejects missing or malformed current records without inventing normal weather', async () => {
    respond({ timezone: 'Asia/Seoul', current: [] });
    expect(await captureWeather(seoul, startedAt)).toMatchObject({
      status: 'unavailable', temperatureC: null, precipitationMm: null, weatherCode: null,
    });
  });

  it('does not label Fahrenheit or incompatible time units as Celsius/Unix measurements', async () => {
    const body = currentResponse();
    respond({ ...body, current_units: { ...body.current_units, temperature_2m: '°F', time: 'iso8601' } });
    expect(await captureWeather(seoul, startedAt)).toMatchObject({
      status: 'unavailable', temperatureC: null, validAt: null, precipitationMm: 0, weatherCode: 0,
    });
  });

  it.each(['Not/AZone', '+09:00', 'PST', 'CET', 'Japan', 'asia/seoul', 'Asia/Kolkata', 'US/Pacific'])('rejects invalid selected IANA zone %s without fetching', async timezone => {
    await expect(captureWeather({ ...seoul, timezone }, startedAt)).rejects.toThrow('invalid_city');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{ latitude: 91 }, { longitude: -181 }, { latitude: NaN }])('rejects invalid requested coordinates $latitude/$longitude', async fields => {
    await expect(captureWeather({ ...seoul, ...fields }, startedAt)).rejects.toThrow('invalid_city');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not silently use an invalid provider zone or grid coordinate', async () => {
    respond({ ...currentResponse(), timezone: 'Not/AZone', latitude: 91 });
    expect(await captureWeather(seoul, startedAt)).toMatchObject({
      status: 'partial', timezone: null, gridLatitude: null, gridLongitude: 126.98,
      failureReason: 'missing_fields', temperatureC: 0,
    });
  });

  it('normalizes equivalent provider aliases without mutating the selected city or flagging a mismatch', async () => {
    const city = { ...seoul, timezone: 'Asia/Calcutta' };
    const before = structuredClone(city);
    respond({ ...currentResponse(), timezone: 'Asia/Kolkata' });
    expect(await captureWeather(city, startedAt)).toMatchObject({
      status: 'ok', timezone: 'Asia/Calcutta', failureReason: null,
    });
    expect(city).toEqual(before);
  });

  it.each(['UTC', 'GMT'])('accepts selected %s and compares its equivalent provider zone', async timezone => {
    respond({ ...currentResponse(), timezone: 'Etc/UTC' });
    expect(await captureWeather({ ...seoul, timezone }, startedAt)).toMatchObject({
      status: 'ok', timezone: 'UTC', failureReason: null,
    });
  });

  it('rejects invalid cities even when hosted access is disabled', async () => {
    vi.stubEnv('PILOT_WEATHER_ACCESS_MODE', 'disabled');
    await expect(captureWeather({ ...seoul, latitude: NaN }, startedAt)).rejects.toThrow('invalid_city');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['network', 'http', 'json'])('redacts %s failure details instead of returning normal weather', async failure => {
    const secret = 'secret-provider-key';
    vi.stubEnv('PILOT_WEATHER_ACCESS_MODE', 'customer');
    vi.stubEnv('PILOT_WEATHER_CUSTOMER_KEY', secret);
    const errorLog = vi.spyOn(console, 'error');
    const warningLog = vi.spyOn(console, 'warn');
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error(`https://provider/?apikey=${secret}`));
    if (failure === 'http') fetchMock.mockResolvedValueOnce(new Response(`reason ${secret}`, { status: 403 }));
    if (failure === 'json') fetchMock.mockResolvedValueOnce(new Response(`invalid json ${secret}`));
    const snapshot = await captureWeather(seoul, startedAt);
    expect(snapshot).toMatchObject({
      status: 'unavailable', retrievedAt: null, temperatureC: null, precipitationMm: null, weatherCode: null,
      failureReason: { network: 'network_error', http: 'http_error', json: 'invalid_response' }[failure],
    });
    expect(JSON.stringify(snapshot)).not.toContain(secret);
    expect(JSON.stringify(snapshot)).not.toContain('https://provider');
    expect(errorLog).not.toHaveBeenCalled();
    expect(warningLog).not.toHaveBeenCalled();
  });

  it('uses customer host and server-side key only for explicitly configured customer mode', async () => {
    vi.stubEnv('PILOT_WEATHER_ACCESS_MODE', 'customer');
    vi.stubEnv('PILOT_WEATHER_CUSTOMER_KEY', 'unit-secret');
    respond(currentResponse());
    const snapshot = await captureWeather(seoul, startedAt);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.host).toBe('customer-api.open-meteo.com');
    expect(url.searchParams.get('apikey')).toBe('unit-secret');
    expect(snapshot).toMatchObject({ accessMode: 'customer', providerHost: 'customer-api.open-meteo.com' });
    expect(JSON.stringify(snapshot)).not.toContain('unit-secret');
  });
});

describe('pilot cities (unit fixtures, no live requests)', () => {
  it('ambiguous_city_is_not_auto_selected', async () => {
    respond(cityResponse());
    expect(await searchCities('Springfield', [])).toEqual(springfields);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({ name: 'Springfield', count: '5', language: 'en' });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store', redirect: 'error' });
  });

  it('access_disabled_uses_configured_cities_without_network', async () => {
    vi.stubEnv('PILOT_WEATHER_ACCESS_MODE', undefined);
    expect(await searchCities(' springFIELD ', springfields)).toEqual(springfields);
    expect(await searchCities('massachusetts', springfields)).toEqual([springfields[1]]);
    expect(await searchCities('', [seoul])).toEqual([seoul]);
    expect(await captureWeather(seoul, startedAt)).toMatchObject({
      status: 'unavailable', accessMode: 'disabled', providerHost: null,
      failureReason: 'access_disabled', retrievedAt: null, temperatureC: null, precipitationMm: null, weatherCode: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['disabled', 'unexpected', 'customer'])('fails closed for mode %s without authorized configuration', async mode => {
    vi.stubEnv('PILOT_WEATHER_ACCESS_MODE', mode);
    expect(await searchCities('Seoul', [seoul])).toEqual([seoul]);
    expect(await captureWeather(seoul, startedAt)).toMatchObject({ status: 'unavailable', retrievedAt: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never uses server credentials or network from a browser context', async () => {
    vi.stubGlobal('window', {});
    expect(await searchCities('Seoul', [seoul])).toEqual([seoul]);
    expect(await captureWeather(seoul, startedAt)).toMatchObject({ status: 'unavailable', accessMode: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('extends configured options without replacing their selected data or duplicating GeoNames IDs', async () => {
    respond(cityResponse());
    const original = structuredClone(springfields);
    expect(await searchCities('Springfield', [springfields[0]])).toEqual(springfields);
    expect(springfields).toEqual(original);
  });

  it('filters malformed GeoNames choices and validates configured zones and coordinates', async () => {
    const good = cityResponse().results[0];
    respond({ results: [good, { ...good, id: 2, timezone: 'Not/AZone' },
      { ...good, id: 3, latitude: 91 }, { ...good, id: '4' },
      { ...good, id: 5, name: null }, { ...good, id: 6, longitude: null },
      { ...good, id: 7, country: null, country_code: null }] });
    expect(await searchCities('Springfield', [{ ...springfields[1], timezone: 'Not/AZone' }])).toEqual([springfields[0]]);
  });

  it('normalizes configured location aliases and casing before selection using copies', async () => {
    vi.stubEnv('PILOT_WEATHER_ACCESS_MODE', 'disabled');
    const configured = [
      { ...seoul, cityId: 'india', timezone: 'Asia/Kolkata' },
      { ...seoul, cityId: 'case', timezone: 'asia/seoul' },
      { ...seoul, cityId: 'alias', timezone: 'US/Pacific' },
      { ...seoul, cityId: 'pst', timezone: 'PST' },
      { ...seoul, cityId: 'cet', timezone: 'CET' },
      { ...seoul, cityId: 'japan', timezone: 'Japan' },
    ];
    const before = structuredClone(configured);
    const choices = await searchCities('', configured);
    expect(choices).toEqual([
      { ...seoul, cityId: 'india', timezone: 'Asia/Calcutta' },
      { ...seoul, cityId: 'case', timezone: 'Asia/Seoul' },
      { ...seoul, cityId: 'alias', timezone: 'America/Los_Angeles' },
    ]);
    expect(choices[0]).not.toBe(configured[0]);
    expect(configured).toEqual(before);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retains GeoNames location aliases as normalized choices and filters unsupported bare aliases', async () => {
    const city = cityResponse().results[0];
    respond({ results: [
      { ...city, id: 1, timezone: 'Asia/Kolkata' },
      { ...city, id: 2, timezone: 'asia/seoul' },
      { ...city, id: 3, timezone: 'PST' },
    ] });
    expect(await searchCities('Springfield', [])).toEqual([
      { ...springfields[0], cityId: 'geonames:1', timezone: 'Asia/Calcutta' },
      { ...springfields[0], cityId: 'geonames:2', timezone: 'Asia/Seoul' },
    ]);
  });

  it.each(['network', 'http', 'json', 'shape'])('retains configured options on %s lookup failure', async failure => {
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('provider details'));
    if (failure === 'http') fetchMock.mockResolvedValueOnce(new Response('provider details', { status: 500 }));
    if (failure === 'json') fetchMock.mockResolvedValueOnce(new Response('provider details'));
    if (failure === 'shape') respond({ results: {} });
    expect(await searchCities('Springfield', springfields)).toEqual(springfields);
  });

  it('returns configured choices within three seconds when lookup hangs', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = searchCities('Springfield', springfields);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toEqual(springfields);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('uses customer geocoding host only with explicit customer mode and key', async () => {
    vi.stubEnv('PILOT_WEATHER_ACCESS_MODE', 'customer');
    vi.stubEnv('PILOT_WEATHER_CUSTOMER_KEY', 'unit-secret');
    respond(cityResponse());
    expect(await searchCities('Springfield', [])).toEqual(springfields);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.host).toBe('customer-geocoding-api.open-meteo.com');
    expect(url.searchParams.get('apikey')).toBe('unit-secret');
  });
});
