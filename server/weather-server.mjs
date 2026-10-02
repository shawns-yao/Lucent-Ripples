/**
 * QWeather adapter. Credentials stay in this process; this module never reads a
 * credential file, logs request URLs, or calls a provider until an API request.
 * Official endpoints: /weather/v1/current/{lat}/{lon}, /geo/v2/city/lookup.
 * https://dev.qweather.com/en/docs/api/weather/weather-current/
 * https://dev.qweather.com/en/docs/api/geoapi/city-lookup/
 * Cache weather only: QWeather prohibits storing/caching GeoAPI responses.
 * Show QWeather attribution and metadata.attributions in the consuming UI.
 * Shared requests count toward the project's QPM and billing allowance.
 */
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MINUTE = 60_000;
const DEFAULT_DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+qweatherapi\.com$/i;
const MIME_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

export class WeatherError extends Error {
  constructor(code, message, status = 502, retryAfter) {
    super(message);
    this.name = 'WeatherError';
    this.code = code;
    this.status = status;
    if (Number.isFinite(retryAfter)) this.retryAfter = Math.max(1, Math.ceil(retryAfter));
  }
}

/** Server-side configuration only. Never return this object from an HTTP route. */
export function readProviderConfig(env = process.env, now = Date.now()) {
  const host = String(env.QWEATHER_API_HOST || '').trim().toLowerCase();
  const jwt = String(env.QWEATHER_JWT || '').trim();
  const key = String(env.QWEATHER_API_KEY || '').trim();
  const invalid = { configured: false };
  if (host.length > 253 || !HOST_PATTERN.test(host) || Boolean(jwt) === Boolean(key)) return invalid;
  if (jwt) {
    // This does not verify the signature: QWeather verifies it. Validate shape
    // and expiration so an externally issued JWT cannot silently age forever.
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt) || jwt.length > 8192) return invalid;
    try {
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
      if (!Number.isFinite(payload.exp) || payload.exp * 1000 <= now) return invalid;
      return { configured: true, host, headers: { Authorization: `Bearer ${jwt}` }, expiresAt: payload.exp * 1000 };
    } catch { return invalid; }
  }
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(key)) return invalid;
  return { configured: true, host, headers: { 'X-QW-Api-Key': key }, expiresAt: Infinity };
}

export function parseCoordinates(latitude, longitude) {
  function coordinate(value, limit) {
    if (typeof value !== 'string' && typeof value !== 'number') return NaN;
    const text = String(value);
    if (!/^-?\d{1,3}(?:\.\d{1,12})?$/.test(text)) return NaN;
    const number = Number(text);
    return Number.isFinite(number) && Math.abs(number) <= limit ? Number(number.toFixed(2)) : NaN;
  }
  const lat = coordinate(latitude, 90);
  const lon = coordinate(longitude, 180);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new WeatherError('invalid_location', 'Provide valid latitude and longitude.', 400);
  return { lat, lon };
}

