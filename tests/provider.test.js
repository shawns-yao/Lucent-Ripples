import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWeatherService, createRequestHandler, readProviderConfig, parseCoordinates, parseCityName, parseLocalityQuery } from '../server/weather-server.mjs';

// No real credentials or provider network requests. Every provider fetch is fake.
const fakeEnv = { QWEATHER_API_HOST: 'fixture.xy.qweatherapi.com', QWEATHER_API_KEY: 'fake_test_key' };
const fixture = { metadata: { tag: 'fixture', attributions: ['https://www.qweather.com'] }, condition: { code: '305', text: '小雨' }, temperature: { value: 22, unit: '°C' }, cloudCover: 0.8, wind: { speed: { value: 3, unit: 'm/s' } }, precipitation: { intensity: { value: 0.6, unit: 'mm/h' }, type: 'rain' } };
const response = (body = fixture, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const isCode = (code) => (error) => error.code === code;
function service(options = {}) { return createWeatherService({ env: fakeEnv, random: () => 0, ...options }); }
function makeJwt(exp) { return `${Buffer.from('{"alg":"EdDSA"}').toString('base64url')}.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.fake_signature`; }
async function request(handler, url, headers = {}, method = 'GET') {
  const output = { statusCode: 0, headers: {}, body: undefined };
  output.setHeader = (name, value) => { output.headers[name.toLowerCase()] = value; };
  output.end = (body) => { output.body = body; };
  await handler({ url, headers: { host: '127.0.0.1:8787', ...headers }, method }, output);
  output.json = () => JSON.parse(String(output.body));
  return output;
}

test('strict dedicated host and exactly one auth method; JWT expiration is checked', () => {
  assert.equal(readProviderConfig({}).configured, false);
  assert.equal(readProviderConfig(fakeEnv).configured, true);
  for (const host of ['qweatherapi.com', 'api.qweather.com', 'devapi.qweather.com', 'https://fixture.qweatherapi.com', 'fixture.qweatherapi.com:443', 'fixture.qweatherapi.com.evil.test', 'evil@fixture.qweatherapi.com', 'fixture.qweatherapi.com/path', '127.0.0.1', 'fixture.qweatherapi.com\n.evil.test', '-bad.qweatherapi.com']) {
    assert.equal(readProviderConfig({ ...fakeEnv, QWEATHER_API_HOST: host }).configured, false, host);
  }
  assert.equal(readProviderConfig({ ...fakeEnv, QWEATHER_JWT: makeJwt(100) }, 0).configured, false);
  assert.equal(readProviderConfig({ ...fakeEnv, QWEATHER_API_KEY: 'header\r\ninjection' }).configured, false);
  const jwtEnv = { QWEATHER_API_HOST: fakeEnv.QWEATHER_API_HOST, QWEATHER_JWT: makeJwt(100) };
  assert.equal(readProviderConfig(jwtEnv, 0).configured, true);
  assert.equal(readProviderConfig(jwtEnv, 100_000).configured, false);
  assert.equal(readProviderConfig({ ...jwtEnv, QWEATHER_JWT: 'invalid' }).configured, false);
});

test('coordinate validation rejects coercions and rounds data sent upstream', () => {
  assert.deepEqual(parseCoordinates('39.91755', '116.41876'), { lat: 39.92, lon: 116.42 });
  assert.deepEqual(parseCoordinates('-90', '180'), { lat: -90, lon: 180 });
  for (const [lat, lon] of [['', '1'], [null, '1'], ['91', '1'], ['1', '181'], ['NaN', '1'], ['Infinity', '1'], ['1e2', '1'], ['0x10', '1'], [' 1', '1'], ['1', '/admin'], ['1&key=bad', '1']]) assert.throws(() => parseCoordinates(lat, lon), isCode('invalid_location'));
  assert.equal(parseCityName('  北京  '), '北京');
  assert.equal(parseCityName('New   York'), 'New York');
  for (const name of ['', ' ', 'x'.repeat(81), '../secret', 'x\ny', 'https://evil.test']) assert.throws(() => parseCityName(name), isCode('invalid_name'));
});

test('construction, configuration reads and unconfigured API never fetch', async () => {
  let calls = 0;
  const weather = service({ env: {}, fetchImpl: async () => { calls++; return response(); } });
  const handler = createRequestHandler({ service: weather });
  assert.deepEqual((await request(handler, '/api/weather/config')).json(), { configured: false });
  assert.equal(calls, 0);
  assert.equal((await request(handler, '/api/weather?lat=39.92&lon=116.42')).statusCode, 503);
  await assert.rejects(weather.cities('北京'), isCode('not_configured'));
  assert.equal(calls, 0);
});

test('v1 request uses lat/lon path, one header credential and no redirects; response contract is stable', async () => {
  let captured;
  const weather = service({ now: () => 1_000_000, fetchImpl: async (...args) => { captured = args; return response(); } });
  const value = await weather.weather('39.91755', '116.41876');
  assert.equal(captured[0], 'https://fixture.xy.qweatherapi.com/weather/v1/current/39.92/116.42?lang=zh');
  assert.equal(captured[1].headers['X-QW-Api-Key'], 'fake_test_key');
  assert.equal(captured[1].headers.Authorization, undefined);
  assert.equal(captured[1].redirect, 'error');
  assert.equal(captured[1].method, 'GET');
  assert.deepEqual(value, { weather: fixture, fetchedAt: new Date(1_000_000).toISOString(), stale: false, place: '附近', attribution: ['https://www.qweather.com'] });
  assert.ok(!JSON.stringify(value).includes('fake_test_key'));
});

test('JWT path uses bearer only and expires without further provider calls', async () => {
  let current = 0;
  let calls = 0;
  const jwt = makeJwt(100);
  const weather = service({ env: { QWEATHER_API_HOST: fakeEnv.QWEATHER_API_HOST, QWEATHER_JWT: jwt }, now: () => current, fetchImpl: async (_url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, `Bearer ${jwt}`);
    assert.equal(options.headers['X-QW-Api-Key'], undefined);
    return response();
  } });
  await weather.weather(1, 2);
  current = 100_000;
  assert.equal(weather.configured(), false);
  await assert.rejects(weather.weather(2, 3), isCode('not_configured'));
  assert.equal(calls, 1);
});

