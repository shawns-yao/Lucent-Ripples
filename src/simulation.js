import { isWater, isOpenWater, shoreDistance, ROCKS, STATIC_PADS } from './pond-surface.js';
import { waterDepth, QUIET_WATER } from './pond-layout.js';
import { seasonProfile } from './season-profile.js';
export const TAU = Math.PI * 2;
export const WORLD = { width: 1672, height: 941 };
// World units/second. Cruise pace is roughly twice the original 22–41 range;
// glides, brief rests and turns still give the pond a relaxed, varied rhythm.
export const FISH_MOTION = Object.freeze({minBaseSpeed:44,maxBaseSpeed:78,maxSpeed:120,acceleration:26,deceleration:34,minRest:1.4,maxRest:3.8});
export function rng(seed = 18) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const wrap = a => Math.atan2(Math.sin(a),Math.cos(a));
const HABITATS=[[1120,340],[1220,620],[790,735],[340,420],[530,680]];
const SCHOOL_SIZES=[3,4,2,3,4,2,3,3];
const SCHOOL_IDS=SCHOOL_SIZES.flatMap((size,group)=>Array(size).fill(group));
export class PondSimulation {
  constructor({count = 44, seed = 1937, width = WORLD.width, height = WORLD.height} = {}) {
    this.width=width; this.height=height; this.random=rng(seed); this.time=0; this.attractors=[]; this.clicks=0;
    const r=this.random;
    this.fish=Array.from({length:count},(_,id)=>{
      const schooling=id<SCHOOL_IDS.length,group=schooling?SCHOOL_IDS[id]:id;
      const c=HABITATS[group%HABITATS.length],a=r()*TAU,d=Math.sqrt(r())*(schooling?55:155);
      const angle=r()*TAU, baseSpeed=FISH_MOTION.minBaseSpeed+r()*(FISH_MOTION.maxBaseSpeed-FISH_MOTION.minBaseSpeed);
      const f={id,active:true,x:clamp(c[0]+Math.cos(a)*d,70,width-70),y:clamp(c[1]+Math.sin(a)*d,60,height-60),angle,vx:0,vy:0,speed:baseSpeed,baseSpeed,length:20+r()*22,phase:r()*TAU,tailPhase:r()*TAU,group,schooling,variant:id%6,depth:r(),sociability:schooling?.85+r()*.4:.12+r()*.15,turnRate:1.2+r()*.9,curiosity:.55+r()*.45,target:null,reactionTime:0,leaveAt:0,turn:0,
        // A private random stream keeps one fish's decisions independent of the
        // others' pauses and of unrelated rendering calls to sim.random().
        motionRandom:rng(Math.floor(r()*4294967296)),motionState:'cruise',paceMultiplier:1,motionUntil:0,nextRestAt:0,restCount:0,wakeCount:0};
      for(let attempt=0;!isWater(f.x,f.y,f.length*.23)&&attempt<40;attempt++){f.x=100+r()*(width-200);f.y=80+r()*(height-160);}
      const initial=f.motionRandom();
      this.setMotion(f,initial<.08?'rest':initial<.30?'glide':initial>.88?'burst':'cruise');
      f.nextRestAt=3+f.motionRandom()*21;
      f.speed=f.motionState==='rest'?0:baseSpeed*f.paceMultiplier;
      f.vx=f.speed===0?0:Math.cos(angle)*f.speed;f.vy=f.speed===0?0:Math.sin(angle)*f.speed;
      f.waterDepth=waterDepth(f.x,f.y,shoreDistance(f.x,f.y).distance);
      f.submergence=f.waterDepth*(.3+f.depth*.4);
      return f;
    });
    this.previous=this.fish.map(()=>({x:0,y:0,vx:0,vy:0,angle:0,group:0}));this.boundaryHint={};
    this.cellSize=180;this.gridColumns=Math.ceil(width/this.cellSize);this.gridRows=Math.ceil(height/this.cellSize);
    this.gridHeads=new Int32Array(this.gridColumns*this.gridRows);this.gridNext=new Int32Array(count);this.neighborChecks=0;
    [...this.fish].sort((a,b)=>(a.id*17)%44-(b.id*17)%44).forEach((f,rank)=>f.seasonRank=rank);
    this.activeFish=this.fish;
  }
  setSeason(season){
    if(this.season===season)return;
    this.season=season;const count=seasonProfile(season).fish;
    for(const f of this.fish){
      f.active=f.seasonRank<count;
      if(!f.active){f.speed=0;f.vx=0;f.vy=0;f.target=null;}
    }
    this.activeFish=this.fish.filter(f=>f.active);
  }
  setMotion(f,state) {
    const r=f.motionRandom;
    f.motionState=state;
    if(state==='rest') {
      f.paceMultiplier=0;f.speed=0;f.vx=0;f.vy=0;f.turn=0;f.restCount++;
      f.motionUntil=this.time+(FISH_MOTION.minRest+r()*(FISH_MOTION.maxRest-FISH_MOTION.minRest))*(this.surface?.seasonWinter?3:1);
    } else if(state==='settling') {
      // Decelerate all the way to zero before starting the rest clock.
      f.paceMultiplier=0;f.motionUntil=null;
    } else if(state==='seeking') {
      f.paceMultiplier=.65;f.motionUntil=this.time+14;
    } else {
      const ranges={cruise:[.94,1.10,4,9],glide:[.44,.66,1.8,3.7],burst:[1.18,1.43,1.2,2.7]};
      const [lo,hi,minTime,maxTime]=ranges[state];
      f.paceMultiplier=lo+r()*(hi-lo);f.motionUntil=this.time+minTime+r()*(maxTime-minTime);
    }
  }
  updateMotion(f,interested) {
    if(interested&&['rest','settling','seeking'].includes(f.motionState)) {
      this.setMotion(f,'cruise');f.nextRestAt=this.time+10+f.motionRandom()*24;f.wakeCount++;
    } else if(f.motionState==='rest') {
      if(this.time>=f.motionUntil) {
        this.setMotion(f,'cruise');f.nextRestAt=this.time+10+f.motionRandom()*24;
      }
    } else if(f.motionState==='seeking') {
      if(Math.hypot(f.x-f.refuge.x,f.y-f.refuge.y)<35)this.setMotion(f,'settling');
      else if(this.time>=f.motionUntil){this.setMotion(f,'cruise');f.nextRestAt=this.time+15;}
    } else if(f.motionState!=='settling') {
      if(!interested&&this.time>=f.nextRestAt){
        f.refuge=null;
        if(this.surface?.seasonWinter){
          f.refuge={x:QUIET_WATER.x+Math.cos(f.phase)*160,y:QUIET_WATER.y+Math.sin(f.phase)*110};
        }else if(!f.schooling&&f.id%3===0){
          let nearest=260;
          for(const [x,y,rx,ry] of STATIC_PADS){
            const angle=Math.atan2(f.y-y,f.x-x),px=x+Math.cos(angle)*(rx+20),py=y+Math.sin(angle)*(ry+20),d=Math.hypot(px-f.x,py-f.y);
            if(d<nearest&&isWater(px,py,12)){nearest=d;f.refuge={x:px,y:py};}
          }
        }
        this.setMotion(f,f.refuge?'seeking':'settling');
      }
      else if(this.time>=f.motionUntil) {
        const choice=f.motionRandom();
        this.setMotion(f,this.surface?.seasonWinter?(choice<.3?'cruise':'glide'):choice<.55?'cruise':choice<.82?'glide':'burst');
      }
    }
  }
  attract(x,y) {
    if(this.surface?(!isWater(x,y,2)||this.surface.surfaceAt(x,y)!=='water'):!isOpenWater(x,y,2))return {selected:0,x,y,accepted:false};
    const point={x,y,created:this.time,id:++this.clicks,life:14};
    this.attractors.push(point); if(this.attractors.length>5) this.attractors.shift();
    const candidates=this.activeFish.map(f=>({f,d:Math.hypot(f.x-x,f.y-y)})).filter(v=>v.d<420).sort((a,b)=>a.d-b.d);
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
    let active=0;for(const a of this.attractors)if(this.time-a.created<a.life)this.attractors[active++]=a;this.attractors.length=active;
    // Take a snapshot before the force pass: order-independent flock behavior.
    const old=this.previous;
    for(let i=0;i<this.fish.length;i++){const f=this.fish[i],p=old[i];p.x=f.x;p.y=f.y;p.vx=f.vx;p.vy=f.vy;p.angle=f.angle;p.group=f.group;}
    this.gridHeads.fill(-1);this.neighborChecks=0;
    for(let i=0;i<old.length;i++){
      if(!this.fish[i].active)continue;
      const p=old[i],cx=clamp(Math.floor(p.x/this.cellSize),0,this.gridColumns-1),cy=clamp(Math.floor(p.y/this.cellSize),0,this.gridRows-1),cell=cy*this.gridColumns+cx;
      this.gridNext[i]=this.gridHeads[cell];this.gridHeads[cell]=i;
    }
    for(let i=0;i<this.fish.length;i++) {
      const f=this.fish[i], p=old[i];
      if(!f.active)continue;
      const boundary=shoreDistance(f.x,f.y,this.boundaryHint);
      f.waterDepth=waterDepth(f.x,f.y,boundary.distance);
      const winter=this.surface?.seasonWinter;
      const submerged=f.waterDepth*(winter?.82+f.depth*.14:.3+f.depth*.4+.08*Math.sin(this.time*.13+f.phase));
      f.submergence+=(submerged-f.submergence)*Math.min(1,dt*.7);
      if(f.target && (this.time>f.leaveAt||this.time-f.target.created>f.target.life||this.surface&&this.surface.surfaceAt(f.target.x,f.target.y)!=='water')) f.target=null;
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
      const cellX=Math.floor(p.x/this.cellSize),cellY=Math.floor(p.y/this.cellSize);
      for(let gy=Math.max(0,cellY-1);gy<=Math.min(this.gridRows-1,cellY+1);gy++)for(let gx=Math.max(0,cellX-1);gx<=Math.min(this.gridColumns-1,cellX+1);gx++)for(let j=this.gridHeads[gy*this.gridColumns+gx];j!==-1;j=this.gridNext[j]) {
        if(i===j) continue;
        this.neighborChecks++;
        const o=old[j], dx=o.x-p.x,dy=o.y-p.y,dist=Math.hypot(dx,dy);
        const separation=(f.length+this.fish[j].length)*.66;
        if(dist>0&&dist<separation) { const strength=(1-dist/separation)*2.7; sx-=dx/dist*strength;sy-=dy/dist*strength; }
        if(f.schooling&&o.group===f.group&&dist>0&&dist<180&&Math.cos(Math.atan2(dy,dx)-f.angle)>-.35) {
          ax+=Math.cos(o.angle);ay+=Math.sin(o.angle);cx+=dx;cy+=dy;neighbors++;
        }
      }
      fx+=sx*2.2;fy+=sy*2.2;
      if(neighbors>0){fx+=ax/neighbors*.76*f.sociability+cx/neighbors*.0038;fy+=ay/neighbors*.76*f.sociability+cy/neighbors*.0038;}
      const warmth=(weather?clamp((weather.temp+2)/22,.35,1):1)*(winter?.65:1);
      let preferred=f.baseSpeed*f.paceMultiplier*(.96+.04*Math.sin(this.time*.6+f.phase))*warmth;
      if(!interested){
        const home=HABITATS[f.group%HABITATS.length],phase=this.time*.085+f.group*2.4;
        const transit=!winter&&f.schooling&&(this.time+f.group*19)%160<13;
        let tx=home[0]+Math.cos(phase)*100,ty=home[1]+Math.sin(phase*.83)*65;
        if(transit){tx=f.group%2?430:980;ty=340+Math.sin(f.group)*65;}
        tx+=Math.cos(f.phase)*48;ty+=Math.sin(f.phase)*36;
        if(winter){tx=QUIET_WATER.x+Math.cos(f.phase)*180;ty=QUIET_WATER.y+Math.sin(f.phase)*120;}
        if(f.motionState==='seeking'){tx=f.refuge.x;ty=f.refuge.y;}
        const dx=tx-f.x,dy=ty-f.y,d=Math.hypot(dx,dy)||1;
        const pull=f.motionState==='seeking'?2.3:Math.min(1.5,d/130)*(f.schooling?1.25:.45);
        fx+=dx/d*pull;fy+=dy/d*pull;
        const qx=(f.x-QUIET_WATER.x)/QUIET_WATER.rx,qy=(f.y-QUIET_WATER.y)/QUIET_WATER.ry,q=qx*qx+qy*qy;
        if(!winter&&!transit&&q<1){fx+=qx*(1-q)*1.8;fy+=qy*(1-q)*1.8;}
      }
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
  snapshot() {return {time:this.time,clicks:this.clicks,attractors:this.attractors.map(a=>({...a})),fish:this.fish.map(f=>({id:f.id,x:f.x,y:f.y,angle:f.angle,vx:f.vx,vy:f.vy,speed:f.speed,baseSpeed:f.baseSpeed,motionState:f.motionState,isResting:f.motionState==='rest',paceMultiplier:f.paceMultiplier,motionUntil:f.motionUntil,nextRestAt:f.nextRestAt,restCount:f.restCount,wakeCount:f.wakeCount,targetId:f.target?.id??null,reactionTime:f.reactionTime,length:f.length,group:f.group,schooling:f.schooling,waterDepth:f.waterDepth,submergence:f.submergence,refuge:f.refuge?{...f.refuge}:null}))};}
}
