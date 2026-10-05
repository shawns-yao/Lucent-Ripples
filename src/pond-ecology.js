import { Container, Sprite, Graphics, MeshSimple } from 'pixi.js';
import { rng } from './simulation.js';
import { isWater } from './pond-surface.js';
import { ecologyArt } from './ecology-art.js';

const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),TAU=Math.PI*2;
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const SHRIMP_HOMES=[[325,633],[418,704],[1264,381],[1393,430],[1327,620],[355,390],[1215,735],[1320,425]];

export class PondEcology {
  constructor({world,fishLayer,shoreWorld,climate,flowers,canopy,style='natural'}){
    this.climate=climate;this.flowers=flowers;this.canopy=canopy;this.random=rng(581903);this.lastTime=0;
    this.bottom=new Container();this.bottom.label='shallow-shrimp';world.addChildAt(this.bottom,world.getChildIndex(fishLayer));
    this.surface=new Container();this.surface.label='surface-ecology';world.addChild(this.surface);
    this.air=new Container();this.air.label='dragonflies';shoreWorld.addChild(this.air);
    for(const layer of [this.bottom,this.surface,this.air])layer.eventMode='none';
    this.setStyle(style);
    this.shrimp=SHRIMP_HOMES.map(([x,y],id)=>{
      const vertices=new Float32Array(24),uvs=new Float32Array(24),indices=[];
      for(let j=0;j<6;j++)for(let side=0;side<2;side++){const k=(j*2+side)*2;vertices[k]=(j/5-.5)*22;vertices[k+1]=(side-.5)*11;uvs[k]=j/5;uvs[k+1]=side;}
      for(let j=0;j<5;j++){const n=j*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
      const sprite=new MeshSimple({texture:this.art.shrimp,vertices,uvs,indices:new Uint32Array(indices)});this.bottom.addChild(sprite);
      return {id,x,y,homeX:x,homeY:y,targetX:x,targetY:y,heading:this.random()*TAU,state:'rest',until:1+id*.9,phase:this.random()*TAU,sprite,base:vertices.slice(),darts:0};
    });
    this.petals=Array.from({length:6},(_,id)=>{
      const sprite=new Sprite(this.art.petal);sprite.anchor.set(.5);sprite.width=3.5+id%3;sprite.height=6+id%3;sprite.visible=false;this.surface.addChild(sprite);
      return {id,sprite,x:0,y:0,born:-100,life:32,active:false,phase:id*1.8};
    });
    this.nextPetal=2;this.petalCursor=0;
    this.dragonflies=[[470,605],[1220,510],[1090,760]].map(([x,y],id)=>{
      const shadow=new Graphics().ellipse(0,0,7,2).fill(0x253d32),group=new Container();this.air.addChild(shadow,group);
      const wings=Array.from({length:4},(_,j)=>{const s=new Sprite(j<2?this.art.wing:this.art.hindwing);s.anchor.set(.05,.5);s.x=j<2?7:4;s.y=j%2?-1:1;group.addChild(s);return s;});
      const body=new Sprite(this.art.dragon);body.anchor.set(.5);body.width=32;body.height=10.67;group.addChild(body);
      return {id,x,y,homeX:x,homeY:y,heading:this.random()*TAU,height:26,targetX:x+65,targetY:y-35,state:'flight',until:2+id*2,phase:id*2.8,group,body,wings,shadow};
    });
  }
  setStyle(style){
    this.style=style;this.art=ecologyArt(style);
    for(const s of this.shrimp||[])s.sprite.texture=this.art.shrimp;
    for(const p of this.petals||[])p.sprite.texture=p.kind==='leaf'?this.art.autumnLeaf:this.art.petal;
    for(const d of this.dragonflies||[]){d.body.texture=this.art.dragon;for(let j=0;j<4;j++)d.wings[j].texture=j<2?this.art.wing:this.art.hindwing;}
  }
  water(x,y){return this.climate.surfaceAt(x,y)==='water';}
  chooseLocalTarget(a,radius,surface){
    for(let i=0;i<12;i++){
      const angle=this.random()*TAU,d=18+this.random()*radius,x=a.homeX+Math.cos(angle)*d,y=a.homeY+Math.sin(angle)*d;
      if(surface?this.water(x,y):isWater(x,y,8)){a.targetX=x;a.targetY=y;return true;}
    }
    return false;
  }
  move(a,speed,dt,surface){
    const dx=a.targetX-a.x,dy=a.targetY-a.y,d=Math.hypot(dx,dy);
    a.heading+=angleDelta(Math.atan2(dy,dx),a.heading)*Math.min(1,dt*6);
    const step=Math.min(d,speed*dt),x=a.x+Math.cos(a.heading)*step,y=a.y+Math.sin(a.heading)*step;
    const valid=surface?(this.water(a.x,a.y)?this.water(x,y):isWater(x,y,5)):isWater(x,y,5);
    if(valid){a.x=x;a.y=y;return d<3;}
    return true;
  }
  chooseFlightTarget(d,time){
    d.until=time+2+this.random()*3;
    for(let i=0;i<12;i++){
      const a=this.random()*TAU,r=50+this.random()*100,x=d.homeX+Math.cos(a)*r,y=d.homeY+Math.sin(a)*r;
      if(isWater(x,y)&&Math.hypot(x-d.x,y-d.y)>65&&!this.canopy(x,y,25)){d.targetX=x;d.targetY=y;break;}
    }
  }
  update(time,weather,season,fish){
    const dt=clamp(time-this.lastTime,0,.1);this.lastTime=time;
    const cold=season==='winter'||this.climate.winter,calm=clamp(1-weather.rain*1.8-weather.snow*2)*clamp(1-(weather.wind-5)/8);
    const day=cold||season==='autumn'?0:clamp((weather.light-.28)/.45)*calm;
    if(this.season!==season){for(const p of this.petals){p.active=false;p.sprite.visible=false;}this.nextPetal=time+1;}
    this.activeDay=day;this.season=season;
    for(const s of this.shrimp){
      s.sprite.visible=!cold;
      if(!cold&&dt>0){
        if(time>=s.until){s.state=s.state==='rest'?'crawl':'rest';s.until=time+(s.state==='rest'?2+this.random()*6:2+this.random()*4);if(s.state==='crawl')this.chooseLocalTarget(s,48,false);}
        if(s.state!=='dart')for(const f of fish)if(f.speed>30&&Math.hypot(f.x-s.x,f.y-s.y)<22){
          const a=Math.atan2(s.y-f.y,s.x-f.x),x=s.x+Math.cos(a)*24,y=s.y+Math.sin(a)*24;
          if(isWater(x,y,8)&&Math.hypot(x-s.homeX,y-s.homeY)<75){s.targetX=x;s.targetY=y;s.state='dart';s.until=time+.45;s.darts++;}break;
        }
        if(s.state!=='rest'&&this.move(s,s.state==='dart'?55:5,dt,false)){s.state='rest';s.until=time+2+this.random()*4;}
      }
      s.sprite.position.set(s.x,s.y);s.sprite.rotation=s.heading;s.sprite.alpha=this.style==='cartoon'?.78:.65;
      const v=s.sprite.vertices,activity=s.state==='rest'?.16:s.state==='dart'?1:.4;
      for(let j=0;j<6;j++)for(let side=0;side<2;side++){const k=(j*2+side)*2;v[k+1]=s.base[k+1]+Math.sin(time*8+s.phase+j)*Math.pow(1-j/5,2)*activity*2.2;}
    }
    if(cold){for(const p of this.petals){p.active=false;p.sprite.visible=false;}this.nextPetal=time+3;}
    else if(time>=this.nextPetal&&dt>0){
      this.nextPetal=time+6+this.random()*4;
      let f=null,available=0;
      if(season==='autumn'){
        const sites=[[320,360],[1370,345],[1280,755]],site=sites[Math.floor(this.random()*sites.length)];f={x:site[0],y:site[1]};
      }else for(const flower of this.flowers)if(flower.available&&this.random()<1/++available)f=flower;
      for(let i=0;f&&i<6;i++){
        const a=this.random()*TAU,x=f.x-12+Math.cos(a)*47,y=f.y+Math.sin(a)*47;if(!this.water(x,y))continue;
        const p=this.petals[this.petalCursor++%this.petals.length];p.x=x;p.y=y;p.born=time;p.life=30+this.random()*14;p.active=true;
        p.kind=season==='autumn'?'leaf':'petal';p.sprite.texture=p.kind==='leaf'?this.art.autumnLeaf:this.art.petal;
        p.sprite.width=p.kind==='leaf'?8+p.id%3:3.5+p.id%3;p.sprite.height=p.kind==='leaf'?13+p.id%3:6+p.id%3;break;
      }
    }
    for(const p of this.petals){
      if(!p.active)continue;
      const age=time-p.born;if(age>p.life||!this.water(p.x,p.y)){p.active=false;p.sprite.visible=false;continue;}
      const dx=(weather.windX*1.5+Math.sin(time*.25+p.phase)*.35)*dt,dy=(weather.windY*1.5+.2)*dt;
      if(this.water(p.x+dx,p.y+dy)){p.x+=dx;p.y+=dy;}
      p.sprite.position.set(p.x,p.y);p.sprite.rotation=p.phase+Math.sin(time*.23+p.phase)*.3;
      p.sprite.alpha=clamp(age/3)*clamp((p.life-age)/5)*.65;p.sprite.visible=true;
    }
    for(const d of this.dragonflies){
      d.group.visible=d.shadow.visible=day>.02;d.group.alpha=day;
      if(!d.group.visible)continue;
      if(day>.02&&dt>0){
        if(time>=d.until||Math.hypot(d.targetX-d.x,d.targetY-d.y)<24)this.chooseFlightTarget(d,time);
        const dx=d.targetX-d.x,dy=d.targetY-d.y,distance=Math.hypot(dx,dy);
        d.heading+=angleDelta(Math.atan2(dy,dx),d.heading)*Math.min(1,dt*4.5);
        const speed=Math.min(distance*2,90+Math.sin(time*1.7+d.phase)*30),x=d.x+Math.cos(d.heading)*speed*dt,y=d.y+Math.sin(d.heading)*speed*dt;
        if(isWater(x,y)&&!this.canopy(x,y,18)){d.x=x;d.y=y;}else this.chooseFlightTarget(d,time);
        const height=29+Math.sin(time*1.8+d.phase)*7;
        d.height+=(height-d.height)*Math.min(1,dt*4);
      }
      d.group.position.set(d.x,d.y-d.height);d.group.rotation=d.heading;
      // Fore and hind pairs keep separate thorax joints and opposite stroke phases.
      for(let j=0;j<4;j++){
        const side=j%2?-1:1,front=j<2,stroke=Math.sin(time*83+d.phase+(front?0:Math.PI*.75));
        d.wings[j].rotation=side*((front?1.22:1.94)+stroke*.14);
        d.wings[j].scale.set((front?23:21)/96*(.9+stroke*.08),side*(front?7:9)/32);
        d.wings[j].alpha=.76+Math.abs(stroke)*.2;
      }
      d.shadow.position.set(d.x+d.height*.23,d.y+d.height*.14);d.shadow.alpha=day*.12/(1+d.height*.035);d.shadow.scale.set(1+d.height*.015);
    }
  }
  snapshot(){
    return {season:this.season,activeDay:this.activeDay,
      shrimp:this.shrimp.map(s=>({id:s.id,x:s.x,y:s.y,homeX:s.homeX,homeY:s.homeY,state:s.state,darts:s.darts,visible:s.sprite.visible})),
      petals:this.petals.map(p=>({id:p.id,x:p.x,y:p.y,born:p.born,kind:p.kind||'petal',active:p.active,visible:p.sprite.visible})),
      dragonflies:this.dragonflies.map(d=>({id:d.id,x:d.x,y:d.y,height:d.height,screenY:d.group.y,shadowY:d.shadow.y,state:d.state,targetX:d.targetX,targetY:d.targetY,visible:d.group.visible}))};
  }
}