test('weather caches for ten minutes, then deduplicates concurrent refreshes', async () => {
  let current = 0;
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const weather = service({ now: () => current, fetchImpl: async () => { calls++; if (calls > 1) await gate; return response(); } });
  await weather.weather(1, 2);
  current = 599_999;
  await weather.weather(1, 2);
  assert.equal(calls, 1);
  current = 600_000;
  const first = weather.weather(1, 2);
  const second = weather.weather(1, 2);
  assert.equal(calls, 2);
  release();
  assert.deepEqual(await first, await second);
  assert.equal(calls, 2);
});

test('failure serves labeled stale weather for less than one hour; backoff is global', async () => {
  let current = 0;
  let calls = 0;
  const weather = service({ now: () => current, fetchImpl: async () => { calls++; if (calls > 1) throw new Error('secret upstream detail'); return response(); } });
  await weather.weather(1, 2);
  current = 600_000;
  const stale = await weather.weather(1, 2);
  assert.equal(stale.stale, true);
  assert.equal(stale.fetchedAt, new Date(0).toISOString());
  await assert.rejects(weather.weather(3, 4), isCode('rate_limited'));
  assert.equal(calls, 2);
  current = 3_600_000;
  await assert.rejects(weather.weather(1, 2), isCode('provider_unavailable'));
  assert.equal(calls, 3);
});

test('bounded weather cache evicts older entries', async () => {
  let calls = 0;
  const weather = service({ maxCacheEntries: 2, fetchImpl: async () => { calls++; return response(); } });
  await weather.weather(1, 1);
  await weather.weather(2, 2);
  await weather.weather(3, 3);
  await weather.weather(1, 1);
  assert.equal(calls, 4);
});