export function parseCityName(name) {
  if (typeof name !== 'string' || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) throw new WeatherError('invalid_name', 'Provide a city name of 1 to 80 characters.', 400);
  const normalized = name.trim().replace(/\s+/gu, ' ');
  if (!/^[\p{L}\p{M}\p{N} .’'()\-·]{1,80}$/u.test(normalized)) throw new WeatherError('invalid_name', 'Provide a city name of 1 to 80 characters.', 400);
  return normalized;
}

// Split administrative names, never a fixed table of city coordinates. A district
// is searched inside its city through GeoAPI's documented `adm` parameter.
const adminStem = (name) => name.normalize('NFKC').replace(/\s+/gu, '').toLowerCase().replace(/(?:特别行政区|自治区|自治州|地区|省|市|区|县|旗|盟)$/u, '');
const isChineseName = (name) => /^[\p{Script=Han}\s]+$/u.test(name);
export function parseLocalityQuery(name, district = '') {
  const input = parseCityName(name);
  let area = district === '' ? '' : parseCityName(district);
  let parent = area ? input : '';
  if (!area) {
    // 北京市朝阳区、石家庄市正定县、恩施自治州恩施市; city-only and
    // international multi-word names continue through the ordinary lookup.
    const combined = input.match(/^(.+?(?:特别行政区|自治州|地区|市|盟))\s*(.+)$/u);
    const separated = input.match(/^([\p{Script=Han}]+) ([\p{Script=Han}]+)$/u);
    if (combined || separated) [, parent, area] = combined || separated;
  }
  let province = '';
  if (parent) {
    const prefixed = parent.match(/^(.+(?:省|自治区))(.+)$/u);
    if (prefixed) [, province, parent] = prefixed;
  }
  const params = { location: area || input, number: '20', lang: 'zh' };
  if (parent) {
    // Prefer provider's short administrative names, e.g. 北京 / 朝阳.
    const shortArea = isChineseName(area) ? adminStem(area) : area;
    params.location = shortArea.length >= 2 ? shortArea : area;
    params.adm = isChineseName(parent) ? adminStem(parent) : parent;
    if (isChineseName(parent) && isChineseName(area)) params.range = 'cn';
  }
  return { params, parent, province };
}

function matchesParent(location, { parent, province }) {
  // For non-Chinese input (e.g. pinyin), the provider handles translated names
  // through `adm`; always require a human to confirm its displayed candidate.
  if (parent && isChineseName(parent) && ![location.adm1, location.adm2].some((name) => typeof name === 'string' && adminStem(name) === adminStem(parent))) return false;
  return !province || typeof location.adm1 === 'string' && adminStem(location.adm1) === adminStem(province);
}

function safeError(error) {
  return error instanceof WeatherError ? error : new WeatherError('provider_unavailable', 'Weather is temporarily unavailable.');
}

export function createWeatherService({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now, cacheTtlMs = 10 * MINUTE, staleMaxMs = 60 * MINUTE, maxCacheEntries = 128, maxConcurrent = 16, timeoutMs = 10_000, random = Math.random } = {}) {
  const config = readProviderConfig(env, now());
  const cache = new Map();
  const pending = new Map();
  let failures = 0;
  let retryAt = 0;
  let circuitError;
  const configured = () => config.configured === true && config.expiresAt > now();

  function requireConfiguration() {
    if (!configured()) throw new WeatherError('not_configured', 'Live weather is not configured or its credential has expired.', 503);
  }

  function cachedWeather(key) {
    const value = cache.get(key);
    if (value && now() - value.fetchedAtMs >= staleMaxMs) { cache.delete(key); return undefined; }
    return value;
  }

  function storeWeather(key, value) {
    for (const [cachedKey, entry] of cache) if (now() - entry.fetchedAtMs >= staleMaxMs) cache.delete(cachedKey);
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value);
  }

  function fail(error) {
    const normalized = safeError(error);
    failures = Math.min(failures + 1, 10);
    // Incorrect credentials/permissions must be corrected, not retried forever.
    if (normalized.code === 'provider_auth' || normalized.code === 'provider_endpoint') retryAt = Infinity;
    else retryAt = now() + Math.max((normalized.retryAfter || 0) * 1000, Math.min(60_000, 2000 * 2 ** (failures - 1))) + Math.floor(random() * 1000);
    circuitError = normalized;
    return normalized;
  }

  async function providerRequest(key, pathname, params, validate) {
    requireConfiguration();
    if (pending.has(key)) return pending.get(key);
    if (now() < retryAt) {
      if (retryAt === Infinity) throw circuitError;
      throw new WeatherError('rate_limited', 'Weather requests are temporarily paused. Please try again shortly.', 429, (retryAt - now()) / 1000);
    }
    if (pending.size >= maxConcurrent) throw new WeatherError('rate_limited', 'Too many simultaneous weather requests.', 429, 10);
    // Endpoints are built here, never accepted from the visitor or provider.
    if (!/^\/weather\/v1\/current\/-?\d+(?:\.\d+)?\/-?\d+(?:\.\d+)?$/.test(pathname) && pathname !== '/geo/v2/city/lookup') throw new WeatherError('provider_endpoint', 'Weather endpoint is unavailable.', 503);
    const url = new URL(`https://${config.host}${pathname}`);
    url.search = new URLSearchParams(params).toString();
    const job = (async () => {
      const controller = new AbortController();
      let timer;
      try {
        const data = await Promise.race([
          (async () => {
            const response = await fetchImpl(url.toString(), { method: 'GET', headers: { ...config.headers, Accept: 'application/json', 'Accept-Encoding': 'gzip' }, signal: controller.signal, redirect: 'error' });
            if (response.status === 401 || response.status === 403) throw new WeatherError('provider_auth', 'Weather service credentials or permissions need attention.', 503);
            if (response.status === 429) throw new WeatherError('rate_limited', 'Weather service request limit reached.', 429, 60);
            const cityMissResponse = pathname === '/geo/v2/city/lookup' && response.status === 400;
            if (pathname === '/geo/v2/city/lookup' && response.status === 204) return validate({ code: '204' });
            if ((response.status === 400 && !cityMissResponse) || response.status === 404 || (response.status >= 300 && response.status < 400)) throw new WeatherError('provider_endpoint', 'Weather endpoint is unavailable.', 503);
            if (!response.ok && !cityMissResponse) throw new WeatherError('provider_unavailable', 'Weather is temporarily unavailable.');
            if (Number(response.headers.get('content-length')) > 1_048_576) throw new WeatherError('invalid_response', 'Weather service returned an invalid response.');
            const body = await response.text();
            if (body.length > 1_048_576) throw new WeatherError('invalid_response', 'Weather service returned an invalid response.');
            let json;
            try { json = JSON.parse(body); } catch { throw new WeatherError('invalid_response', 'Weather service returned an invalid response.'); }
            if (cityMissResponse) {
              // Current error format distinguishes a miss from an invalid API
              // endpoint. A typo must not permanently disable future queries.
              if (typeof json?.error?.type === 'string' && json.error.type.endsWith('#no-such-location')) return validate({ code: '404' });
              throw new WeatherError('provider_endpoint', 'Weather endpoint is unavailable.', 503);
            }
            return validate(json);
          })(),
          new Promise((_, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(new WeatherError('provider_timeout', 'Weather service did not respond in time.', 504)); }, timeoutMs);
          }),
        ]);
        // A concurrent successful request must not reopen a credential circuit.
        if (retryAt !== Infinity) { failures = 0; retryAt = 0; circuitError = undefined; }
        return data;
      } catch (error) { throw fail(error); }
      finally { clearTimeout(timer); }
    })();
    pending.set(key, job);
    try { return await job; }
    finally { pending.delete(key); }
  }

  async function weather(latitude, longitude) {
    const { lat, lon } = parseCoordinates(latitude, longitude);
    requireConfiguration();
    const key = `weather:${lat},${lon}`;
    const entry = cachedWeather(key);
    const present = (value, stale) => ({ weather: value.data, fetchedAt: new Date(value.fetchedAtMs).toISOString(), stale, place: '附近', attribution: Array.isArray(value.data.metadata?.attributions) ? value.data.metadata.attributions.filter((item) => typeof item === 'string') : [] });
    if (entry && now() - entry.fetchedAtMs < cacheTtlMs) return present(entry, false);
    try {
      const data = await providerRequest(key, `/weather/v1/current/${lat}/${lon}`, { lang: 'zh' }, (body) => {
        if (!body || typeof body !== 'object' || Array.isArray(body) || body.error || body.code || !['condition', 'temperature', 'wind', 'cloudCover', 'precipitation'].some((field) => field in body)) throw new WeatherError('invalid_response', 'Weather service returned an invalid response.');
        return body;
      });
      const value = { data, fetchedAtMs: now() };
      storeWeather(key, value);
      return present(value, false);
    } catch (error) {
      // Recheck age after a slow failed request; never serve data beyond an hour.
      const stale = cachedWeather(key);
      if (stale) return present(stale, true);
      throw safeError(error);
    }
  }

  async function cities(name, district = '') {
    const query = parseLocalityQuery(name, district);
    const result = await providerRequest(`city:${JSON.stringify(query)}`, '/geo/v2/city/lookup', query.params, (body) => {
      if (body?.code === '404' || body?.code === '204') return { locations: [], attribution: [] };
      if (body?.code === '401' || body?.code === '403') throw new WeatherError('provider_auth', 'Weather service credentials or permissions need attention.', 503);
      if (body?.code === '429') throw new WeatherError('rate_limited', 'Weather service request limit reached.', 429, 60);
      if (body?.code !== '200' || !Array.isArray(body.location)) throw new WeatherError('invalid_response', 'City search returned an invalid response.');
      const text = (value) => typeof value === 'string' ? value.slice(0, 160) : '';
      const seen = new Set();
      const locations = body.location.slice(0, 20).flatMap((location) => {
        try {
          if (!location || !matchesParent(location, query)) return [];
          // Current-weather v1 supports two decimals only. These coordinates
          // come from the selected district, never from a guessed city centre.
          const { lat, lon } = parseCoordinates(location.lat, location.lon);
          if (!text(location.name)) return [];
          const candidate = { name: text(location.name), admin1: text(location.adm1), admin2: text(location.adm2), country: text(location.country), lat, lon, id: text(location.id) };
          const key = candidate.id || JSON.stringify(candidate);
          if (seen.has(key)) return [];
          seen.add(key);
          return [candidate];
        } catch { return []; }
      });
      const attribution = [body.refer?.sources, body.refer?.license].flatMap((items) => Array.isArray(items) ? items.filter((item) => typeof item === 'string').map((item) => item.slice(0, 500)) : []).slice(0, 20);
      return { locations, attribution };
    });
    // No GeoAPI response cache or persistence, including local browser storage.
    return result;
  }

  return { configured, weather, cities };
}

