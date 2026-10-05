import { roundCoordinates } from './weather.js';
import { setupSceneClock } from './scene-clock.js';

const REFRESH_MS = 10 * 60 * 1000;
const API_ERRORS = {
  not_configured: '实时天气尚未配置，请先在服务端配置和风天气凭据',
  provider_auth: '天气服务的凭据或权限有误，请检查服务端配置',
  provider_endpoint: '天气服务接口暂不可用，请检查服务端配置',
  rate_limited: '天气查询较频繁，请稍后再试',
  provider_timeout: '天气服务响应超时，请稍后再试',
  provider_unavailable: '天气服务暂时不可用，请稍后再试',
  invalid_response: '天气服务返回的数据不完整，请稍后再试',
  invalid_name: '请填写有效的城市和区县名称，每项最多 80 个字',
  invalid_location: '位置信息无效，请重新查找并选择地区',
};
const uniqueNames = (names) => names.filter((name, index) => typeof name === 'string' && name && names.indexOf(name) === index);
const candidateLabel = (city) => uniqueNames([city.name, city.admin2, city.admin1, city.country]).join(' · ');
// Keep the parent in the live status: 朝阳 alone is ambiguous across cities.
const locationLabel = (city) => uniqueNames([city.admin2 || city.admin1, city.name]).join(' · ');

