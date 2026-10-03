/** Bounded telemetry and slow quality changes, with no per-frame sorting. */
export class FrameBudget {
  constructor(){this.intervals=new Float32Array(240);this.costs=new Float32Array(240);this.index=0;this.count=0;this.quality=1;this.lastFrame=0;this.checkAt=0;this.stableSince=0;this.changed=false;}
  record(now,cost,fps=60) {
    const gap=this.lastFrame?now-this.lastFrame:0;this.lastFrame=now;
    if(gap>0){this.intervals[this.index]=gap;this.costs[this.index]=cost;this.index=(this.index+1)%240;this.count=Math.min(240,this.count+1);}
    if(now<this.checkAt||this.count<90)return;
    this.checkAt=now+2500;let total=0;for(let i=0;i<this.count;i++)total+=this.intervals[i];const mean=total/this.count*Math.min(fps,60)/60;
    if(mean>27&&this.quality>.65){this.quality=.65;this.changed=true;this.stableSince=0;}
    else if(mean<19&&this.quality<1){if(!this.stableSince)this.stableSince=now;if(now-this.stableSince>20000){this.quality=1;this.changed=true;}}
    else this.stableSince=0;
  }
  resetClock(){this.lastFrame=0;this.count=0;this.index=0;this.checkAt=0;this.stableSince=0;}
  snapshot(){
    const values=Array.from(this.intervals.subarray(0,this.count)).sort((a,b)=>a-b);
    let cost=0;for(let i=0;i<this.count;i++)cost+=this.costs[i];
    return {samples:this.count,quality:this.quality,meanFrameMs:values.reduce((a,b)=>a+b,0)/Math.max(1,values.length),p95FrameMs:values[Math.floor(values.length*.95)]||0,framesOver50ms:values.filter(v=>v>50).length,meanUpdateMs:cost/Math.max(1,this.count)};
  }
}
