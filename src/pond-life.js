import { Container, Sprite, Texture, Rectangle, MeshSimple, Graphics } from 'pixi.js';
import { rng } from './simulation.js';
import { STATIC_PADS, ROCKS, isWater } from './pond-surface.js';

const TAU=Math.PI*2,clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const turn=(a,b,amount)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*amount;
const FROG_SPACING=44;

function crabMesh(texture,width) {
  const cols=12,rows=8,vertices=new Float32Array((cols+1)*(rows+1)*2),uvs=new Float32Array(vertices.length),indices=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){const k=(y*(cols+1)+x)*2;vertices[k]=(x/cols-.5)*width;vertices[k+1]=(y/rows-.5)*width;uvs[k]=x/cols;uvs[k+1]=y/rows;}
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const n=y*(cols+1)+x;indices.push(n,n+1,n+cols+1,n+1,n+cols+2,n+cols+1);}
  const mesh=new MeshSimple({texture,vertices,uvs,indices:new Uint32Array(indices)});mesh.data={width,cols,rows};return mesh;
}

/** Small persistent inhabitants. Random choices occur at state changes only. */
export class PondLife {
  constructor(world,aboveWater,atlas,climate,canopyAt) {
    this.climate=climate;this.canopyAt=canopyAt;this.random=rng(crypto.getRandomValues(new Uint32Array(1))[0]);this.lastTime=0;
    this.bottom=new Container();world.addChildAt(this.bottom,1);
    this.frogLayer=new Container();aboveWater.addChildAt(this.frogLayer,0);
    this.rings=new Graphics();world.addChild(this.rings);
    const size=atlas.width/2;
    this.textures=Array.from({length:4},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%2*size,Math.floor(i/2)*size,size,size)}));
    this.crabs=Array.from({length:4},(_,id)=>{
      const rock=ROCKS[id],homeX=rock[0]+rock[2]+11,homeY=rock[1]+12,mesh=crabMesh(this.textures[id%2],31+this.random()*9);
      mesh.tint=0xbed0b7;this.bottom.addChild(mesh);
      return {id,mesh,x:homeX,y:homeY,homeX,homeY,targetX:homeX,targetY:homeY,heading:0,speed:7+this.random()*7,state:'rest',until:2+this.random()*7,alpha:.8,phase:this.random()*TAU};
    });
    this.frogs=Array.from({length:3},(_,id)=>{
      const perch=STATIC_PADS[[9,10,12][id]],group=new Container();this.frogLayer.addChild(group);
      const shadow=new Graphics().ellipse(0,2,9,4).fill({color:0x163829,alpha:.18});this.frogLayer.addChildAt(shadow,0);
      const poses=[new Sprite(this.textures[2]),new Sprite(this.textures[3])];
      for(const sprite of poses){sprite.anchor.set(.5);sprite.width=sprite.height=35+id*2;group.addChild(sprite);}
      return {id,group,shadow,poses,x:perch[0],y:perch[1],startX:perch[0],startY:perch[1],targetX:perch[0],targetY:perch[1],perch:null,heading:this.random()*TAU,state:'rest',until:3+this.random()*5,elapsed:0,duration:.5,height:0,alpha:1,phase:this.random()*TAU,landing:'leaf',jumpCount:0,waterExitCount:0,lastJumpDistance:0};
    });
    this.splashes=Array.from({length:6},()=>({x:0,y:0,born:-100}));this.splashIndex=0;
  }
  crabTarget(crab,time) {
    for(let attempt=0;attempt<24;attempt++) {
      const x=crab.homeX+(this.random()-.5)*100,y=crab.homeY+(this.random()-.5)*80;
      if(isWater(x,y,5)&&this.climate.iceAt(x,y)<.3){crab.targetX=x;crab.targetY=y;break;}
    }
    crab.state='walk';crab.until=time+5+this.random()*8;
  }
  perches() {
    const perches=[];
    const add=(x,y,rx,ry,kind)=>{
      for(const [dx,dy] of [[0,0],[-Math.max(0,rx-22)*.85,0],[Math.max(0,rx-22)*.85,0],[0,-Math.max(0,ry-22)*.85],[0,Math.max(0,ry-22)*.85]]) {
        if(!this.canopyAt(x+dx,y+dy)&&this.climate.iceAt(x+dx,y+dy)<.2)perches.push({x:x+dx,y:y+dy,cx:x,cy:y,rx,ry,kind});
      }
    };
    for(const p of STATIC_PADS)if(Math.min(p[2],p[3])>=24)add(...p,'leaf');
    for(const p of ROCKS)add(...p,'rock');
    for(const p of this.climate.leaves)if(p.radius>=24)add(p.x,p.y,p.radius,p.radius,'leaf');
    return perches;
  }
  landingFree(frog,x,y) {
    return this.frogs.every(other=>other===frog||(
      Math.hypot(x-other.x,y-other.y)>=FROG_SPACING&&
      (!other.perch||Math.hypot(x-other.perch.x,y-other.perch.y)>=FROG_SPACING)&&
      (!(other.state==='prepare'||other.state==='jump')||Math.hypot(x-other.targetX,y-other.targetY)>=FROG_SPACING)
    ));
  }
  jump(frog,time,startled=false) {
    const reachable=this.perches().filter(p=>{const d=Math.hypot(p.x-frog.x,p.y-frog.y);return d>110&&d<420&&this.landingFree(frog,p.x,p.y);});
    if(reachable.length&&(startled||this.random()<.86)) {
      const p=reachable[Math.floor(this.random()*reachable.length)];this.prepareJump(frog,p.x,p.y,p.kind,startled,p);return;
    }
    const direction=startled?frog.heading+Math.PI:this.random()*TAU;
    for(let attempt=0;attempt<24;attempt++) {
      const a=direction+(this.random()-.5)*1.4,length=120+this.random()*110;
      const x=frog.x+Math.cos(a)*length,y=frog.y+Math.sin(a)*length;
      if(isWater(x,y,10)&&this.climate.surfaceAt(x,y)==='water'&&!this.canopyAt(x,y)&&this.climate.iceAt(x,y)<.15&&this.landingFree(frog,x,y)) {
        this.prepareJump(frog,x,y,'water',startled);return;
      }
    }
    frog.until=time+3;
  }
  prepareJump(frog,x,y,landing,startled,perch=null) {
    frog.fromWater=frog.state==='swim';frog.perch=perch;
    frog.startX=frog.x;frog.startY=frog.y;frog.targetX=x;frog.targetY=y;
    frog.lastJumpDistance=Math.hypot(x-frog.x,y-frog.y);frog.jumpHeight=20+frog.lastJumpDistance*.065;
    frog.heading=Math.atan2(y-frog.y,x-frog.x);frog.state='prepare';frog.elapsed=0;frog.preparation=startled?.07:.13;
    frog.duration=.32+frog.lastJumpDistance/1500;frog.landing=landing;
  }
  splash(x,y,time) {
    if(this.climate.surfaceAt(x,y)!=='water')return;
    const splash=this.splashes[this.splashIndex++%this.splashes.length];splash.x=x;splash.y=y;splash.born=time;
  }
  swimTarget(frog,time) {
    frog.perch=null;
    let best=null,score=Infinity;
    for(const p of this.perches()) {
      if(!this.landingFree(frog,p.x,p.y))continue;
      const direction=Math.atan2(frog.y-p.cy,frog.x-p.cx);
      for(const offset of [0,-Math.PI/4,Math.PI/4,-Math.PI/2,Math.PI/2]) {
        const a=direction+offset,x=p.cx+Math.cos(a)*(p.rx+18),y=p.cy+Math.sin(a)*(p.ry+18),d=Math.hypot(x-frog.x,y-frog.y);
        if(d>=score||!isWater(x,y,4)||this.climate.surfaceAt(x,y)!=='water'||this.canopyAt(x,y)||this.climate.iceAt(x,y)>=.15)continue;
        let clear=true;
        const steps=Math.max(1,Math.ceil(d/12));
        for(let i=1;i<=steps;i++) {
          const t=i/steps,qx=frog.x+(x-frog.x)*t,qy=frog.y+(y-frog.y)*t;
          if(!isWater(qx,qy,2)||this.climate.surfaceAt(qx,qy)!=='water'||this.climate.iceAt(qx,qy)>=.15){clear=false;break;}
        }
        if(clear){best={perch:p,x,y};score=d;}
      }
    }
    frog.targetX=best?best.x:frog.x;frog.targetY=best?best.y:frog.y;
    frog.perch=best?.perch||null;frog.until=time+(best?30:2);
  }
  disturb(x,y,time) {
    for(const crab of this.crabs)if(Math.hypot(x-crab.x,y-crab.y)<80){crab.state='hide';crab.until=time+3+this.random()*4;}
    for(const frog of this.frogs)if(frog.alpha>.4&&frog.state==='rest'&&Math.hypot(x-frog.x,y-frog.y)<100)this.jump(frog,time,true);
  }
  update(time,weather) {
    const dt=clamp(time-this.lastTime,0,.1);this.lastTime=time;
    const warm=clamp((weather.temp-3)/11),light=.42+.58*weather.light;
    for(const c of this.crabs) {
      if(time>=c.until) {
        if(c.state==='walk'){c.state='rest';c.until=time+3+this.random()*8;}
        else if(this.random()<.18){c.state='hide';c.until=time+4+this.random()*6;}
        else this.crabTarget(c,time);
      }
      const walking=c.state==='walk'&&warm>.1;
      if(walking) {
        const dx=c.targetX-c.x,dy=c.targetY-c.y,d=Math.hypot(dx,dy),step=Math.min(d,c.speed*dt*warm);
        c.heading=turn(c.heading,Math.atan2(dy,dx),Math.min(1,dt*3));
        const x=c.x+dx/Math.max(1,d)*step,y=c.y+dy/Math.max(1,d)*step;
        if(isWater(x,y,4)){c.x=x;c.y=y;}else c.until=time;
        if(d<3){c.state='rest';c.until=time+3+this.random()*6;}
      }
      const targetAlpha=(c.state==='hide'?.05:.82)*warm*(1-this.climate.iceAt(c.x,c.y)*.9);
      c.alpha+=(targetAlpha-c.alpha)*Math.min(1,dt*2.5);c.mesh.alpha=c.alpha*light;c.mesh.visible=c.mesh.alpha>.015;
      c.mesh.position.set(c.x,c.y);c.mesh.rotation=c.heading;
      const {width,cols,rows}=c.mesh.data,vertices=c.mesh.vertices;
      for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++) {
        const u=x/cols-.5,v=y/rows-.5,k=(y*(cols+1)+x)*2;
        const leg=clamp((Math.abs(u)-.18)*4),gait=walking?Math.sin(time*9+c.phase+y*.85+(u<0?0:Math.PI))*1.2:0;
        vertices[k]=u*width+leg*gait*.45;vertices[k+1]=v*width+leg*gait;
      }
    }
    for(const f of this.frogs) {
      const active=this.climate.winter||weather.temp<6?0:warm*(1-weather.snow);
      f.alpha+=(active-f.alpha)*Math.min(1,dt*1.6);f.group.alpha=f.alpha*light;f.group.visible=f.group.alpha>.015;
      f.group.visible=f.group.visible&&!this.climate.winter&&weather.temp>=6;
      if(active>.25||f.state==='jump'||f.state==='prepare') {
        if(active>.25&&f.state==='rest'&&time>=f.until)this.jump(f,time);
        if(f.state==='prepare'){f.elapsed+=dt;if(f.elapsed>=f.preparation){f.state='jump';f.elapsed=0;}}
        if(f.state==='jump') {
          f.elapsed+=dt;const p=clamp(f.elapsed/f.duration);
          f.x=f.startX+(f.targetX-f.startX)*p;f.y=f.startY+(f.targetY-f.startY)*p;f.height=Math.sin(p*Math.PI)*f.jumpHeight;
          if(p>=1){f.height=0;f.jumpCount++;if(f.landing==='water'){f.state='swim';this.splash(f.x,f.y,time);this.swimTarget(f,time);}else{if(f.fromWater)f.waterExitCount++;f.state='settle';f.elapsed=0;f.until=time+4+this.random()*8;}}
        } else if(f.state==='swim') {
          if(time>f.until||(f.perch&&!this.landingFree(f,f.perch.x,f.perch.y)))this.swimTarget(f,time);
          const dx=f.targetX-f.x,dy=f.targetY-f.y,d=Math.hypot(dx,dy),speed=(32+Math.sin(time*5+f.phase)*10)*dt;
          if(f.perch&&d<4) {
            const p=f.perch;this.splash(f.x,f.y,time);this.prepareJump(f,p.x,p.y,p.kind,false,p);
          } else if(d>=4) {
            f.heading=turn(f.heading,Math.atan2(dy,dx),Math.min(1,dt*4));
            const x=f.x+dx/d*Math.min(d,speed),y=f.y+dy/d*Math.min(d,speed);
            if(isWater(x,y,2)&&this.climate.surfaceAt(x,y)==='water'){f.x=x;f.y=y;}else this.swimTarget(f,time);
          }
        } else if(f.state==='settle') {
          f.elapsed+=dt;if(f.elapsed>=.16)f.state='rest';
        }
      }
      const pose=f.state==='jump'?Math.sin(clamp(f.elapsed/f.duration)*Math.PI):f.state==='swim'?Math.pow(.5+.5*Math.sin(time*4+f.phase),2):0;
      f.poses[0].alpha=1-pose;f.poses[1].alpha=pose;
      f.group.position.set(f.x,f.y-f.height);f.group.rotation=f.heading+Math.PI/2;
      const crouch=f.state==='prepare'?-.15*Math.sin(clamp(f.elapsed/f.preparation)*Math.PI):f.state==='settle'?-.12*Math.sin(clamp(f.elapsed/.16)*Math.PI):0;
      f.group.scale.set(1,f.state==='swim'?.82:1+crouch+Math.sin(time*1.8+f.phase)*.013);
      f.shadow.position.set(f.x+3,f.y+3);f.shadow.alpha=f.group.alpha*(f.state==='swim'?.06:.18);f.shadow.visible=f.group.visible;
    }
    this.rings.clear();
    for(const p of this.splashes) {
      const age=time-p.born;if(age<0||age>1.4)continue;
      const radius=3+age*25,alpha=(1-age/1.4)*.26;
      this.rings.ellipse(p.x,p.y,radius,radius*.9).stroke({color:0xd6e7dc,width:.8,alpha});
      if(age<.2)for(let k=0;k<5;k++){const a=k*TAU/5;this.rings.ellipse(p.x+Math.cos(a)*age*35,p.y+Math.sin(a)*age*22-age*30,1,.65).fill({color:0xe6eee2,alpha});}
    }
  }
  snapshot(){return {crabs:this.crabs.map(c=>({id:c.id,x:c.x,y:c.y,state:c.state,visible:c.mesh.visible,alpha:c.alpha})),frogs:this.frogs.map(f=>({id:f.id,x:f.x,y:f.y,state:f.state,height:f.height,visible:f.group.visible,alpha:f.alpha,landing:f.landing,jumpCount:f.jumpCount,waterExitCount:f.waterExitCount,lastJumpDistance:f.lastJumpDistance,targetX:f.targetX,targetY:f.targetY,perch:f.perch?{x:f.perch.x,y:f.perch.y,kind:f.perch.kind}:null})),splashes:this.splashes.map(p=>({...p}))};}
}