export function setupWeatherUI(weather, growth, onChange = () => {}) {
  const status = document.querySelector('#weather-status');
  const summary = document.querySelector('#weather-summary');
  const clock = setupSceneClock(summary);
  const buttons = [...document.querySelectorAll('[data-weather]')];
  const cityForm = document.querySelector('#city-form');
  const results = document.querySelector('#city-results');
  const credit = document.querySelector('#weather-credit');
  const local = document.querySelector('#local-weather');
  const listeners = [];
  let token = 0, controller = null, activeLocation = null, timer = null, lastFetched = 0;
  let displayedLocation = null;
  let weatherAttributions = [], lookupAttributions = [];
  const listen = (element, event, handler) => {
    element.addEventListener(event, handler);
    listeners.push(() => element.removeEventListener?.(event, handler));
  };
  const setStatus = (text) => { status.textContent = text; };
  const setSearching = (busy) => cityForm.setAttribute('aria-busy', String(busy));
  const updateSummary = () => {
    clock.setWeather(weather);
    buttons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.weather === weather.preset));
      button.disabled = button.dataset.weather === 'snow' && weather.season !== 'winter';
      if(button.disabled)button.title='降雪仅在冬季可用';else button.removeAttribute('title');
    });
  };
  function cancel() {
    token++;
    controller?.abort();
    controller = null;
    clearTimeout(timer);
    timer = null;
    setSearching(false);
    local.disabled = false;
  }
  function demo(name) {
    if(weather.setPreset(name)===false)return;
    cancel();
    activeLocation = null;
    displayedLocation = null;
    results.replaceChildren();
    credit.hidden = true;
    weatherAttributions = [];
    lookupAttributions = [];
    setStatus('演示天气 · 未获取位置或真实天气');
    updateSummary();
    onChange();
  }
  buttons.forEach((button) => listen(button, 'click', () => demo(button.dataset.weather)));
  function setTime(mode) {
    if (!['auto', 'day', 'night'].includes(mode)) return;
    weather.timeMode = mode;
    document.querySelectorAll('[data-time]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.time === mode)));
    onChange();
  }
  document.querySelectorAll('[data-time]').forEach((button) => listen(button, 'click', () => setTime(button.dataset.time)));
  function renderCredit(attributions = []) {
    credit.replaceChildren();
    const anchor = document.createElement('a');
    anchor.href = 'https://www.qweather.com';
    anchor.textContent = '天气服务由和风天气提供';
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    credit.append(anchor);
    for (const entry of new Set(Array.isArray(attributions) ? attributions : [])) {
      if (typeof entry !== 'string') continue;
      const line = document.createElement('div');
      try {
        const url = new URL(entry);
        if (url.protocol !== 'https:') throw new Error();
        const link = document.createElement('a');
        link.href = url.href;
        link.textContent = '数据来源与许可';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        line.append(link);
      } catch { line.textContent = entry; }
      credit.append(line);
    }
    credit.hidden = false;
  }
  async function json(path, signal) {
    let response;
    try { response = await fetch(path, { signal, credentials: 'same-origin', cache: 'no-store' }); }
    catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('网络连接失败，请稍后重试');
    }
    let data;
    try { data = await response.json(); }
    catch { throw new Error('天气服务暂时不可用，请稍后再试'); }
    if (!response.ok) throw new Error(API_ERRORS[data?.error?.code] || '天气服务暂时不可用，请稍后再试');
    return data;
  }
  function available() {
    if (location.protocol === 'file:') {
      setStatus('离线文件可以预览天气；真实天气需运行附带的服务端并安全配置和风天气凭据');
      return false;
    }
    return true;
  }
  async function configured(signal) {
    const config = await json('/api/weather/config', signal);
    if (!config.configured) throw new Error('实时天气尚未配置。可先切换演示；配置时不要把密钥放进前端或聊天');
  }
  function schedule() {
    clearTimeout(timer);
    if (activeLocation) timer = setTimeout(() => {
      if (document.visibilityState === 'visible') refresh();
      else schedule();
    }, REFRESH_MS);
  }
  async function refresh() {
    if (!activeLocation) return;
    cancel();
    const run = token, place = { ...activeLocation };
    controller = new AbortController();
    setStatus(`${place.name} · 正在获取天气…`);
    try {
      const data = await json(`/api/weather?lat=${place.lat}&lon=${place.lon}`, controller.signal);
      if (run !== token) return;
      weather.setLive(data.weather, place);
      displayedLocation = place;
      lastFetched = Date.now();
      const date = new Date(data.fetchedAt);
      const fetched = Number.isNaN(date.getTime()) ? '刚刚' : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      setStatus(`${place.name} · ${Math.round(weather.target.temp)}°C · ${data.stale ? '缓存天气，连接暂不可用' : '上次获取 ' + fetched}`);
      weatherAttributions = data.attribution || data.weather.metadata?.attributions || [];
      renderCredit([...lookupAttributions, ...(Array.isArray(weatherAttributions) ? weatherAttributions : [])]);
      updateSummary();
      onChange();
    } catch (error) {
      if (run !== token || error.name === 'AbortError') return;
      setStatus(`${error.message}。${weather.source === 'live' ? '保留' + (displayedLocation?.name || '上次') + '的天气画面' : '继续显示演示天气'}，也可手动填写城市和区县`);
    } finally {
      if (run === token) { controller = null; schedule(); }
    }
  }
  listen(local, 'click', async () => {
    if (!available()) return;
    cancel();
    activeLocation = null;
    results.replaceChildren();
    const run = token;
    controller = new AbortController();
    local.disabled = true;
    lookupAttributions = [];
    try {
      await configured(controller.signal);
      if (run !== token) return;
      if (!window.isSecureContext || !navigator.geolocation) throw new Error('浏览器定位需要 HTTPS，也可手动填写城市和区县');
      setStatus('请在浏览器提示中选择是否允许定位');
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }));
      if (run !== token) return;
      activeLocation = { ...roundCoordinates(position.coords.latitude, position.coords.longitude), name: '附近' };
      await refresh();
    } catch (error) {
      if (run !== token || error.name === 'AbortError') return;
      setStatus(error.code === 1 ? '未获得定位权限，请手动填写城市和区县' : error.code === 2 ? '暂时无法定位，请手动填写城市和区县' : error.code === 3 ? '定位超时，请手动填写城市和区县' : error.message);
      document.querySelector('#city-name').focus();
    } finally {
      if (run === token) { controller = null; local.disabled = false; }
    }
  });
  listen(cityForm, 'input', () => {
    // Changing a field invalidates pending and visible candidates. A late reply
    // or a detached candidate button must not select an earlier query.
    cancel();
    activeLocation = null;
    results.replaceChildren();
    setStatus('填写城市和区县后点“查找”，再选择匹配的地区');
  });
  listen(cityForm, 'submit', async (event) => {
    event.preventDefault();
    if (!available()) return;
    const form = new FormData(cityForm);
    const name = String(form.get('city') || '').trim();
    const district = String(form.get('district') || '').trim();
    if (!name) { setStatus('请先填写城市名称，再填写区县（可选）'); return; }
    cancel();
    activeLocation = null;
    const run = token;
    controller = new AbortController();
    results.replaceChildren();
    setSearching(true);
    setStatus('正在查找城市和区县…');
    try {
      await configured(controller.signal);
      if (run !== token) return;
      const query = new URLSearchParams({ name });
      if (district) query.set('district', district);
      const data = await json(`/api/cities?${query}`, controller.signal);
      if (run !== token) return;
      const candidates = (Array.isArray(data.locations) ? data.locations : []).filter((city) => {
        if (!city || typeof city.name !== 'string' || !city.name.trim()) return false;
        if (typeof city.lat !== 'number' || typeof city.lon !== 'number') return false;
        try { roundCoordinates(city.lat, city.lon); return true; } catch { return false; }
      });
      if (!candidates.length) {
        setStatus('没找到匹配地区，请检查城市和区县全名；也可将“北京市”和“朝阳区”分开填写');
        return;
      }
      setStatus('请选择对应地区，确认后再获取天气');
      lookupAttributions = Array.isArray(data.attribution) ? data.attribution : [];
      renderCredit([...lookupAttributions, ...(Array.isArray(weatherAttributions) ? weatherAttributions : [])]);
      for (const city of candidates) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = candidateLabel(city);
        button.addEventListener('click', () => {
          if (run !== token) return;
          activeLocation = { ...roundCoordinates(city.lat, city.lon), name: locationLabel(city) };
          results.replaceChildren();
          return refresh();
        });
        results.append(button);
      }
    } catch (error) {
      if (run === token && error.name !== 'AbortError') setStatus(error.message);
    } finally {
      if (run === token) { controller = null; setSearching(false); }
    }
  });
  const growthNote = document.querySelector('#growth-note');
  if (growthNote && growth.storageAvailable === false) growthNote.textContent = '荷叶与花按真实时间缓慢生长；浏览器无法保存进度，关闭后可能丢失';
  listen(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible' && activeLocation && Date.now() - lastFetched >= REFRESH_MS && !controller) refresh();
  });
  updateSummary();
  return {
    setDemo: demo,
    setTime,
    refreshSummary: updateSummary,
    updateScene: clock.setScene,
    get locationActive() { return Boolean(activeLocation); },
    destroy: () => { cancel(); clock.destroy(); activeLocation = null; listeners.forEach((remove) => remove()); },
  };
}
