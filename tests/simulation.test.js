import test from 'node:test';
import assert from 'node:assert/strict';
import {PondSimulation,WORLD,FISH_MOTION} from '../src/simulation.js';
import {WeatherState} from '../src/weather.js';

const stepFor=(sim,seconds)=>{for(let i=0;i<Math.round(seconds*60);i++)sim.step(1/60);};

test('44 independently seeded fish remain finite, in bounds, with limited speed and turning',()=>{
 const sim=new PondSimulation();assert.equal(sim.fish.length,44);
 for(let i=0;i<60*120;i++){
  const old=sim.fish.map(f=>({angle:f.angle,speed:f.speed}));sim.step(1/60);
  for(let j=0;j<sim.fish.length;j++){
   const f=sim.fish[j];
   assert.ok(Number.isFinite(f.x+f.y+f.angle+f.speed));
   assert.ok(f.x>=18&&f.x<=WORLD.width-18);assert.ok(f.y>=18&&f.y<=WORLD.height-18);
   assert.ok(f.speed>=0&&f.speed<=FISH_MOTION.maxSpeed);
   assert.ok(Math.abs(Math.atan2(Math.sin(f.angle-old[j].angle),Math.cos(f.angle-old[j].angle)))<=f.turnRate/60+1e-6);
   assert.ok(f.speed-old[j].speed<=FISH_MOTION.acceleration/60+1e-6);
   assert.ok(old[j].speed-f.speed<=FISH_MOTION.deceleration/60+1e-6);
  }
 }
});

test('click attracts nearby fish with independent reaction times, then releases them',()=>{
 const sim=new PondSimulation();const {selected,id}=sim.attract(820,460);assert.ok(selected>2&&selected<=16);
 const selectedFish=sim.fish.filter(f=>f.target?.id===id);const before=selectedFish.reduce((s,f)=>s+Math.hypot(f.x-820,f.y-460),0)/selected;
 assert.ok(new Set(selectedFish.map(f=>f.reactionTime)).size>2);
 stepFor(sim,8);
 const after=selectedFish.reduce((s,f)=>s+Math.hypot(f.x-820,f.y-460),0)/selected;
 assert.ok(after<before*.78,`Expected attraction: before=${before}, after=${after}`);
 stepFor(sim,8);assert.equal(sim.attractors.length,0);assert.equal(sim.fish.filter(f=>f.target).length,0);
});

test('repeated clicks and long-frame recovery stay bounded',()=>{
 const sim=new PondSimulation();for(let i=0;i<100;i++){sim.attract(i*20,i*10);sim.step(3);}
 assert.ok(sim.attractors.length<=5);assert.ok(sim.time<6);assert.ok(sim.fish.every(f=>Number.isFinite(f.x+f.y)));
 const before=sim.snapshot();for(const dt of [0,-1,NaN,Infinity,-Infinity])sim.step(dt);assert.deepEqual(sim.snapshot(),before);
});

test('same seed and inputs reproduce full motion state through rests, wakes and resumed swimming',()=>{
 const a=new PondSimulation(),b=new PondSimulation();
 for(let i=0;i<60*60;i++){
  if(i%480===0){a.attract(500+i%600,500);b.attract(500+i%600,500);}
  a.step(1/60);b.step(1/60);
 }
 assert.deepEqual(a.snapshot(),b.snapshot());
 assert.ok(a.fish.some(f=>f.restCount>1));
});

test('fish sustain distinct faster paces with independently changing bursts and glides',()=>{
 const sim=new PondSimulation(),totals=sim.fish.map(()=>0),states=new Set();
 let total=0,restFrames=0,maxResting=0,maxSpeed=0;
 for(let i=0;i<60*120;i++){
  sim.step(1/60);let resting=0;
  for(const f of sim.fish){
   assert.ok(f.baseSpeed>=44&&f.baseSpeed<=78);
   totals[f.id]+=f.speed;total+=f.speed;states.add(f.motionState);maxSpeed=Math.max(maxSpeed,f.speed);
   if(f.motionState==='rest')resting++;
  }
  restFrames+=resting;maxResting=Math.max(maxResting,resting);
 }
 const mean=total/(120*60*44),means=totals.map(n=>n/(120*60));
 // The default seed averages ~47 units/s INCLUDING full stops, compared with
 // the original default-seed ~27.3 units/s (~1.72x overall). Cruise bases are
 // 44–78, and observed bursts reach ~103.
 assert.ok(mean>43&&mean<56,`Mean pace including rests: ${mean}`);
 assert.ok(Math.max(...means)-Math.min(...means)>20,'individual long-run paces remain visibly different');
 assert.ok(maxSpeed>85&&maxSpeed<=FISH_MOTION.maxSpeed,'some fish visibly burst above cruise pace');
 assert.deepEqual(states,new Set(['cruise','glide','burst','settling','rest']));
 assert.ok(restFrames/(120*60*44)>.04&&restFrames/(120*60*44)<.16,'rests are occasional');
 assert.ok(maxResting<22,'there is never a synchronized whole-school stop');
 assert.ok(new Set(sim.fish.map(f=>f.nextRestAt)).size===44,'each fish owns its rest schedule');
});