test('credential failures stop retries until configuration is corrected and process restarted', async () => {
  let current = 0;
  let calls = 0;
  const weather = service({ now: () => current, fetchImpl: async () => { calls++; return response({ privateDetail: 'do not expose' }, 401); } });
  await assert.rejects(weather.weather(1, 2), isCode('provider_auth'));
  current = 24 * 60 * 60 * 1000;
  await assert.rejects(weather.weather(3, 4), isCode('provider_auth'));
  assert.equal(calls, 1);
});

test('429 uses at least a minute of backoff without another provider call', async () => {
  let current = 0;
  let calls = 0;
  const weather = service({ now: () => current, fetchImpl: async () => { calls++; return response({}, 429); } });
  await assert.rejects(weather.weather(1, 2), isCode('rate_limited'));
  current = 59_999;
  await assert.rejects(weather.weather(3, 4), isCode('rate_limited'));
  assert.equal(calls, 1);
});

test('timeouts abort provider fetch and reject safely', async () => {
  let signal;
  const weather = service({ timeoutMs: 5, fetchImpl: async (_url, options) => { signal = options.signal; return new Promise(() => {}); } });
  await assert.rejects(weather.weather(1, 2), isCode('provider_timeout'));
  assert.equal(signal.aborted, true);
});

test('city search uses official geo endpoint, maps up to twenty results, and does not cache GeoAPI data', async () => {
  let calls = 0;
  const weather = service({ fetchImpl: async (url) => {
    calls++;
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/geo/v2/city/lookup');
    assert.equal(parsed.searchParams.get('location'), '北京');
    assert.equal(parsed.searchParams.get('number'), '20');
    return response({ code: '200', location: Array.from({ length: 21 }, (_, i) => ({ name: `北京${i}`, adm1: '北京市', adm2: '北京', country: '中国', lat: '39.91755', lon: '116.41876', id: String(i) })) });
  } });
  const result = await weather.cities('北京');
  assert.equal(result.locations.length, 20);
  assert.deepEqual(result.locations[0], { name: '北京0', admin1: '北京市', admin2: '北京', country: '中国', lat: 39.92, lon: 116.42, id: '0' });
  await weather.cities('北京');
  assert.equal(calls, 2);
});

test('city empty result and invalid provider bodies are handled safely', async () => {
  assert.deepEqual(await service({ fetchImpl: async () => response({ code: '404' }) }).cities('不存在'), { locations: [], attribution: [] });
  await assert.rejects(service({ fetchImpl: async () => response({ secret: 'unexpected' }) }).weather(1, 2), isCode('invalid_response'));
  await assert.rejects(service({ fetchImpl: async () => new Response('not json') }).weather(1, 2), isCode('invalid_response'));
  const value = await service({ fetchImpl: async () => response({ temperature: null }) }).weather(1, 2);
  assert.deepEqual(value.attribution, []);
});

test('in-flight limit bounds upstream concurrency', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const weather = service({ maxConcurrent: 1, fetchImpl: async () => { calls++; await gate; return response(); } });
  const first = weather.weather(1, 2);
  await assert.rejects(weather.weather(3, 4), isCode('rate_limited'));
  assert.equal(calls, 1);
  release();
  await first;
});

