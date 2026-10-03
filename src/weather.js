// Weather is normalized here, separately from the fish and botanical clocks.
export const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) && value !== null ? Number(value) : fallback;
export const WEATHER_PRESETS = {
  clear: {label:'晴', temp:26, cloud:.08, rain:0, snow:0, wind:1.3, windDegree:220, light:1},
  cloudy: {label:'阴', temp:20, cloud:.95, rain:0, snow:0, wind:2.6, windDegree:70, light:.85},
  rain: {label:'雨', temp:19, cloud:.96, rain:1, snow:0, wind:4, windDegree:40, light:.8},
  snow: {label:'雪', temp:-1, cloud:.88, rain:0, snow:.7, wind:2.5, windDegree:310, light:.8},
  wind: {label:'风', temp:24, cloud:.30, rain:0, snow:0, wind:10, windDegree:260, light:1},
  night: {label:'夜', temp:18, cloud:.18, rain:0, snow:0, wind:1.4, windDegree:220, light:.13},
};
export function normalizeWeather(value) {
  const wind=clamp(number(value.wind),0,30), direction=number(value.windDegree)*Math.PI/180;
  return {label:String(value.label||'天气'),temp:clamp(number(value.temp,20),-60,60),cloud:clamp(number(value.cloud)),rain:clamp(number(value.rain)),snow:clamp(number(value.snow)),wind,windDegree:number(value.windDegree),windX:-Math.sin(direction)*wind/12,windY:Math.cos(direction)*wind/12,light:clamp(number(value.light,1),.08,1)};
}
export function roundCoordinates(latitude, longitude) {
  const lat=Number(latitude),lon=Number(longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90||lat > 90||lon < -180||lon > 180)throw new Error('位置无效');
  return {lat:Math.round(lat*100)/100,lon:Math.round(lon*100)/100};
}
// Approximate astronomical daylight, not a promise of exact sunrise or sunset.
export function daylightAt(date, lat, lon) {
  const radians=Math.PI/180, day=(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())-Date.UTC(date.getUTCFullYear(),0,0))/86400000;
  const declination=23.44*Math.sin((360/365*(day-81))*radians)*radians;
  const solarHour=date.getUTCHours()+date.getUTCMinutes()/60+lon/15;
  const altitude=Math.asin(Math.sin(lat*radians)*Math.sin(declination)+Math.cos(lat*radians)*Math.cos(declination)*Math.cos((solarHour-12)*15*radians))/radians;
  return .12+.88*clamp((altitude+6)/28);
}
export function fromQWeather(body, {lat=0,lon=0,date=new Date()}={}) {
  if(!body?.condition || !body?.temperature || !body?.wind || !body?.precipitation || !Number.isFinite(body.temperature.value) || !Number.isFinite(body.wind.speed?.value))throw new Error('天气数据格式不完整');
  const code=Number(body.condition.code),kind=body.precipitation.type;
  const amount=clamp(number(body.precipitation.intensity?.value),0,100);
  const intensity=amount>0?clamp(Math.log1p(amount)/Math.log(14),.08,1):0;
  let rain=0,snow=0;
  if(kind==='mixed'){rain=intensity*.55;snow=intensity*.55;}
  else if(kind==='snow'||kind==='ice'){snow=intensity;}
  else if(kind==='rain'){rain=intensity;}
  else if(kind==='unknown' && amount>0){if(code>=400&&code<500)snow=intensity;else rain=intensity;}
  return normalizeWeather({label:body.condition.text,temp:body.temperature.value,cloud:body.cloudCover,rain,snow,wind:body.wind.speed?.value,windDegree:body.wind.direction?.degree,light:daylightAt(date,lat,lon)});
}
export function deviceDaylight(date=new Date()){const hour=date.getHours()+date.getMinutes()/60;return .12+.88*clamp(Math.sin((hour-6)/12*Math.PI)*1.8);}
function demoTarget(name,season){
  const target={...WEATHER_PRESETS[name]};
  if(name==='rain'){
    if(season==='spring')Object.assign(target,{label:'春雨',temp:15,wind:2});
    if(season==='summer')Object.assign(target,{label:'夏雨',temp:25,wind:6});
    if(season==='autumn')Object.assign(target,{label:'秋雨',temp:13,wind:4});
    if(season==='winter')Object.assign(target,{label:'雨夹雪',temp:.3,rain:.55,snow:.5,wind:3});
  }
  return normalizeWeather(target);
}
export class WeatherState {
  constructor(preset='clear') {this.source='demo';this.preset=preset;this.season='default';this.timeMode='auto';this.location=null;this.current=normalizeWeather({...WEATHER_PRESETS[preset],light:deviceDaylight()});this.target={...this.current};}
  setSeason(season){if(this.season===season)return false;this.season=season;if(this.source!=='demo')return false;this.target=demoTarget(this.preset,season);return true;}
  setPreset(name){if(!WEATHER_PRESETS[name])throw new Error('未知演示天气');this.source='demo';this.preset=name;this.target=demoTarget(name,this.season);if(name==='night')this.timeMode='night';}
  setLive(body,location){this.target=fromQWeather(body,location);this.location={lat:location.lat,lon:location.lon,label:location.name||location.label||'所选位置'};this.source='live';this.preset=null;}
  step(seconds,date=new Date(),astronomicalLight=null){this.target.light=this.timeMode==='day'?1:this.timeMode==='night'?.12:Number.isFinite(astronomicalLight)?clamp(astronomicalLight,.12,1):this.location?daylightAt(date,this.location.lat,this.location.lon):deviceDaylight(date);const blend=1-Math.exp(-clamp(seconds,0,.1)/3.5);for(const key of ['temp','cloud','rain','snow','wind','windX','windY','light'])this.current[key]+=(this.target[key]-this.current[key])*blend;this.current.label=this.target.label;return this.current;}
}

export { LotusGrowth } from './lotus-growth.js';