test('every fish independently rests truly still and autonomously resumes',()=>{
 for(const seed of [1937,42,918]){
  const sim=new PondSimulation({seed}),rested=new Set(),resumed=new Set();
  const episodes=new Map();let simultaneousRestAndSwimming=false;
  for(let i=0;i<60*90;i++){
   const old=sim.snapshot().fish;sim.step(1/60);
   let resting=0,swimming=0;
   for(const f of sim.fish){
    const before=old[f.id];
    if(f.motionState==='rest'){
     resting++;rested.add(f.id);
     assert.equal(f.speed,0);assert.equal(f.vx,0);assert.equal(f.vy,0);
     if(before.isResting){assert.equal(f.x,before.x);assert.equal(f.y,before.y);assert.equal(f.angle,before.angle);}
     else episodes.set(f.id,{start:sim.time,end:f.motionUntil});
     assert.ok(f.motionUntil>=sim.time);
    }else if(f.speed>1){swimming++;if(rested.has(f.id))resumed.add(f.id);}
    if(before.isResting&&f.motionState!=='rest'&&episodes.has(f.id)){
     const {start,end}=episodes.get(f.id);
     assert.ok(end-start>=FISH_MOTION.minRest-1/60&&end-start<=FISH_MOTION.maxRest);
     assert.ok(sim.time>=end&&sim.time<end+1/60+1e-6);
    }
   }
   if(resting>0&&swimming>20)simultaneousRestAndSwimming=true;
  }
  assert.equal(rested.size,44,`all fish get a turn to rest, seed ${seed}`);
  assert.equal(resumed.size,44,`all fish resume by themselves, seed ${seed}`);
  assert.ok(simultaneousRestAndSwimming,'resting fish coexist with moving fish');
 }
});

test('a nearby interested resting fish wakes after its own click reaction delay; distant fish remain resting',()=>{
 const sim=new PondSimulation({count:2});const [near,far]=sim.fish;
 near.x=220;near.y=260;far.x=1450;far.y=760;
 for(const f of sim.fish){sim.setMotion(f,'rest');f.motionUntil=sim.time+3;}
 sim.random=()=>0; // Make this isolated interest-selection assertion deterministic.
 const {selected}=sim.attract(250,260);assert.equal(selected,1);
 assert.ok(near.reactionTime>sim.time);assert.equal(near.motionState,'rest');
 while(sim.time+1/60<near.reactionTime){sim.step(1/60);assert.equal(near.speed,0);assert.equal(near.x,220);}
 sim.step(1/60);
 assert.equal(near.motionState,'cruise');assert.ok(near.speed>0);assert.equal(near.wakeCount,1);
 assert.equal(far.motionState,'rest');assert.equal(far.speed,0);assert.equal(far.wakeCount,0);
 assert.equal(far.x,1450);assert.equal(far.y,760);
});

test('daylight and night changes do not gate or synchronize independent fish rest schedules',()=>{
 const dayFish=new PondSimulation(),nightFish=new PondSimulation();
 const day=new WeatherState('clear'),night=new WeatherState('night');day.timeMode='day';night.timeMode='night';
 const dayRested=new Set(),nightRested=new Set();
 for(let i=0;i<60*40;i++){
  day.step(1/60);night.step(1/60);dayFish.step(1/60);nightFish.step(1/60);
  for(const f of dayFish.fish)if(f.motionState==='rest')dayRested.add(f.id);
  for(const f of nightFish.fish)if(f.motionState==='rest')nightRested.add(f.id);
  if(i%60===0)assert.deepEqual(dayFish.snapshot(),nightFish.snapshot());
 }
 assert.ok(day.current.light>.95&&night.current.light<.15);
 assert.equal(dayRested.size,44);assert.deepEqual(dayRested,nightRested);
 // Switching a presentation setting does not reset the behavioral clock.
 const before=nightFish.snapshot();night.timeMode='day';night.setPreset('clear');assert.deepEqual(nightFish.snapshot(),before);
});

test('rendering random draws cannot alter the private fish behavior schedules',()=>{
 const a=new PondSimulation(),b=new PondSimulation();
 for(let i=0;i<60*35;i++){
  for(let j=0;j<5;j++)b.random();
  a.step(1/60);b.step(1/60);
 }
 assert.deepEqual(a.snapshot(),b.snapshot());
});
