import test from 'node:test';
import assert from 'node:assert/strict';
import {setupWeatherUI} from '../src/weather-ui.js';
import {WeatherState} from '../src/weather.js';
class Element{constructor(dataset={}){this.value='';this.dataset=dataset;this.listeners={};this.attributes={};this.children=[];this.textContent='';this.hidden=false;this.disabled=false;}addEventListener(name,handler){this.listeners[name]=handler;}removeEventListener(name,handler){if(this.listeners[name]===handler)delete this.listeners[name];}setAttribute(key,value){this.attributes[key]=value;}replaceChildren(){this.children=[];}append(child){this.children.push(child);}focus(){this.focused=true;}async click(){return this.listeners.click?.({currentTarget:this});}}
function setup({protocol='https:',fetchImpl,geolocation,city='上海',district='',growth={storageAvailable:true}}={}){
 const ids=['weather-status','weather-summary','city-form','city-results','weather-credit','local-weather','city-name','district-name','growth-note'];
 const nodes=Object.fromEntries(ids.map(id=>['#'+id,new Element()]));const presets=['clear','rain','snow','wind'].map(name=>new Element({weather:name})),times=['auto','day','night'].map(name=>new Element({time:name}));
 nodes['#city-name'].value=city;nodes['#district-name'].value=district;
 const prior=new Map(['document','location','window','navigator','fetch','FormData'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelector:id=>nodes[id],querySelectorAll:selector=>selector==='[data-weather]'?presets:times,createElement:()=>new Element(),addEventListener(){},visibilityState:'visible'}});
 Object.defineProperty(globalThis,'location',{configurable:true,value:{protocol}});Object.defineProperty(globalThis,'window',{configurable:true,value:{isSecureContext:true}});Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation}});
 Object.defineProperty(globalThis,'fetch',{configurable:true,value:fetchImpl||(()=>{throw new Error('Unexpected network request');})});Object.defineProperty(globalThis,'FormData',{configurable:true,value:class{get(name){return name==='city'?nodes['#city-name'].value:name==='district'?nodes['#district-name'].value:null;}}});
 const weather=new WeatherState(),ui=setupWeatherUI(weather,growth);
 return{nodes,presets,times,weather,growth,ui,restore(){ui.destroy();for(const[name,descriptor]of prior){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}};
}
const response=body=>({ok:true,json:async()=>body});
const live={condition:{code:'305',text:'小雨'},temperature:{value:20},wind:{speed:{value:2},direction:{degree:45}},precipitation:{type:'rain',intensity:{value:2}},cloudCover:.8,metadata:{attributions:['https://developer.qweather.com/attribution.html']}};
test('initialization and manual preview never fetch, locate, or reset existing plant growth',async()=>{const h=setup();try{const originalGrowth={...h.growth};await h.presets[1].click();assert.equal(h.weather.preset,'rain');assert.deepEqual(h.growth,originalGrowth);await h.times[2].click();assert.equal(h.weather.timeMode,'night');}finally{h.restore();}});
test('offline HTML reports live integration requirement without requesting location',async()=>{const h=setup({protocol:'file:'});try{await h.nodes['#local-weather'].click();assert.match(h.nodes['#weather-status'].textContent,/离线文件/);assert.equal(h.ui.locationActive,false);}finally{h.restore();}});
test('unconfigured server prevents location prompt and leaves clear demo state',async()=>{let located=0;const h=setup({fetchImpl:async()=>response({configured:false}),geolocation:{getCurrentPosition(){located++;}}});try{await h.nodes['#local-weather'].click();assert.equal(located,0);assert.equal(h.weather.source,'demo');assert.match(h.nodes['#weather-status'].textContent,/尚未配置/);assert.equal(h.nodes['#local-weather'].disabled,false);}finally{h.restore();}});
test('permission denial shows manual city fallback',async()=>{const h=setup({fetchImpl:async()=>response({configured:true}),geolocation:{getCurrentPosition(resolve,reject){reject({code:1});}}});try{await h.nodes['#local-weather'].click();assert.match(h.nodes['#weather-status'].textContent,/未获得定位权限/);assert.equal(h.nodes['#city-name'].focused,true);assert.equal(h.weather.source,'demo');}finally{h.restore();}});
test('explicit location click is one-shot, rounded before fetching, and exposes attribution',async()=>{let located=0;const urls=[];const h=setup({fetchImpl:async url=>{urls.push(url);return response(url.endsWith('/config')?{configured:true}:{weather:live,fetchedAt:'2026-10-02T12:00:00Z',stale:false});},geolocation:{getCurrentPosition(resolve){located++;resolve({coords:{latitude:31.23456,longitude:121.47678}});}}});try{await h.nodes['#local-weather'].click();assert.equal(located,1);assert.deepEqual(urls,['/api/weather/config','/api/weather?lat=31.23&lon=121.48']);assert.equal(h.weather.source,'live');assert.equal(h.nodes['#weather-credit'].hidden,false);assert.match(h.nodes['#weather-status'].textContent,/上次获取/);}finally{h.restore();}});
test('late live reply cannot override a newer manual weather selection',async()=>{let release,started;const signal=new Promise(resolve=>started=resolve);const h=setup({fetchImpl:async url=>{if(url.endsWith('/config'))return response({configured:true});started();return new Promise(resolve=>release=()=>resolve(response({weather:live,fetchedAt:'2026-10-02T12:00:00Z',stale:false})));},geolocation:{getCurrentPosition(resolve){resolve({coords:{latitude:31,longitude:121}});}}});try{const pending=h.nodes['#local-weather'].click();await signal;await h.presets[2].click();release();await pending;assert.equal(h.weather.source,'demo');assert.equal(h.weather.preset,'snow');assert.equal(h.ui.locationActive,false);}finally{h.restore();}});
test('city search requires selection before weather query and safely renders text',async()=>{const urls=[];const h=setup({fetchImpl:async url=>{urls.push(url);return response(url.endsWith('/config')?{configured:true}:url.startsWith('/api/cities')?{locations:[{name:'上海',admin1:'上海',country:'中国',lat:31.23,lon:121.47}]}:{weather:live,fetchedAt:'2026-10-02T12:00:00Z'});}});try{await h.nodes['#city-form'].listeners.submit({preventDefault(){}});assert.equal(urls.length,2);assert.equal(h.weather.source,'demo');assert.equal(h.nodes['#city-results'].children.length,1);await h.nodes['#city-results'].children[0].click();await new Promise(resolve=>setImmediate(resolve));assert.equal(urls.length,3);assert.equal(h.weather.source,'live');}finally{h.restore();}});

