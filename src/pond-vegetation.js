import { Container, MeshSimple } from 'pixi.js';
import { isWater } from './pond-surface.js';
import { ecologyArt } from './ecology-art.js';

const PATCHES=[[290,330],[337,382],[320,623],[430,714],[1255,365],[1390,405],[1354,610],[1190,790]];
export class PondVegetation {
  constructor(world,before,style='natural'){
    this.container=new Container();this.container.label='submerged-vegetation';this.container.eventMode='none';
    world.addChildAt(this.container,world.getChildIndex(before));
    this.patches=[];this.nextInfluence=0;this.setStyle(style);
    PATCHES.forEach(([x,y],id)=>{
      if(!isWater(x,y,22))return;
      const patch={id,x,y,response:0,influence:0,blades:[]};this.patches.push(patch);
      for(let i=0;i<5;i++){
        const h=40+(Math.sin(id*7+i*2.4)+1)*16,w=h*.48,vertices=new Float32Array(28),uvs=new Float32Array(28),indices=[];
        for(let j=0;j<7;j++)for(let side=0;side<2;side++){const k=(j*2+side)*2;vertices[k]=(side-.5)*w;vertices[k+1]=-h*j/6;uvs[k]=side;uvs[k+1]=1-j/6;}
        for(let j=0;j<6;j++){const n=j*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
        const mesh=new MeshSimple({texture:this.art.grass,vertices,uvs,indices:new Uint32Array(indices)});
        mesh.position.set(x+(i-2)*6,y+Math.sin(i*2)*4);mesh.rotation=(i-2)*.17;mesh.alpha=.52;
        this.container.addChild(mesh);patch.blades.push({mesh,base:vertices.slice(),phase:id*1.7+i*1.2});
      }
    });
  }
  setStyle(style){this.style=style;this.art=ecologyArt(style);for(const p of this.patches||[])for(const b of p.blades)b.mesh.texture=this.art.grass;}
  update(time,weather,season,fish){
    if(time>=this.nextInfluence){
      this.nextInfluence=time+.15;
      for(const p of this.patches){
        p.influence=0;
        for(const f of fish){const d=Math.hypot(f.x-p.x,f.y-(p.y-20));if(d<65)p.influence=Math.max(p.influence,(1-d/65)*Math.min(1,f.speed/70));}
      }
    }
    const dt=Math.max(0,Math.min(.1,time-(this.lastTime??time)));this.lastTime=time;
    const winter=season==='winter',autumn=season==='autumn';
    const tint=winter?0x8c8469:autumn?0x9c9f67:this.style==='cartoon'?0x8cbe6d:0xa2b985;
    for(const p of this.patches){
      p.response+=(p.influence-p.response)*Math.min(1,dt*4);
      for(const b of p.blades){
        const mesh=b.mesh,v=mesh.vertices;
        for(let j=0;j<7;j++){
          const u=j/6,bend=Math.sin(time*.72+b.phase+u*1.8)*u*u*(1.2+weather.wind*.16)+(Math.sin(time*3.1+b.phase)*p.response*5)*u*u;
          for(let side=0;side<2;side++){const k=(j*2+side)*2;v[k]=b.base[k]+bend;v[k+1]=b.base[k+1]*(winter?.67:1);}
        }
        mesh.tint=tint;mesh.alpha=winter?.3:this.style==='cartoon'?.76:.7;
      }
    }
  }
  snapshot(){return this.patches.map(p=>({id:p.id,x:p.x,y:p.y,response:p.response,blades:p.blades.length}));}
}
