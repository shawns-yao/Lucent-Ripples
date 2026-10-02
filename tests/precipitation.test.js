import test from 'node:test';
import assert from 'node:assert/strict';
import {Container,Texture,TextureSource} from 'pixi.js';
import {PRECIPITATION_PARTICLES,rainParticle,snowParticle,precipitationFrame} from '../src/precipitation.js';
import {WeatherEffects,LotusVisuals} from '../src/weather-effects.js';
import {LotusGrowth} from '../src/lotus-growth.js';
import {isOpenWater} from '../src/pond-surface.js';
const wet={rain:.9,snow:.7,wind:4,windX:.3,windY:.2};
test('rain descends through a short height toward its own fixed landing point',()=>{
 for(const p of PRECIPITATION_PARTICLES){
  const duration=1.3+p.speed*.7,t=Math.ceil(p.phase/duration)*duration-p.phase+.05;
  const a=rainParticle(p,t,wet),b=rainParticle(p,t+.3,wet),hit=rainParticle(p,t+.42,wet);
  assert.equal(a.x,b.x);assert.equal(a.y,b.y);assert.ok(a.airY<b.airY);assert.ok(Math.abs(a.airY-a.y)<50);assert.ok(Math.abs(a.airX-a.x)<3);
  assert.equal(hit.airborne,false);assert.equal(hit.airX,hit.x);assert.equal(hit.airY,hit.y);assert.ok(hit.impactAge>=0);
 }
});
test('snow is a height-based approach, not a horizontal or full-screen rain conveyor',()=>{
 const p=PRECIPITATION_PARTICLES[12],d=4.5+p.speed*2.5,t=Math.ceil(p.phase/d)*d-p.phase+.1;
 const a=snowParticle(p,t,wet),b=snowParticle(p,t+1,wet);assert.equal(a.x,b.x);assert.equal(a.y,b.y);assert.ok(a.airY<b.airY);assert.ok(a.size>b.size);assert.ok(Math.abs(a.airX-a.x)<7);assert.ok(Math.abs(a.airY-a.y)<65);
});
test('impacts are synchronized with rain contact, on open water, and ripple counts stay bounded',()=>{
 let observed=0;
 for(let time=0;time<40;time+=.13){const frame=precipitationFrame(time,wet);assert.ok(frame.rain.length+frame.impacts.length<=260);assert.ok(frame.snow.length<=180);assert.ok(frame.shaderImpacts.length<=16);
  for(const p of frame.impacts){assert.equal(p.airborne,false);assert.ok(p.impactAge>=0&&p.impactAge<1.05);assert.ok(isOpenWater(p.x,p.y,1));assert.ok(Math.abs(time-p.created-p.impactAge)<1e-8);observed++;}
 }
 assert.ok(observed>1000);assert.deepEqual(precipitationFrame(12,{...wet,rain:0,snow:0}),{rain:[],impacts:[],snow:[],shaderImpacts:[]});
});
test('new lotus leaves occlude rain ripples and a stable seed gives stable frame samples',()=>{
 const frame=precipitationFrame(12,wet),p=frame.impacts[0];assert.ok(p);
 const blocked=precipitationFrame(12,wet,[{x:p.x,y:p.y,age:4}]);assert.ok(!blocked.impacts.some(i=>i.id===p.id));assert.deepEqual(frame,precipitationFrame(12,wet));
});
test('Pixi weather and lotus layers update safely through weather, crop and stage transitions',()=>{
 const stage=new Container(),effects=new WeatherEffects(stage),source=new TextureSource({width:1536,height:1024}),atlas=new Texture({source}),growth=new LotusGrowth({storage:null,seed:4,now:()=>1780000000000}),lotus=new LotusVisuals(stage,atlas,growth);
 for(const view of [{scaleX:1,scaleY:.9,x:0,y:0},{scaleX:.92,scaleY:.83,x:-580,y:0}])for(const time of [0,1,17,250]){const frame=effects.update(time,wet,view,growth.plants);lotus.update(time,wet);assert.ok(frame.shaderImpacts.length<=16);for(const plant of lotus.plants)assert.ok(Number.isFinite(plant.group.x+plant.group.y));}
 assert.equal(lotus.plants.length,8);assert.equal(lotus.plants.filter(v=>v.group.visible).length,4);stage.destroy({children:true});atlas.destroy(true);
});
