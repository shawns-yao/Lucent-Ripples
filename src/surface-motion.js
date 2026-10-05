import { STATIC_PADS } from './pond-surface.js';

// Six reusable records feed the existing water pass; no sprites or filters per wake.
export class SurfaceMotion {
  constructor(){
    this.records=Array.from({length:6},()=>({x:0,y:0,created:-100,strength:0,kind:'none'}));
    this.fishCursor=0;this.leafCursor=0;this.slot=0;this.nextFish=1;this.nextLeaf=3;
  }
  emit(x,y,time,strength,kind,climate){
    if(climate.surfaceAt(x,y)!=='water')return;
    const p=this.records[this.slot];this.slot=(this.slot+1)%this.records.length;
    p.x=x;p.y=y;p.created=time;p.strength=strength;p.kind=kind;
  }
  update(time,fish,climate,weather){
    if(time>=this.nextFish){
      this.nextFish=time+.65;
      for(let i=0;i<fish.length;i++){
        const f=fish[this.fishCursor++%fish.length];
        if(f.speed<42||f.submergence>.23)continue;
        this.emit(f.x-Math.cos(f.angle)*f.length*.44,f.y-Math.sin(f.angle)*f.length*.44,time,.28,'fish',climate);break;
      }
    }
    if(time>=this.nextLeaf){
      this.nextLeaf=time+3.6;
      if(weather.wind<.7||climate.winter)return;
      const index=this.leafCursor++%(STATIC_PADS.length+climate.leaves.length);
      const leaf=index<STATIC_PADS.length?STATIC_PADS[index]:null,p=climate.leaves[index-STATIC_PADS.length];
      const x=leaf?leaf[0]:p.x,y=leaf?leaf[1]:p.y,rx=leaf?leaf[2]:p.radius,ry=leaf?leaf[3]:p.radius;
      if(rx<12)return;
      const angle=Math.atan2(weather.windY,weather.windX);
      this.emit(x+Math.cos(angle)*(rx+5),y+Math.sin(angle)*(ry+5),time,.35,'leaf',climate);
    }
  }
  snapshot(time){return this.records.filter(p=>time-p.created<2.4).map(p=>({...p}));}
}