test('HTTP API exposes config boolean only, no-store and safe errors; rejects cross-origin, duplicate parameters and methods', async () => {
  let calls = 0;
  const weather = service({ fetchImpl: async () => { calls++; throw new Error('fake_test_key private URL'); } });
  const handler = createRequestHandler({ service: weather });
  const config = await request(handler, '/api/weather/config');
  assert.deepEqual(config.json(), { configured: true });
  assert.equal(config.headers['cache-control'], 'no-store, private');
  assert.equal(config.headers['access-control-allow-origin'], undefined);
  for (const headers of [{ origin: 'https://evil.test' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await request(handler, '/api/weather?lat=1&lon=2', headers)).statusCode, 403);
  assert.equal((await request(handler, '/api/weather?lat=1&lat=2&lon=3')).statusCode, 400);
  assert.equal((await request(handler, '/api/weather?lat=1&lon=2&host=evil.test')).statusCode, 400);
  assert.equal((await request(handler, '/api/weather', {}, 'POST')).statusCode, 405);
  assert.equal(calls, 0);
  const error = await request(handler, '/api/weather?lat=1&lon=2', { origin: 'http://127.0.0.1:8787' });
  assert.equal(error.statusCode, 502);
  assert.equal(error.json().error.code, 'provider_unavailable');
  assert.ok(!error.body.includes('fake_test_key'));
  assert.ok(!error.body.includes('private URL'));
  assert.equal(error.headers['cache-control'], 'no-store, private');
});

test('static server serves only dist files and rejects hidden files and escaping symlinks', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'pond-provider-test-'));
  try {
    const dist = join(temporary, 'dist');
    await mkdir(dist);
    await writeFile(join(dist, 'index.html'), '<title>pond</title>');
    await writeFile(join(temporary, 'outside.txt'), 'private');
    await symlink(join(temporary, 'outside.txt'), join(dist, 'escape.txt'));
    const handler = createRequestHandler({ service: service({ env: {}, fetchImpl: async () => { throw new Error('must not fetch'); } }), distDir: dist });
    assert.equal((await request(handler, '/')).body.toString(), '<title>pond</title>');
    assert.equal((await request(handler, '/escape.txt')).statusCode, 404);
    assert.equal((await request(handler, '/.env')).statusCode, 404);
    assert.equal((await request(handler, '/%2e%2e/outside.txt')).statusCode, 404);
    assert.equal((await request(handler, '/api/unknown')).statusCode, 404);
    assert.equal((await request(handler, '/', {}, 'HEAD')).body, undefined);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('manual locality parser supports city plus district without a fixed city list', () => {
  for (const [name, district, location, adm] of [
    ['北京市朝阳区', '', '朝阳', '北京'],
    ['石家庄市正定县', '', '正定', '石家庄'],
    ['成都市郫都区', '', '郫都', '成都'],
    ['北京', '朝阳区', '朝阳', '北京'],
    ['北京 朝阳区', '', '朝阳', '北京'],
    ['恩施土家族苗族自治州恩施市', '', '恩施', '恩施土家族苗族'],
    ['香港特别行政区中西区', '', '中西', '香港'],
  ]) {
    const query = parseLocalityQuery(name, district);
    assert.equal(query.params.location, location);
    assert.equal(query.params.adm, adm);
    assert.equal(query.params.number, '20');
    assert.equal(query.params.range, 'cn');
  }
  assert.deepEqual(parseLocalityQuery('New York').params, { location: 'New York', number: '20', lang: 'zh' });
  assert.deepEqual(parseLocalityQuery('石家庄').params, { location: '石家庄', number: '20', lang: 'zh' });
  assert.equal(parseLocalityQuery('四川省成都市武侯区').province, '四川省');
  assert.equal(parseLocalityQuery('四川省成都市武侯区').params.adm, '成都');
  for (const district of [null, {}, [], 'x'.repeat(81), '../secret', 'a\nb']) assert.throws(() => parseLocalityQuery('北京市', district), isCode('invalid_name'));
});

test('district lookup sends adm and filters conflicting parents, invalid coordinates, and duplicate candidates', async () => {
  const urls = [];
  const locations = [
    { name: '朝阳', adm1: '北京市', adm2: '北京', country: '中国', lat: '39.921', lon: '116.486', id: 'beijing-chaoyang' },
    { name: '朝阳', adm1: '吉林省', adm2: '长春', country: '中国', lat: '43.834', lon: '125.288', id: 'changchun-chaoyang' },
    { name: '朝阳', adm1: '北京市', adm2: '北京', country: '中国', lat: null, lon: '116.486', id: 'bad' },
  ];
  locations.push(locations[0]);
  const weather = service({ fetchImpl: async (url) => {
    urls.push(new URL(url));
    return response({ code: '200', location: locations, refer: { sources: ['https://www.qweather.com'], license: ['QWeather Developers License'] } });
  } });
  const result = await weather.cities('北京市朝阳区');
  assert.equal(urls[0].searchParams.get('adm'), '北京');
  assert.equal(urls[0].searchParams.get('location'), '朝阳');
  assert.equal(result.locations.length, 1);
  assert.deepEqual(result.locations[0], { name: '朝阳', admin1: '北京市', admin2: '北京', country: '中国', lat: 39.92, lon: 116.49, id: 'beijing-chaoyang' });
  assert.deepEqual(result.attribution, ['https://www.qweather.com', 'QWeather Developers License']);
  await weather.cities('北京市', '朝阳区');
  assert.equal(urls.length, 2, 'GeoAPI data is never cached');
});

test('district misses do not silently fall back to a city centre or a different province', async () => {
  let calls = 0;
  const weather = service({ fetchImpl: async () => {
    calls++;
    return response({ code: '200', location: [{ name: '鼓楼', adm1: '福建省', adm2: '南京', lat: '26.08', lon: '119.3', id: 'wrong-province' }] });
  } });
  assert.deepEqual((await weather.cities('江苏省南京市鼓楼区')).locations, []);
  assert.equal(calls, 1);
});

test('same-name searches retain candidates for confirmation across different cities', async () => {
  const weather = service({ fetchImpl: async () => response({ code: '200', location: [
    { name: '朝阳', adm1: '北京市', adm2: '北京', lat: '39.92', lon: '116.49', id: '1' },
    { name: '朝阳', adm1: '吉林省', adm2: '长春', lat: '43.83', lon: '125.29', id: '2' },
  ] }) });
  const result = await weather.cities('朝阳');
  assert.deepEqual(result.locations.map((item) => item.admin2), ['北京', '长春']);
});

test('HTTP city API accepts optional district, enforces exact parameters, and keeps results private', async () => {
  let calls = 0;
  const weather = service({ fetchImpl: async (url) => {
    calls++;
    assert.equal(new URL(url).searchParams.get('adm'), '石家庄');
    assert.equal(new URL(url).searchParams.get('location'), '长安');
    return response({ code: '204' });
  } });
  const handler = createRequestHandler({ service: weather });
  const result = await request(handler, '/api/cities?' + new URLSearchParams({ name: '石家庄市', district: '长安区' }));
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['cache-control'], 'no-store, private');
  assert.equal(calls, 1);
  for (const query of ['name=x&district=a&district=b', 'name=x&district=y&adm=z', 'district=x', 'name=a&name=b']) assert.equal((await request(handler, '/api/cities?' + query)).statusCode, 400);
  assert.equal(calls, 1);
});

