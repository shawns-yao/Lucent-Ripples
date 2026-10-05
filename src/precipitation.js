import { rng } from './simulation.js';
import { isOpenWater } from './pond-surface.js';
export const RAIN_PARTICLE_LIMIT=7200;
export const SNOW_PARTICLE_LIMIT=1440;
const RAIN_PROFILES={
  default:{count:1440,height:125,fall:.48,width:1,length:1.2},
  spring:{count:2160,height:100,fall:.55,width:.65,length:.8},
  summer:{count:7200,height:280,fall:.42,width:1.55,length:2.2},
  autumn:{count:3600,height:175,fall:.48,width:1.05,length:1.4},
  winter:{count:1440,height:130,fall:.5,width:.8,length:1},
};
export const PRECIPITATION_PARTICLES=Array.from({length:RAIN_PARTICLE_LIMIT},(_,id)=>{const r=rng(8475+id*373);return {id,phase:r()*20,size:.65+r()*1.5,speed:.7+r()*.6,depth:r()};});
function landing(p,cycle,out){
  if(out.cycle===cycle)return;
  const r=rng((p.id+1)*73856093+cycle*19349663);
  out.x=r()*1672;out.y=r()*941;out.cycle=cycle;out.onWater=isOpenWater(out.x,out.y,1);
}
export function rainParticle(p,time,weather,out={},profile=RAIN_PROFILES.default){
  const fall=profile.fall,duration=fall+1.1+p.speed*.25,clock=time+p.phase,cycle=Math.floor(clock/duration),age=clock-cycle*duration;
  landing(p,cycle,out);const progress=Math.min(age/fall,1),height=1-progress;
  const impactAge=age-fall;
  out.id=p.id;out.airborne=age<fall;out.progress=progress;out.impactAge=impactAge;
  out.created=time-impactAge;out.size=p.size;
  out.airX=out.x+height*weather.windX*profile.height*.7;out.airY=out.y-height*profile.height*(1+p.size*.25);
  out.length=(5+p.size*4)*profile.length*(.55+height*.45);out.width=(.65+p.size*.23)*profile.width;
  out.slant=weather.windX*.16;
  return out;
}
export function snowParticle(p,time,weather,out={}){
  const duration=2.5+p.speed*1.5+p.depth*.6,clock=time+p.phase,cycle=Math.floor(clock/duration),age=clock-cycle*duration,fall=duration-.6;
  landing(p,cycle,out);const progress=Math.min(age/fall,1),height=1-progress;
  out.id=p.id;out.airborne=age<fall;out.progress=progress;out.impactAge=age-fall;
  const near=Math.pow(p.depth,5),opacity=.24+p.depth*.43;
  out.depth=p.depth;out.size=(.32+p.size*.22+near*2.4)*(.8+height*.45);
  out.alpha=age<fall?Math.min(opacity,age*3):Math.max(0,(duration-age)/.6)*opacity*.55;
  out.rotation=p.phase+age*(.5+p.speed*.7);out.roll=Math.cos(age*(1.1+p.speed)+p.phase);
  out.airX=out.x+height*weather.windX*(16+near*36)+Math.sin(age*(1+p.speed)+p.phase)*height*(3+near*7);
  out.airY=out.y-height*(70+p.depth*70);
  return out;
}
export function createPrecipitationFrame(){
  return {rain:[],impacts:[],snow:[],shaderImpacts:[],rainPool:Array.from({length:RAIN_PARTICLE_LIMIT},()=>({})),snowPool:Array.from({length:SNOW_PARTICLE_LIMIT},()=>({}))};
}
export function precipitationFrame(time,weather,plants=[],frame=null,climate=null,quality=1,season='default'){
  const rain=frame?.rain||[],impacts=frame?.impacts||[],snow=frame?.snow||[],shaderImpacts=frame?.shaderImpacts||[];
  rain.length=0;impacts.length=0;snow.length=0;shaderImpacts.length=0;
  const profile=RAIN_PROFILES[season]||RAIN_PROFILES.default;
  const rainBudget=season==='spring'?Math.round(2160+Math.sin(time*.08)*720):profile.count;
  const count=Math.floor(Math.max(0,Math.min(1,weather.rain))*rainBudget*quality);
  const impactStride=Math.max(1,Math.ceil(count/320));
  if(frame){frame.season=season;frame.rainBudget=rainBudget;frame.rainCount=count;}
  for(let i=0;i<count;i++){
    const p=rainParticle(PRECIPITATION_PARTICLES[i],time,weather,frame?.rainPool[i],profile);
    if(p.airborne)rain.push(p);
    else if((p.onWater||climate?.seasonWinter)&&p.impactAge<1.05){
      const ring=p.id%impactStride===0&&impacts.length<240,refract=p.id%37===0&&shaderImpacts.length<16;
      if((ring||refract)&&(climate?climate.surfaceAt(p.x,p.y)==='water':!plants.some(plant=>plant.age>=0&&Math.hypot(plant.x-p.x,plant.y-p.y)<46))){
        if(ring)impacts.push(p);if(refract)shaderImpacts.push(p);
      }
    }
  }
  const snowCount=season==='winter'?Math.floor(Math.max(0,Math.min(1,weather.snow))*SNOW_PARTICLE_LIMIT*quality):0;
  if(frame)frame.snowCount=snowCount;
  for(let i=0;i<snowCount;i++) {
    const p=snowParticle(PRECIPITATION_PARTICLES[i],time,weather,frame?.snowPool[i]);
    p.surface=climate?climate.surfaceAt(p.x,p.y):isOpenWater(p.x,p.y)?'water':'ground';
    snow.push(p);
  }
  return frame||{rain,impacts,snow,shaderImpacts};
}
