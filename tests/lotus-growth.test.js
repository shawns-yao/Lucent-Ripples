import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LotusGrowth,DAY_MS,LOTUS_STORAGE_KEY,MAX_LOTUS,lotusStage,lotusAppearance} from '../src/lotus-growth.js';
import {isOpenWater} from '../src/pond-surface.js';
const START=Date.UTC(2026,9,2,12);
function storage(){const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};}
test('random plants stay in suitable water, apart, bounded and stable after refresh',()=>{
 for(let seed=0;seed<80;seed++){
  const store=storage(),g=new LotusGrowth({storage:store,now:()=>START,seed});
  assert.equal(g.plants.length,MAX_LOTUS);
  for(const [i,p] of g.plants.entries()){assert.ok(isOpenWater(p.x,p.y,38));assert.ok(g.plants.slice(0,i).every(o=>Math.hypot(o.x-p.x,o.y-p.y)>=128));}
  const restored=new LotusGrowth({storage:store,now:()=>START,seed:999});assert.deepEqual(restored.snapshot(),g.snapshot());
 }
 const a=new LotusGrowth({storage:storage(),now:()=>START,seed:1}),b=new LotusGrowth({storage:storage(),now:()=>START,seed:2});assert.notDeepEqual(a.plants.map(p=>[p.x,p.y]),b.plants.map(p=>[p.x,p.y]));
});
test('real elapsed timestamps include closed-tab time and have fixed stage boundaries',()=>{
 const store=storage(),g=new LotusGrowth({storage:store,now:()=>START,seed:20}),initial=g.snapshot();
 const reopened=new LotusGrowth({storage:store,now:()=>START+5*DAY_MS});
 for(let i=0;i<MAX_LOTUS;i++)assert.ok(Math.abs(reopened.plants[i].age-initial[i].age-5)<1e-8);
 assert.deepEqual([-1,0,1,3,7,10,12].map(lotusStage),['dormant','emerging','young-leaf','open-leaf','bud','half-open','full-bloom']);
 assert.ok(reopened.plants.filter(p=>p.age>=0).length>g.plants.filter(p=>p.age>=0).length);
});
test('frame updates and weather previews cannot accelerate or reset growth',()=>{
 const g=new LotusGrowth({storage:storage(),now:()=>START,seed:20}),before=g.snapshot();
 for(let i=0;i<10000;i++)g.step(START);
 assert.deepEqual(g.snapshot(),before);assert.equal(g.restartPreview,undefined);assert.equal(g.preview,undefined);
 const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.doesNotMatch(source,/growth-preview|growth-reset/);
});
test('clock rollback never makes existing growth regress, including refresh',()=>{
 const store=storage(),g=new LotusGrowth({storage:store,now:()=>START,seed:20});g.step(START+2*DAY_MS);const before=g.snapshot();g.step(START-DAY_MS);assert.deepEqual(g.snapshot(),before);
 const restored=new LotusGrowth({storage:store,now:()=>START-DAY_MS});assert.deepEqual(restored.snapshot(),before);
});
test('blocked, corrupt and malicious storage recover without preventing scene startup',()=>{
 const blocked={getItem(){throw new Error('denied')},setItem(){throw new Error('denied')}};
 const g=new LotusGrowth({storage:blocked,now:()=>START,seed:9});assert.equal(g.storageAvailable,false);g.step(START+DAY_MS);assert.equal(g.plants.length,MAX_LOTUS);
 const store=storage();store.setItem(LOTUS_STORAGE_KEY,'{"schema":1,"plants":[{"x":"bad"}]}');const recovered=new LotusGrowth({storage:store,now:()=>START,seed:19});assert.equal(recovered.plants.length,MAX_LOTUS);assert.equal(recovered.storageAvailable,true);
});
test('all stage rendering values are finite, dormant plants hidden, population capped for years',()=>{
 const g=new LotusGrowth({storage:storage(),now:()=>START,seed:12});g.step(START+1000*DAY_MS);assert.equal(g.plants.length,8);
 for(const age of [-10,0,.2,1,3,6,7,8,10,12,1000]){const a=lotusAppearance(age);assert.equal(a.visible,age>=0);for(const [key,value]of Object.entries(a)){if(key!=='visible')assert.ok(Number.isFinite(value)&&value>=0&&value<=2);}}
});
test('storage synchronization advances the same garden without moving its plants',()=>{
 const store=storage(),a=new LotusGrowth({storage:store,now:()=>START,seed:17}),b=new LotusGrowth({storage:store,now:()=>START,seed:18});const positions=a.plants.map(p=>[p.x,p.y]);b.step(START+DAY_MS);assert.ok(a.sync(store.getItem(LOTUS_STORAGE_KEY)));assert.deepEqual(a.snapshot(),b.snapshot());assert.deepEqual(a.plants.map(p=>[p.x,p.y]),positions);assert.equal(a.sync('bad'),false);
});

test('valid JSON with malformed plant entries cannot crash scene startup',()=>{
 for(const entry of [null,true,2,'plant',[],{id:0,x:'300',y:400,bornAt:START,phase:1}]){
  const store=storage();store.setItem(LOTUS_STORAGE_KEY,JSON.stringify({schema:1,seed:1,createdAt:START,lastSeenAt:START,plants:Array(8).fill(entry)}));
  const restored=new LotusGrowth({storage:store,now:()=>START,seed:1});assert.equal(restored.plants.length,8);assert.ok(restored.plants.every(p=>Number.isFinite(p.x)));
 }
});
