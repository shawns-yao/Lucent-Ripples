import { rng } from './simulation.js';
import { isOpenWater } from './pond-surface.js';
export const PRECIPITATION_PARTICLES=Array.from({length:260},(_,id)=>{const r=rng(8475+id*373);return {id,phase:r()*20,size:.65+r()*1.5,speed:.7+r()*.6};});
function landing(p,cycle){const r=rng((p.id+1)*73856093+cycle*19349663);return {x:40+r()*1592,y:20+r()*901};}
export function rainParticle(p,time,weather){
  const duration=1.3+p.speed*.7,clock=time+p.phase,cycle=Math.floor(clock/duration),age=clock-cycle*duration,fall=.46;
  const target=landing(p,cycle),progress=Math.min(age/fall,1),height=1-progress;
  const impactAge=age-fall;
  return {...target,id:p.id,airborne:age<fall,progress,impactAge,created:time-impactAge,size:p.size,
    // Height is projected only a short distance in this near-overhead camera.
    // No particle sweeps sideways/down the entire pond like a surface current.
    airX:target.x+height*weather.windX*3,
    airY:target.y-height*(29+p.size*9),
    length:(3+p.size*2.4)*(.45+height*.55),
    onWater:isOpenWater(target.x,target.y,1)};
}
export function snowParticle(p,time,weather){
  const duration=4.5+p.speed*2.5,clock=time+p.phase,cycle=Math.floor(clock/duration),age=clock-cycle*duration,fall=duration-.6;
  const target=landing(p,cycle),progress=Math.min(age/fall,1),height=1-progress;
  return {...target,id:p.id,airborne:age<fall,progress,size:p.size*(.7+height*1.2),alpha:age<fall?.7:Math.max(0,(duration-age)/.6)*.42,
    airX:target.x+height*weather.windX*5+Math.sin(age*2+p.phase)*height*2,
    airY:target.y-height*65};
}
export function precipitationFrame(time,weather,plants=[]){
  const rain=[],impacts=[],snow=[];
  const count=Math.floor(Math.max(0,Math.min(1,weather.rain))*260);
  for(let i=0;i<count;i++){
    const p=rainParticle(PRECIPITATION_PARTICLES[i],time,weather);
    if(p.airborne)rain.push(p);
    else if(p.onWater&&p.impactAge<1.05&&!plants.some(plant=>plant.age>=0&&Math.hypot(plant.x-p.x,plant.y-p.y)<46))impacts.push(p);
  }
  for(let i=0;i<Math.floor(Math.max(0,Math.min(1,weather.snow))*180);i++)snow.push(snowParticle(PRECIPITATION_PARTICLES[i],time,weather));
  // Stable subset of impacts lives for the whole ring lifetime, rather than
  // replacing each ripple with the newest raindrop on every frame.
  const shaderImpacts=impacts.filter(p=>p.id%17===0).slice(0,16);
  return {rain,impacts,snow,shaderImpacts};
}
