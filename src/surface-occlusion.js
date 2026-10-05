import { Texture } from 'pixi.js';
import { PAINTED_PADS, ROCKS } from './pond-surface.js';

// Extract the painted foreground once per style. Ellipses locate the leaves;
// their actual colors retain the outline and open notches in each background.
export function createSurfaceOcclusion(bottom, style, includeLeaves=true) {
  const canvas=document.createElement('canvas');canvas.width=1672;canvas.height=941;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.drawImage(bottom.source.resource,0,0,canvas.width,canvas.height);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;
  const coverage=new Uint8Array(canvas.width*canvas.height);
  let leafPixels=0;
  for(const [cx,cy,rx,ry] of includeLeaves?PAINTED_PADS:[]) {
    const left=Math.max(0,Math.floor(cx-rx*1.35)),right=Math.min(canvas.width-1,Math.ceil(cx+rx*1.35));
    const top=Math.max(0,Math.floor(cy-ry*1.45)),bottom=Math.min(canvas.height-1,Math.ceil(cy+ry*1.45));
    const width=right-left+1,height=bottom-top+1,patch=new Uint8Array(width*height),queue=new Int32Array(patch.length);
    let seed=-1,nearest=Infinity;
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++) {
      const k=y*canvas.width+x,i=k*4,r=data[i],g=data[i+1],b=data[i+2];
      if(g>r*.88&&r>g*.48&&b<g*(style==='cartoon'?.67:.61)) {
        patch[(y-top)*width+x-left]=1;
        const distance=(x-cx)**2+(y-cy)**2;if(distance<nearest){nearest=distance;seed=(y-top)*width+x-left;}
      }
    }
    if(seed<0)continue;
    let head=0,tail=1;queue[0]=seed;patch[seed]=2;
    const visitLeaf=k=>{if(patch[k]===1){patch[k]=2;queue[tail++]=k;}};
    while(head<tail){const k=queue[head++],x=k%width;
      if(x>0)visitLeaf(k-1);if(x<width-1)visitLeaf(k+1);
      if(k>=width)visitLeaf(k-width);if(k<patch.length-width)visitLeaf(k+width);
    }
    // Fill spots enclosed by the leaf, while a notch remains connected to water.
    head=tail=0;
    const visitWater=k=>{if(patch[k]!==2&&patch[k]!==3){patch[k]=3;queue[tail++]=k;}};
    for(let x=0;x<width;x++){visitWater(x);visitWater((height-1)*width+x);}
    for(let y=0;y<height;y++){visitWater(y*width);visitWater(y*width+width-1);}
    while(head<tail){const k=queue[head++],x=k%width;
      if(x>0)visitWater(k-1);if(x<width-1)visitWater(k+1);
      if(k>=width)visitWater(k-width);if(k<patch.length-width)visitWater(k+width);
    }
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(patch[y*width+x]!==3)coverage[(y+top)*canvas.width+x+left]=1;
  }
  // A one-pixel fringe includes the dark antialiased leaf border.
  for(let y=1;y<canvas.height-1;y++)for(let x=1;x<canvas.width-1;x++) {
    const k=y*canvas.width+x;
    if(!coverage[k]&&(coverage[k-1]===1||coverage[k+1]===1||coverage[k-canvas.width]===1||coverage[k+canvas.width]===1))coverage[k]=2;
  }
  for(const [cx,cy,rx,ry] of ROCKS) {
    for(let y=Math.max(0,Math.floor(cy-ry));y<=Math.min(canvas.height-1,cy+ry);y++)
      for(let x=Math.max(0,Math.floor(cx-rx));x<=Math.min(canvas.width-1,cx+rx);x++)
        if(((x-cx)/rx)**2+((y-cy)/ry)**2<=1)coverage[y*canvas.width+x]=3;
  }
  for(let k=0;k<coverage.length;k++) {
    if(coverage[k]===1)leafPixels++;
    if(!coverage[k])data[k*4+3]=0;
  }
  context.putImageData(pixels,0,0);
  // R: seasonal leaves. G: ice contact inferred from the winter artwork,
  // including shallow margins outside the conservative fish navigation polygon.
  const mask=document.createElement('canvas');mask.width=418;mask.height=236;
  const mc=mask.getContext('2d'),mp=mc.createImageData(mask.width,mask.height);
  for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++){
    const sourceIndex=Math.min(940,Math.floor((y+.5)*941/236))*1672+Math.floor((x+.5)*4);
    const value=coverage[sourceIndex],k=(y*mask.width+x)*4;
    mp.data[k]=value===1||value===2?255:0;mp.data[k+3]=255;
    if(!includeLeaves){
      const i=sourceIndex*4,r=data[i],g=data[i+1],b=data[i+2];
      const green=Math.max(0,Math.min(1,(g-r+4)/18));
      const waterTone=Math.max(0,Math.min(1,(g-b+4)/18));
      mp.data[k+1]=Math.round(255*green*waterTone);
    }
  }
  mc.putImageData(mp,0,0);
  return {texture:Texture.from(canvas),foliage:Texture.from(mask),leafPixels,
    at(x,y){return context.getImageData(Math.max(0,Math.min(1671,Math.floor(x))),Math.max(0,Math.min(940,Math.floor(y))),1,1).data[3]/255;}};
}