const submit = (h) => h.nodes['#city-form'].listeners.submit({ preventDefault() {} });
const edit = (h, city, district = '') => {
  h.nodes['#city-name'].value = city;
  h.nodes['#district-name'].value = district;
  h.nodes['#city-form'].listeners.input();
};
const districtCandidate = { name: '朝阳', admin1: '北京市', admin2: '北京', country: '中国', lat: 39.92, lon: 116.49 };

test('separate city and district submit only on explicit lookup, and selection uses that district', async () => {
  const urls = [];
  const h = setup({ city: '北京市', district: '朝阳区', fetchImpl: async (url) => {
    urls.push(url);
    return response(url.endsWith('/config') ? { configured: true } : url.startsWith('/api/cities') ? { locations: [districtCandidate] } : { weather: live, fetchedAt: '2026-10-02T12:00:00Z' });
  } });
  try {
    edit(h, '北京市', '朝阳区');
    assert.equal(urls.length, 0);
    await submit(h);
    const query = new URL(urls[1], 'https://pond.test');
    assert.equal(query.searchParams.get('name'), '北京市');
    assert.equal(query.searchParams.get('district'), '朝阳区');
    assert.equal(h.ui.locationActive, false);
    assert.match(h.nodes['#city-results'].children[0].textContent, /朝阳 · 北京 · 北京市 · 中国/);
    assert.equal(h.nodes['#city-form'].attributes['aria-busy'], 'false');
    await h.nodes['#city-results'].children[0].click();
    assert.equal(urls[2], '/api/weather?lat=39.92&lon=116.49');
    assert.match(h.nodes['#weather-status'].textContent, /北京 · 朝阳/);
    assert.equal(h.weather.source, 'live');
  } finally { h.restore(); }
});

test('a combined city and district stays intact for server parsing; blank city sends no request', async () => {
  const urls = [];
  const h = setup({ city: '北京市朝阳区', fetchImpl: async (url) => { urls.push(url); return response(url.endsWith('/config') ? { configured: true } : { locations: [] }); } });
  try {
    await submit(h);
    const query = new URL(urls[1], 'https://pond.test').searchParams;
    assert.equal(query.get('name'), '北京市朝阳区');
    assert.equal(query.has('district'), false);
    assert.match(h.nodes['#weather-status'].textContent, /没找到匹配地区/);
    edit(h, '', '朝阳区');
    await submit(h);
    assert.equal(urls.length, 2);
    assert.match(h.nodes['#weather-status'].textContent, /请先填写城市/);
  } finally { h.restore(); }
});

test('same-named district choices select the displayed parent and its own coordinates', async () => {
  const urls = [];
  const h = setup({ city: '朝阳', fetchImpl: async (url) => {
    urls.push(url);
    return response(url.endsWith('/config') ? { configured: true } : url.startsWith('/api/cities') ? { locations: [districtCandidate, { ...districtCandidate, admin1: '吉林省', admin2: '长春', lat: 43.83, lon: 125.29 }] } : { weather: live });
  } });
  try {
    await submit(h);
    assert.equal(h.nodes['#city-results'].children.length, 2);
    await h.nodes['#city-results'].children[1].click();
    assert.equal(urls[2], '/api/weather?lat=43.83&lon=125.29');
    assert.match(h.nodes['#weather-status'].textContent, /长春 · 朝阳/);
  } finally { h.restore(); }
});

