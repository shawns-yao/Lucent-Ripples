import { Graphics } from 'pixi.js';

// Sparse remnants use the same footprints for drawing and surface interaction.
export const WINTER_REMNANTS = [[408,527,13,6],[1328,695,11,5],[1191,672,10,5]];
export function remnantAt(x,y){return WINTER_REMNANTS.some(([cx,cy,rx,ry])=>((x-cx)/rx)**2+((y-cy)/ry)**2<1);}

export function createWinterRemnants(world){
  const g=new Graphics();
  for(const [x,y,rx,ry] of WINTER_REMNANTS){
    g.ellipse(x+2,y+3,rx,ry).fill({color:0x253932,alpha:.16});
    g.moveTo(x-rx,y).lineTo(x-rx*.3,y-ry).lineTo(x+rx*.55,y-ry*.7).lineTo(x+rx,y+ry*.15).lineTo(x+rx*.2,y+ry).lineTo(x-rx*.4,y+ry*.6).closePath().fill({color:0x766a46,alpha:.8});
    g.moveTo(x-rx*.7,y).lineTo(x+rx*.6,y+1).stroke({color:0xb5a888,width:.6,alpha:.5});
  }
  for(const [x,y,h] of [[422,531,24],[435,546,17],[1305,691,27],[1321,709,18],[1179,674,22]]){
    g.moveTo(x,y).quadraticCurveTo(x-3,y-h*.5,x+2,y-h).lineTo(x+7,y-h+3).stroke({color:0x625c42,width:1.7,alpha:.8});
    g.moveTo(x+2,y-h).lineTo(x+7,y-h+3).stroke({color:0xc0c9bf,width:.7,alpha:.65});
  }
  for(const [x,y] of [[230,711],[1477,239],[1360,816]])for(let i=0;i<7;i++){
    const dx=(i-3)*3,h=12+(i*7)%16;
    g.moveTo(x,y).quadraticCurveTo(x+dx*.5,y-h*.7,x+dx,y-h).stroke({color:0x90866b,width:1,alpha:.65});
  }
  g.visible=false;world.addChild(g);return g;
}