test('documented HTTP 400 city miss is empty and does not disable subsequent valid lookups', async () => {
  let calls = 0;
  const weather = service({ fetchImpl: async () => {
    if (++calls === 1) return response({ error: { status: 400, type: 'https://dev.qweather.com/docs/resource/error-code/#no-such-location', title: 'No Such Location', detail: 'do not expose raw details' } }, 400);
    return response({ code: '200', location: [{ name: '朝阳', adm1: '北京市', adm2: '北京', lat: '39.92', lon: '116.49', id: '1' }] });
  } });
  assert.deepEqual(await weather.cities('不存在的地区'), { locations: [], attribution: [] });
  assert.equal((await weather.cities('北京市朝阳区')).locations.length, 1);
  assert.equal(calls, 2);
});

test('empty HTTP 204 city responses are handled; other 400 errors retain endpoint protection', async () => {
  assert.deepEqual(await service({ fetchImpl: async () => new Response(null, { status: 204 }) }).cities('不存在'), { locations: [], attribution: [] });
  let calls = 0;
  const weather = service({ fetchImpl: async () => {
    calls++;
    return response({ error: { status: 400, type: 'https://dev.qweather.com/docs/resource/error-code/#invalid-parameters' } }, 400);
  } });
  await assert.rejects(weather.cities('北京'), isCode('provider_endpoint'));
  await assert.rejects(weather.cities('上海'), isCode('provider_endpoint'));
  assert.equal(calls, 1);
});
