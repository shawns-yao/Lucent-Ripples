// World-space footprints from the painted pond. Keep new growth and rain impacts
// off the original floating pads and rocky shoreline.
import { COMPANION_PADS } from './pond-layout.js';
export const PAINTED_PADS = [[100,151,43,31],[240,148,35,31],[261,199,19,20],[192,185,31,30],[172,226,16,15],[229,241,24,20],[414,32,49,42],[1365,76,39,24],[1423,333,38,39],[405,522,47,42],[578,713,48,36],[873,826,43,48],[1059,838,47,43],[1350,667,23,25],[1325,703,25,18],[1283,664,16,14],[1288,695,17,14],[1359,707,15,13]];
export const STATIC_PADS=[...PAINTED_PADS,...COMPANION_PADS];
export const ROCKS = [[989,163,25,27],[1340,289,75,40],[1449,571,42,34],[375,758,30,35],[158,672,33,26]];
// Traced in the background's world coordinates, rather than the screen edges.
export const SHORE = [[185,62],[370,30],[635,38],[881,39],[1120,48],[1325,95],[1510,165],[1598,285],[1592,460],[1540,636],[1463,774],[1265,858],[1048,901],[815,899],[592,855],[391,825],[243,724],[122,557],[84,403],[90,217]];
export function insidePond(x,y) {
  if(!Number.isFinite(x+y))return false;
  let inside=false;
  for(let i=0,j=SHORE.length-1;i<SHORE.length;j=i++) {
    const a=SHORE[i],b=SHORE[j];
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function shoreDistance(x,y,out={}) {
  let best=Infinity,px=x,py=y;
  for(let i=0;i<SHORE.length;i++) {
    const a=SHORE[i],b=SHORE[(i+1)%SHORE.length],dx=b[0]-a[0],dy=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
    const qx=a[0]+t*dx,qy=a[1]+t*dy,d=(x-qx)**2+(y-qy)**2;
    if(d<best){best=d;px=qx;py=qy;}
  }
  const inside=insidePond(x,y),distance=Math.sqrt(best),sign=inside?1:-1;
  out.distance=distance*sign;out.x=px;out.y=py;
  out.nx=(x-px)/Math.max(distance,.001)*sign;out.ny=(y-py)/Math.max(distance,.001)*sign;
  return out;
}
export function isWater(x,y,clearance=0) {
  if(!insidePond(x,y))return false;
  if(clearance>0&&shoreDistance(x,y).distance<clearance)return false;
  for(const [px,py,rx,ry] of ROCKS)if(((x-px)/(rx+clearance))**2+((y-py)/(ry+clearance))**2<1)return false;
  return true;
}
export function isPad(x,y,clearance=0) {
  for(const [px,py,rx,ry] of STATIC_PADS)if(((x-px)/(rx+clearance))**2+((y-py)/(ry+clearance))**2<1)return true;
  return false;
}
export function isOpenWater(x,y,clearance=0) {
  return isWater(x,y,clearance)&&!isPad(x,y,clearance);
}
