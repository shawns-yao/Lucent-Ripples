import { isWater, isOpenWater, shoreDistance, ROCKS } from './pond-surface.js';
export const TAU = Math.PI * 2;
export const WORLD = { width: 1672, height: 941 };
// World units/second. Cruise pace is roughly twice the original 22–41 range;
// glides, brief rests and turns still give the pond a relaxed, varied rhythm.
export const FISH_MOTION = Object.freeze({minBaseSpeed:44,maxBaseSpeed:78,maxSpeed:120,acceleration:26,deceleration:34,minRest:1.4,maxRest:3.8});
export function rng(seed = 18) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const wrap = a => Math.atan2(Math.sin(a),Math.cos(a));
export class PondSimulation {
  constructor({count = 44, seed = 1937, width = WORLD.width, height = WORLD.height} = {}) {
    this.width=width; this.height=height; this.random=rng(seed); this.time=0; this.attractors=[]; this.clicks=0;
    const r=this.random;
    const schools=[[.30,.29],[.53,.48],[.75,.72],[.81,.27]];
    this.fish=Array.from({length:count},(_,id)=>{
      const group=id%schools.length, c=schools[group], a=r()*TAU, d=Math.sqrt(r())*170;
      const angle=r()*TAU, baseSpeed=FISH_MOTION.minBaseSpeed+r()*(FISH_MOTION.maxBaseSpeed-FISH_MOTION.minBaseSpeed);
      const f={id,x:clamp(c[0]*width+Math.cos(a)*d,70,width-70),y:clamp(c[1]*height+Math.sin(a)*d,60,height-60),angle,vx:0,vy:0,speed:baseSpeed,baseSpeed,length:20+r()*22,phase:r()*TAU,tailPhase:r()*TAU,group,variant:id%6,depth:r(),sociability:.55+r()*.8,turnRate:1.2+r()*.9,curiosity:.55+r()*.45,target:null,reactionTime:0,leaveAt:0,turn:0,
        // A private random stream keeps one fish's decisions independent of the
        // others' pauses and of unrelated rendering calls to sim.random().
        motionRandom:rng(Math.floor(r()*4294967296)),motionState:'cruise',paceMultiplier:1,motionUntil:0,nextRestAt:0,restCount:0,wakeCount:0};
      for(let attempt=0;!isWater(f.x,f.y,f.length*.23)&&attempt<40;attempt++){f.x=100+r()*(width-200);f.y=80+r()*(height-160);}
      const initial=f.motionRandom();
      this.setMotion(f,initial<.08?'rest':initial<.30?'glide':initial>.88?'burst':'cruise');
      f.nextRestAt=3+f.motionRandom()*21;
      f.speed=f.motionState==='rest'?0:baseSpeed*f.paceMultiplier;
      f.vx=f.speed===0?0:Math.cos(angle)*f.speed;f.vy=f.speed===0?0:Math.sin(angle)*f.speed;
      return f;
    });
    this.previous=this.fish.map(()=>({x:0,y:0,vx:0,vy:0,angle:0,group:0}));this.boundaryHint={};
  }
  setMotion(f,state) {
    const r=f.motionRandom;
    f.motionState=state;
    if(state==='rest') {
      f.paceMultiplier=0;f.speed=0;f.vx=0;f.vy=0;f.turn=0;f.restCount++;
      f.motionUntil=this.time+FISH_MOTION.minRest+r()*(FISH_MOTION.maxRest-FISH_MOTION.minRest);
    } else if(state==='settling') {
      // Decelerate all the way to zero before starting the rest clock.
      f.paceMultiplier=0;f.motionUntil=null;
    } else {
      const ranges={cruise:[.94,1.10,4,9],glide:[.44,.66,1.8,3.7],burst:[1.18,1.43,1.2,2.7]};
      const [lo,hi,minTime,maxTime]=ranges[state];
      f.paceMultiplier=lo+r()*(hi-lo);f.motionUntil=this.time+minTime+r()*(maxTime-minTime);
    }
  }
  updateMotion(f,interested) {
    if(interested&&(f.motionState==='rest'||f.motionState==='settling')) {
      this.setMotion(f,'cruise');f.nextRestAt=this.time+10+f.motionRandom()*24;f.wakeCount++;
    } else if(f.motionState==='rest') {
      if(this.time>=f.motionUntil) {
        this.setMotion(f,'cruise');f.nextRestAt=this.time+10+f.motionRandom()*24;
      }
    } else if(f.motionState!=='settling') {
      if(!interested&&this.time>=f.nextRestAt)this.setMotion(f,'settling');
      else if(this.time>=f.motionUntil) {
        const choice=f.motionRandom();
        this.setMotion(f,choice<.55?'cruise':choice<.82?'glide':'burst');
      }
    }
  }
  attract(x,y) {
    if(!isOpenWater(x,y,2)||this.surface?.surfaceAt(x,y)!=='water'&&this.surface)return {selected:0,x,y,accepted:false};
    const point={x,y,created:this.time,id:++this.clicks,life:14};
    this.attractors.push(point); if(this.attractors.length>5) this.attractors.shift();
    const candidates=this.fish.map(f=>({f,d:Math.hypot(f.x-x,f.y-y)})).filter(v=>v.d<420).sort((a,b)=>a.d-b.d);
    let selected=0;
    for(const {f,d} of candidates) {
      if(selected>=16) break;
      if(this.random()>.97-(d/420)*.12) continue;
      f.target=point; f.reactionTime=this.time+.15+this.random()*1.25+d/1100;
      f.leaveAt=this.time+8+this.random()*6; f.feedOffset=this.random()*TAU;
      selected++;
    }
    return {id:point.id,selected,x,y,accepted:true};
  }
  step(delta,weather=null) {
    const dt=Number.isFinite(delta)?clamp(delta,0,1/20):0;
    if(dt===0)return;
    this.time+=dt;
    this.attractors=this.attractors.filter(a=>this.time-a.created<a.life);
    // Take a snapshot before the force pass: order-independent flock behavior.
    const old=this.previous;
    for(let i=0;i<this.fish.length;i++){const f=this.fish[i],p=old[i];p.x=f.x;p.y=f.y;p.vx=f.vx;p.vy=f.vy;p.angle=f.angle;p.group=f.group;}
    for(let i=0;i<this.fish.length;i++) {
      const f=this.fish[i], p=old[i];
      if(f.target && (this.time>f.leaveAt||this.time-f.target.created>f.target.life)) f.target=null;
      const interested=Boolean(f.target&&this.time>=f.reactionTime);
      this.updateMotion(f,interested);
      if(f.motionState==='rest') {
        // Rest means no displacement or rotation, not merely a very slow swim.
        // Keep a gentle independent fin clock for the renderer.
        f.speed=0;f.vx=0;f.vy=0;f.turn=0;f.tailPhase+=dt*1.6;
        continue;
      }
      const wander=f.angle+Math.sin(this.time*.39+f.phase)*.75+Math.sin(this.time*.13+f.phase*2)*.4;
      let fx=Math.cos(wander)*.78, fy=Math.sin(wander)*.78;
      let sx=0,sy=0,ax=0,ay=0,cx=0,cy=0,neighbors=0;
      for(let j=0;j<old.length;j++) {
        if(i===j) continue;
        const o=old[j], dx=o.x-p.x,dy=o.y-p.y,dist=Math.hypot(dx,dy);
        const separation=(f.length+this.fish[j].length)*.66;
        if(dist>0&&dist<separation) { const strength=(1-dist/separation)*2.7; sx-=dx/dist*strength;sy-=dy/dist*strength; }
        if(dist>0&&dist<132&&Math.cos(Math.atan2(dy,dx)-f.angle)>-.35) {
          const affinity=o.group===f.group?1:.35; ax+=Math.cos(o.angle)*affinity;ay+=Math.sin(o.angle)*affinity;cx+=dx*affinity;cy+=dy*affinity;neighbors+=affinity;
        }
      }
      fx+=sx*2.2;fy+=sy*2.2;
      if(neighbors>0){fx+=ax/neighbors*.76*f.sociability+cx/neighbors*.0038;fy+=ay/neighbors*.76*f.sociability+cy/neighbors*.0038;}
      const warmth=weather?clamp((weather.temp+2)/22,.35,1):1;
      let preferred=f.baseSpeed*f.paceMultiplier*(.96+.04*Math.sin(this.time*.6+f.phase))*warmth;
      if(interested) {
        // Independent offset and arrival steering prevent a single rotating knot.
        const age=this.time-f.target.created, spread=12+10*Math.sin(f.phase+this.time*.4);
        const dx=f.target.x+Math.cos(f.feedOffset)*spread-f.x,dy=f.target.y+Math.sin(f.feedOffset)*spread-f.y,d=Math.hypot(dx,dy);
        const interest=clamp((f.leaveAt-this.time)/2.5,0,1);
        if(d>16){fx+=dx/Math.max(d,1)*2.8*interest;fy+=dy/Math.max(d,1)*2.8*interest;}
        preferred=f.baseSpeed*clamp(d/95,.20,1.35)*warmth;
        if(age>4&&d<25) {fx+=Math.cos(f.angle+Math.sin(this.time+f.phase))*.4;fy+=Math.sin(f.angle+Math.sin(this.time+f.phase))*.4;}
      }
      // Continuous soft wall force, followed by a hard safety boundary.
      const margin=95;
      if(f.x<margin)fx+=(margin-f.x)/margin*5;
      if(f.x>this.width-margin)fx-=(f.x-this.width+margin)/margin*5;
      if(f.y<margin)fy+=(margin-f.y)/margin*5;
      if(f.y>this.height-margin)fy-=(f.y-this.height+margin)/margin*5;
      const boundary=shoreDistance(f.x,f.y,this.boundaryHint);
      if(boundary.distance<65){const strength=(65-boundary.distance)/22;fx+=boundary.nx*strength;fy+=boundary.ny*strength;}
      for(const [rx,ry,rw,rh] of ROCKS) {
        const dx=f.x-rx,dy=f.y-ry,ellipse=(dx/(rw+28))**2+(dy/(rh+28))**2;
        if(ellipse<1.7){const d=Math.hypot(dx,dy)||1,strength=(1.7-ellipse)*4;fx+=dx/d*strength;fy+=dy/d*strength;}
      }
      const desired=Math.atan2(fy,fx), diff=wrap(desired-f.angle);
      const turn=clamp(diff,-f.turnRate*dt,f.turnRate*dt);
      f.angle=wrap(f.angle+turn); f.turn+=(turn/Math.max(dt,.00001)-f.turn)*Math.min(1,dt*4);
      // Real acceleration and heading limits rather than immediate position interpolation.
      preferred*=1-.23*Math.min(1,Math.abs(diff)/Math.PI);
      f.speed+=clamp(preferred-f.speed,-FISH_MOTION.deceleration*dt,FISH_MOTION.acceleration*dt);
      f.speed=clamp(f.speed,0,FISH_MOTION.maxSpeed);
      if(f.motionState==='settling'&&f.speed===0){this.setMotion(f,'rest');f.tailPhase+=dt*1.6;continue;}
      f.vx=Math.cos(f.angle)*f.speed;f.vy=Math.sin(f.angle)*f.speed;
      f.x=clamp(f.x+f.vx*dt,18,this.width-18);f.y=clamp(f.y+f.vy*dt,18,this.height-18);
      if(!isWater(f.x,f.y,f.length*.23)){f.x=p.x;f.y=p.y;f.angle=wrap(f.angle+f.turnRate*dt);}
      f.tailPhase+=dt*(4.0+f.speed*.08);
    }
  }
  snapshot() {return {time:this.time,clicks:this.clicks,attractors:this.attractors.map(a=>({...a})),fish:this.fish.map(f=>({id:f.id,x:f.x,y:f.y,angle:f.angle,vx:f.vx,vy:f.vy,speed:f.speed,baseSpeed:f.baseSpeed,motionState:f.motionState,isResting:f.motionState==='rest',paceMultiplier:f.paceMultiplier,motionUntil:f.motionUntil,nextRestAt:f.nextRestAt,restCount:f.restCount,wakeCount:f.wakeCount,targetId:f.target?.id??null,reactionTime:f.reactionTime,length:f.length}))};}
}
