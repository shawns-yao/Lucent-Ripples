import { rng } from './simulation.js';
import { isOpenWater } from './pond-surface.js';
export const RAIN_PARTICLE_LIMIT=720;
export const SNOW_PARTICLE_LIMIT=360;
export const PRECIPITATION_PARTICLES=Array.from({length:RAIN_PARTICLE_LIMIT},(_,id)=>{const r=rng(8475+id*373);return {id,phase:r()*20,size:.65+r()*1.5,speed:.7+r()*.6};});
function landing(p,cycle,out){
  if(out.cycle===cycle)return;
  const r=rng((p.id+1)*73856093+cycle*19349663);
  out.x=40+r()*1592;out.y=20+r()*901;out.cycle=cycle;
}
export function rainParticle(p,time,weather,out={}){
  const duration=1.05+p.speed*.55,clock=time+p.phase,cycle=Math.floor(clock/duration),age=clock-cycle*duration,fall=.4;
  landing(p,cycle,out);const progress=Math.min(age/fall,1),height=1-progress;
  const impactAge=age-fall;
  out.id=p.id;out.airborne=age<fall;out.progress=progress;out.impactAge=impactAge;
  out.created=time-impactAge;out.size=p.size;
  out.airX=out.x+height*weather.windX*5;out.airY=out.y-height*(52+p.size*16);
  out.length=(5+p.size*4)*(.45+height*.55);out.onWater=isOpenWater(out.x,out.y,1);
  return out;
}
export function snowParticle(p,time,weather,out={}){
  const duration=2.8+p.speed*1.4,clock=time+p.phase,cycle=Math.floor(clock/duration),age=clock-cycle*duration,fall=duration-.6;
  landing(p,cycle,out);const progress=Math.min(age/fall,1),height=1-progress;
  out.id=p.id;out.airborne=age<fall;out.progress=progress;out.impactAge=age-fall;
  out.size=p.size*(.7+height*1.2);out.alpha=age<fall?Math.min(.78,age*3):Math.max(0,(duration-age)/.6)*.42;
  out.rotation=p.phase+age*(.5+p.speed*.7);out.roll=Math.cos(age*(1.1+p.speed)+p.phase);
  out.airX=out.x+height*weather.windX*13+Math.sin(age*2+p.phase)*height*5;
  out.airY=out.y-height*80;
  return out;
}
export function createPrecipitationFrame(){
  return {rain:[],impacts:[],snow:[],shaderImpacts:[],rainPool:Array.from({length:RAIN_PARTICLE_LIMIT},()=>({})),snowPool:Array.from({length:SNOW_PARTICLE_LIMIT},()=>({}))};
}
export function precipitationFrame(time,weather,plants=[],frame=null,climate=null,quality=1){
  const rain=frame?.rain||[],impacts=frame?.impacts||[],snow=frame?.snow||[],shaderImpacts=frame?.shaderImpacts||[];
  rain.length=0;impacts.length=0;snow.length=0;shaderImpacts.length=0;
  const count=Math.floor(Math.max(0,Math.min(1,weather.rain))*RAIN_PARTICLE_LIMIT*quality);
  for(let i=0;i<count;i++){
    const p=rainParticle(PRECIPITATION_PARTICLES[i],time,weather,frame?.rainPool[i]);
    if(p.airborne)rain.push(p);
    else if(p.onWater&&p.impactAge<1.05&&(climate?climate.surfaceAt(p.x,p.y)==='water':!plants.some(plant=>plant.age>=0&&Math.hypot(plant.x-p.x,plant.y-p.y)<46))) {
      impacts.push(p);if(p.id%17===0&&shaderImpacts.length<16)shaderImpacts.push(p);
    }
  }
  for(let i=0;i<Math.floor(Math.max(0,Math.min(1,weather.snow))*SNOW_PARTICLE_LIMIT*quality);i++) {
    const p=snowParticle(PRECIPITATION_PARTICLES[i],time,weather,frame?.snowPool[i]);
    p.surface=climate?climate.surfaceAt(p.x,p.y):isOpenWater(p.x,p.y)?'water':'ground';
    snow.push(p);
  }
  return frame||{rain,impacts,snow,shaderImpacts};
}
