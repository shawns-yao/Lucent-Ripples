import { Container, Sprite, Graphics, MeshSimple } from 'pixi.js';
import { rng } from './simulation.js';
import { STATIC_PADS, isWater } from './pond-surface.js';
import { ecologyArt } from './ecology-art.js';

const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),TAU=Math.PI*2;
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const SHRIMP_HOMES=[[325,633],[418,704],[1264,381],[1393,430],[1327,620]];

export class PondEcology {
  constructor({world,fishLayer,shoreWorld,climate,motion,flowers,canopy,style='natural'}){
    this.climate=climate;this.motion=motion;this.flowers=flowers;this.canopy=canopy;this.random=rng(581903);this.lastTime=0;
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
    this.striders=[[1120,410],[520,615],[1280,500]].map(([x,y],id)=>{
      const group=new Container(),legs=[];this.surface.addChild(group);
      for(const side of [-1,1])for(let j=0;j<3;j++){
        const leg=new Graphics().moveTo(0,0).lineTo(-3-j*2,side*(5+j)).lineTo(2-j*6,side*(9+j)).stroke({color:0x35443a,width:.65,alpha:.85});
        leg.x=4-j*3;group.addChild(leg);legs.push({sprite:leg,side,j});
      }
      group.addChild(new Graphics().ellipse(0,0,5,1.25).fill(0x34463d).ellipse(4,0,1.8,1.6).fill(0x4b5a42));
      return {id,x,y,homeX:x,homeY:y,targetX:x,targetY:y,heading:this.random()*TAU,state:'rest',until:1+id*.8,nextRipple:0,phase:this.random()*TAU,group,legs,slides:0};
    });
    this.petals=Array.from({length:6},(_,id)=>{
      const sprite=new Sprite(this.art.petal);sprite.anchor.set(.5);sprite.width=3.5+id%3;sprite.height=6+id%3;sprite.visible=false;this.surface.addChild(sprite);
      return {id,sprite,x:0,y:0,born:-100,life:32,active:false,phase:id*1.8};
    });
    this.nextPetal=2;this.petalCursor=0;
    this.dragonflies=[[470,605],[1220,510]].map(([x,y],id)=>{
      const shadow=new Graphics().ellipse(0,0,7,2).fill(0x253d32),group=new Container();this.air.addChild(shadow,group);
      const wings=Array.from({length:4},(_,j)=>{const s=new Sprite(this.art.wing);s.anchor.set(.05,.5);s.width=22;s.height=7;s.x=j<2?7:1;group.addChild(s);return s;});
      const body=new Sprite(this.art.dragon);body.anchor.set(.5);body.width=30;body.height=10;group.addChild(body);
      return {id,x,y,homeX:x,homeY:y,heading:this.random()*TAU,height:26,targetX:x+65,targetY:y-35,state:'flight',until:2+id*5,phase:id*2.8,group,body,wings,shadow,perch:null,landings:0};
    });
  }
  setStyle(style){
    this.style=style;this.art=ecologyArt(style);
    for(const s of this.shrimp||[])s.sprite.texture=this.art.shrimp;
    for(const p of this.petals||[])p.sprite.texture=this.art.petal;
    for(const d of this.dragonflies||[]){d.body.texture=this.art.dragon;for(const wing of d.wings)wing.texture=this.art.wing;}
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
  perchFree(x,y,self,frogs,butterflies){
    if(this.canopy(x,y,10))return false;
    for(const d of this.dragonflies)if(d!==self&&d.perch!==null&&Math.hypot(d.targetX-x,d.targetY-y)<40)return false;
    for(const f of frogs){
      if(Math.hypot(f.x-x,f.y-y)<40)return false;
      if(['prepare','jump'].includes(f.state)&&Math.hypot(f.targetX-x,f.targetY-y)<40)return false;
    }
    for(const b of butterflies)if(Math.hypot(b.x-x,b.y-y)<26||b.state==='approach'&&Math.hypot(b.targetX-x,b.targetY-y)<26)return false;
    return true;
  }
  takeoff(d,time){
    d.perch=null;d.state='flight';d.until=time+5+this.random()*5;
    for(let i=0;i<12;i++){
      const a=this.random()*TAU,r=50+this.random()*100,x=d.homeX+Math.cos(a)*r,y=d.homeY+Math.sin(a)*r;
      if(isWater(x,y)&&!this.canopy(x,y,25)){d.targetX=x;d.targetY=y;break;}
    }
  }
  choosePerch(d,time,frogs,butterflies){
    const n=STATIC_PADS.length+this.climate.leaves.length,start=Math.floor(this.random()*n);
    for(let j=0;j<n;j++){
      const index=(start+j)%n,leaf=index<STATIC_PADS.length?STATIC_PADS[index]:null,p=this.climate.leaves[index-STATIC_PADS.length];
      const x=leaf?leaf[0]:p.x,y=leaf?leaf[1]:p.y,r=leaf?Math.min(leaf[2],leaf[3]):p.radius;
      if(r<22||Math.hypot(x-d.homeX,y-d.homeY)>230||!this.perchFree(x,y,d,frogs,butterflies))continue;
      d.perch=index;d.targetX=x;d.targetY=y;d.state='approach';d.until=time+8;return;
    }
    this.takeoff(d,time);
  }
  update(time,weather,season,fish,frogs,butterflies){
    const dt=clamp(time-this.lastTime,0,.1);this.lastTime=time;
    const cold=season==='winter'||this.climate.winter,calm=clamp(1-weather.rain*1.8-weather.snow*2)*clamp(1-(weather.wind-5)/8);
    const day=cold?0:clamp((weather.light-.28)/.45)*calm;
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
    for(const s of this.striders){
      s.group.visible=day>.02&&this.water(s.x,s.y);s.group.alpha=day*.82;
      if(day>.02&&dt>0){
        if(time>=s.until){
          s.state=s.state==='rest'?'slide':'rest';s.until=time+(s.state==='rest'?2+this.random()*4:1.2+this.random()*1.5);
          if(s.state==='slide'){this.chooseLocalTarget(s,65,true);s.slides++;}
        }
        if(s.state==='slide'){
          if(this.move(s,23,dt,true)){s.state='rest';s.until=time+2;}
          if(time>=s.nextRipple){this.motion.emit(s.x,s.y,time,.13,'strider',this.climate);s.nextRipple=time+1.6;}
        }
      }
      s.group.position.set(s.x,s.y);s.group.rotation=s.heading;
      const stroke=s.state==='slide'?Math.sin(time*11+s.phase)*.16:0;
      for(const leg of s.legs)leg.sprite.rotation=stroke*leg.side*(leg.j===0?.3:1);
    }
    if(cold){for(const p of this.petals){p.active=false;p.sprite.visible=false;}this.nextPetal=time+3;}
    else if(time>=this.nextPetal&&dt>0){
      this.nextPetal=time+6+this.random()*4;
      let f=null,available=0;
      for(const flower of this.flowers)if(flower.available&&this.random()<1/++available)f=flower;
      for(let i=0;f&&i<6;i++){
        const a=this.random()*TAU,x=f.x-12+Math.cos(a)*47,y=f.y+Math.sin(a)*47;if(!this.water(x,y))continue;
        const p=this.petals[this.petalCursor++%this.petals.length];p.x=x;p.y=y;p.born=time;p.life=30+this.random()*14;p.active=true;break;
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
      if(day>.02&&dt>0){
        if(d.perch!==null&&!this.perchFree(d.targetX,d.targetY,d,frogs,butterflies))this.takeoff(d,time);
        if(d.state==='rest'){
          if(time>=d.until)this.takeoff(d,time);
        }else{
          if(time>=d.until){if(d.state==='flight')this.choosePerch(d,time,frogs,butterflies);else this.takeoff(d,time);}
          const dx=d.targetX-d.x,dy=d.targetY-d.y,distance=Math.hypot(dx,dy),approach=d.state==='approach';
          d.heading+=angleDelta(Math.atan2(dy,dx),d.heading)*Math.min(1,dt*(approach?9:5));
          const speed=Math.min(distance*(approach?3:2),approach?95:130),x=d.x+Math.cos(d.heading)*speed*dt,y=d.y+Math.sin(d.heading)*speed*dt;
          if(!this.canopy(x,y,10)){d.x=x;d.y=y;}else this.takeoff(d,time);
          const height=approach?clamp(distance/75)*28:23+Math.sin(time*2+d.phase)*7;
          d.height+=(height-d.height)*Math.min(1,dt*7);
          if(approach&&distance<2&&d.height<1.5){d.x=d.targetX;d.y=d.targetY;d.height=0;d.state='rest';d.until=time+7+this.random()*7;d.landings++;}
          else if(!approach&&distance<10)this.choosePerch(d,time,frogs,butterflies);
        }
      }
      d.group.position.set(d.x,d.y-d.height);d.group.rotation=d.heading;
      for(let j=0;j<4;j++){const side=j%2?-1:1,base=j<2?1.08:1.92;d.wings[j].rotation=side*(base+(d.state==='rest'?0:Math.sin(time*67+d.phase)*.13));d.wings[j].scale.y=(d.state==='rest'?1:.45+Math.abs(Math.sin(time*67+d.phase))*.55)*7/32;}
      d.shadow.position.set(d.x+d.height*.23,d.y+d.height*.14);d.shadow.alpha=day*.12/(1+d.height*.035);d.shadow.scale.set(1+d.height*.015);
    }
  }
  snapshot(){
    return {season:this.season,activeDay:this.activeDay,
      shrimp:this.shrimp.map(s=>({id:s.id,x:s.x,y:s.y,homeX:s.homeX,homeY:s.homeY,state:s.state,darts:s.darts,visible:s.sprite.visible})),
      striders:this.striders.map(s=>({id:s.id,x:s.x,y:s.y,state:s.state,slides:s.slides,visible:s.group.visible})),
      petals:this.petals.map(p=>({id:p.id,x:p.x,y:p.y,born:p.born,active:p.active,visible:p.sprite.visible})),
      dragonflies:this.dragonflies.map(d=>({id:d.id,x:d.x,y:d.y,height:d.height,screenY:d.group.y,shadowY:d.shadow.y,state:d.state,perch:d.perch,targetX:d.targetX,targetY:d.targetY,landings:d.landings,visible:d.group.visible}))};
  }
}