function sendJson(response, status, body, head = false) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store, private');
  response.end(head ? undefined : JSON.stringify(body));
}

function enforceSameOrigin(request) {
  if (request.headers['sec-fetch-site'] === 'cross-site') throw new WeatherError('cross_origin', 'Cross-origin API requests are not allowed.', 403);
  if (request.headers.origin) {
    let origin;
    try { origin = new URL(request.headers.origin); } catch { throw new WeatherError('cross_origin', 'Cross-origin API requests are not allowed.', 403); }
    if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== request.headers.host || origin.username || origin.password) throw new WeatherError('cross_origin', 'Cross-origin API requests are not allowed.', 403);
  }
}

function onlyParameters(url, required) {
  const keys = [...url.searchParams.keys()];
  if (keys.length !== required.length || required.some((key) => url.searchParams.getAll(key).length !== 1) || keys.some((key) => !required.includes(key))) throw new WeatherError('invalid_parameters', 'Unexpected or missing request parameters.', 400);
}

export function createRequestHandler({ service = createWeatherService(), distDir = DEFAULT_DIST } = {}) {
  return async function handleRequest(request, response) {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    try {
      if (!request.url?.startsWith('/') || request.url.startsWith('//') || request.url.length > 2048) throw new WeatherError('invalid_request', 'Invalid request.', 400);
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        enforceSameOrigin(request);
        if (request.method !== 'GET') {
          response.setHeader('Allow', 'GET');
          throw new WeatherError('method_not_allowed', 'Use GET for this endpoint.', 405);
        }
        if (url.pathname === '/api/weather/config') { onlyParameters(url, []); return sendJson(response, 200, { configured: service.configured() }); }
        if (url.pathname === '/api/weather') { onlyParameters(url, ['lat', 'lon']); return sendJson(response, 200, await service.weather(url.searchParams.get('lat'), url.searchParams.get('lon'))); }
        if (url.pathname === '/api/cities') { onlyParameters(url, url.searchParams.has('district') ? ['name', 'district'] : ['name']); return sendJson(response, 200, await service.cities(url.searchParams.get('name'), url.searchParams.get('district') || '')); }
        throw new WeatherError('not_found', 'Endpoint not found.', 404);
      }
      if (!['GET', 'HEAD'].includes(request.method)) { response.setHeader('Allow', 'GET, HEAD'); throw new WeatherError('method_not_allowed', 'Use GET or HEAD.', 405); }
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { throw new WeatherError('invalid_request', 'Invalid path.', 400); }
      if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some((part) => part.startsWith('.'))) throw new WeatherError('not_found', 'File not found.', 404);
      const root = await realpath(distDir);
      let candidate = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      let path = await realpath(candidate).catch(() => null);
      if (!path && !extname(pathname)) path = await realpath(resolve(root, 'index.html'));
      if (!path) throw new WeatherError('not_found', 'File not found.', 404);
      const rel = relative(root, path);
      if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !(await stat(path)).isFile()) throw new WeatherError('not_found', 'File not found.', 404);
      const contents = await readFile(path);
      response.setHeader('Content-Type', MIME_TYPES[extname(path)] || 'application/octet-stream');
      response.setHeader('Cache-Control', 'no-cache');
      response.setHeader('Content-Length', contents.length);
      response.statusCode = 200;
      response.end(request.method === 'HEAD' ? undefined : contents);
    } catch (error) {
      const normalized = error instanceof WeatherError ? error : new WeatherError('not_found', 'File not found. Build the app before starting the server.', 404);
      if (normalized.retryAfter) response.setHeader('Retry-After', String(normalized.retryAfter));
      sendJson(response, normalized.status, { error: { code: normalized.code, message: normalized.message, ...(normalized.retryAfter ? { retryAfter: normalized.retryAfter } : {}) } }, request.method === 'HEAD');
    }
  };
}

export function createWeatherServer(options = {}) {
  const server = createServer(createRequestHandler(options));
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || '8787');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('Invalid server port.');
    process.exitCode = 1;
  } else {
    const server = createWeatherServer();
    server.on('error', () => { console.error('Weather server could not start.'); process.exitCode = 1; });
    server.listen(port, host, () => console.log(`Pond server listening on port ${port}.`));
  }
}
