import { rng, WORLD } from './simulation.js';
import { isOpenWater } from './pond-surface.js';
export const DAY_MS=86400000;
export const LOTUS_STORAGE_KEY='stillwater.lotus.v1';
export const LOTUS_STAGES=Object.freeze({youngLeaf:1,openLeaf:3,bud:7,halfOpen:10,fullBloom:12});
export const MAX_LOTUS=8;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function browserStorage(){try{return globalThis.localStorage??null;}catch{return null;}}
function freshSeed(){try{const a=new Uint32Array(1);globalThis.crypto.getRandomValues(a);return a[0];}catch{return Math.floor(Math.random()*4294967296);}}
export function lotusStage(age){return age<0?'dormant':age<1?'emerging':age<3?'young-leaf':age<7?'open-leaf':age<10?'bud':age<12?'half-open':'full-bloom';}
export function lotusAppearance(age){
  return {visible:age>=0,leafStage:clamp(age<1?age:1+(age-1)/2,0,2),leafScale:clamp(.16+age/6*.84,.16,1),bloomStage:clamp(age<10?(age-7)/3:1+(age-10)/2,0,2),bloomScale:clamp((age-7)/.8,0,1)};
}
function validStored(raw){
  if(!raw||raw.schema!==1||!Number.isInteger(raw.seed)||!Number.isFinite(raw.createdAt)||!Number.isFinite(raw.lastSeenAt)||!Array.isArray(raw.plants)||raw.plants.length!==MAX_LOTUS)return false;
  return raw.plants.every((p,i)=>p&&typeof p==='object'&&!Array.isArray(p)&&p.id===i&&[p.x,p.y,p.bornAt,p.phase].every(Number.isFinite)&&p.x>0&&p.x<WORLD.width&&p.y>0&&p.y<WORLD.height&&isOpenWater(p.x,p.y,38)&&p.bornAt>=raw.createdAt-20*DAY_MS&&p.bornAt<=raw.createdAt+30*DAY_MS&&raw.plants.slice(0,i).every(o=>Math.hypot(o.x-p.x,o.y-p.y)>=128));
}
function createGarden(seed,now){
  const r=rng(seed),plants=[];
  // Four established plants give a new garden staggered starting stages; the
  // remaining seeds naturally emerge later. All dates/positions are saved once.
  const offsets=[-.35,-3.5,-8,-12.5,3,7,12,18];
  for(let id=0;id<MAX_LOTUS;id++){
    let point=null;
    for(let attempt=0;attempt<20000;attempt++){
      const x=230+r()*1150,y=145+r()*640;
      if(isOpenWater(x,y,38)&&plants.every(p=>Math.hypot(p.x-x,p.y-y)>=128)){point={x,y};break;}
    }
    if(!point)throw new Error('无法找到足够的荷花生长水域');
    plants.push({id,...point,bornAt:now+(offsets[id]+r()*.3)*DAY_MS,phase:r()*Math.PI*2});
  }
  return {schema:1,seed,createdAt:now,lastSeenAt:now,plants};
}
export class LotusGrowth {
  constructor({storage=browserStorage(),now=Date.now,seed}={}){
    this.storage=storage;this.now=now;this.storageAvailable=Boolean(storage);this.lastSavedAt=-Infinity;
    let saved=null;try{saved=JSON.parse(storage?.getItem(LOTUS_STORAGE_KEY)||'null');}catch{this.storageAvailable=false;}
    const time=now();this.state=validStored(saved)?saved:createGarden(seed??freshSeed(),time);
    this.plants=this.state.plants.map(p=>({...p,age:0,stage:'dormant'}));
    this.step(time);this.persist(true);
  }
  // Timestamp based: animation pause, weather presets, low frame rates and
  // closed tabs cannot freeze, accelerate or restart botanical time.
  step(time=this.now()){
    if(!Number.isFinite(time))return;
    this.state.lastSeenAt=Math.max(this.state.lastSeenAt,time);
    this.plants.forEach(p=>{p.age=(this.state.lastSeenAt-p.bornAt)/DAY_MS;p.stage=lotusStage(p.age);});
    this.persist();
  }
  persist(force=false){
    if(!this.storage||(!force&&this.state.lastSeenAt-this.lastSavedAt<60000))return;
    try{this.storage.setItem(LOTUS_STORAGE_KEY,JSON.stringify(this.state));this.lastSavedAt=this.state.lastSeenAt;this.storageAvailable=true;}catch{this.storageAvailable=false;}
  }
  sync(serialized){
    let saved;try{saved=JSON.parse(serialized);}catch{return false;}
    if(!validStored(saved)||saved.createdAt!==this.state.createdAt||saved.seed!==this.state.seed)return false;
    this.state.lastSeenAt=Math.max(this.state.lastSeenAt,saved.lastSeenAt);this.step();return true;
  }
  snapshot(){return this.plants.map(p=>({...p}));}
}