test('editing fields invalidates old candidates and ignores a late search response', async () => {
  let release, started;
  const pending = new Promise((resolve) => { started = resolve; });
  let cityCalls = 0;
  const urls = [];
  const h = setup({ fetchImpl: async (url) => {
    urls.push(url);
    if (url.endsWith('/config')) return response({ configured: true });
    if (++cityCalls === 1) return response({ locations: [districtCandidate] });
    started();
    return new Promise((resolve) => { release = () => resolve(response({ locations: [districtCandidate] })); });
  } });
  try {
    await submit(h);
    const oldButton = h.nodes['#city-results'].children[0];
    edit(h, '石家庄市', '长安区');
    await oldButton.click();
    assert.equal(urls.length, 2);
    assert.equal(h.ui.locationActive, false);
    const search = submit(h);
    await pending;
    edit(h, '成都市', '武侯区');
    release();
    await search;
    assert.equal(h.nodes['#city-results'].children.length, 0);
    assert.match(h.nodes['#weather-status'].textContent, /填写城市和区县后/);
    assert.equal(h.nodes['#city-form'].attributes['aria-busy'], 'false');
  } finally { h.restore(); }
});

test('switching to a demo during district lookup prevents late candidate rendering', async () => {
  let release, started;
  const pending = new Promise((resolve) => { started = resolve; });
  const h = setup({ fetchImpl: async (url) => {
    if (url.endsWith('/config')) return response({ configured: true });
    started();
    return new Promise((resolve) => { release = () => resolve(response({ locations: [districtCandidate] })); });
  } });
  try {
    const search = submit(h);
    await pending;
    await h.presets[2].click();
    release();
    await search;
    assert.equal(h.weather.preset, 'snow');
    assert.equal(h.nodes['#city-results'].children.length, 0);
    assert.match(h.nodes['#weather-status'].textContent, /演示天气/);
  } finally { h.restore(); }
});

test('lookup failures are actionable and invalid candidate coordinates cannot be selected', async () => {
  let phase = 0;
  const h = setup({ fetchImpl: async (url) => {
    if (url.endsWith('/config')) return response({ configured: true });
    if (phase === 0) return { ok: false, json: async () => ({ error: { code: 'rate_limited', message: 'private upstream detail' } }) };
    return response({ locations: [{ ...districtCandidate, lat: null }, { ...districtCandidate, lon: 181 }, null] });
  } });
  try {
    await submit(h);
    assert.match(h.nodes['#weather-status'].textContent, /查询较频繁/);
    assert.doesNotMatch(h.nodes['#weather-status'].textContent, /private/);
    phase = 1;
    await submit(h);
    assert.match(h.nodes['#weather-status'].textContent, /没找到匹配地区/);
    assert.equal(h.nodes['#city-results'].children.length, 0);
    assert.equal(h.weather.source, 'demo');
  } finally { h.restore(); }
});

test('natural growth requires no preview/reset controls and exposes unavailable storage', () => {
  const h = setup({ growth: { storageAvailable: false } });
  try { assert.match(h.nodes['#growth-note'].textContent, /浏览器无法保存进度/); }
  finally { h.restore(); }
});

test('repeated submits cannot let the slower earlier search replace the latest candidates', async () => {
  let release, started;
  const pending = new Promise((resolve) => { started = resolve; });
  let calls = 0;
  const h = setup({ fetchImpl: async (url) => {
    if (url.endsWith('/config')) return response({ configured: true });
    if (++calls === 1) {
      started();
      return new Promise((resolve) => { release = () => resolve(response({ locations: [districtCandidate] })); });
    }
    return response({ locations: [{ ...districtCandidate, name: '长安', admin1: '河北省', admin2: '石家庄' }] });
  } });
  try {
    const first = submit(h);
    await pending;
    h.nodes['#city-name'].value = '石家庄市';
    h.nodes['#district-name'].value = '长安区';
    await submit(h);
    release();
    await first;
    assert.equal(h.nodes['#city-results'].children.length, 1);
    assert.match(h.nodes['#city-results'].children[0].textContent, /长安 · 石家庄/);
    assert.doesNotMatch(h.nodes['#city-results'].children[0].textContent, /北京/);
  } finally { h.restore(); }
});

test('candidate names and provider attribution are text, never executable markup', async () => {
  const name = '<img src=x onerror=alert(1)>';
  const h = setup({ fetchImpl: async (url) => response(url.endsWith('/config') ? { configured: true } : { locations: [{ ...districtCandidate, name }], attribution: ['javascript:alert(1)'] }) });
  try {
    await submit(h);
    assert.ok(h.nodes['#city-results'].children[0].textContent.includes(name));
    assert.equal(h.nodes['#city-results'].children[0].innerHTML, undefined);
    assert.equal(h.nodes['#weather-credit'].children[1].textContent, 'javascript:alert(1)');
    assert.equal(h.nodes['#weather-credit'].children[1].children.length, 0);
  } finally { h.restore(); }
});
