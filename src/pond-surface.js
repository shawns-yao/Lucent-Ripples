// World-space footprints from the painted pond. Keep new growth and rain impacts
// off the original floating pads and rocky shoreline.
export const STATIC_PADS = [[100,151,43,31],[240,148,35,31],[261,199,19,20],[192,185,31,30],[172,226,16,15],[229,241,24,20],[414,32,49,42],[1365,76,39,24],[1423,333,38,39],[405,522,47,42],[578,713,48,36],[873,826,43,48],[1059,838,47,43],[1350,667,23,25],[1325,703,25,18],[1283,664,16,14],[1288,695,17,14],[1359,707,15,13]];
const ROCKS = [[989,163,25,27],[1340,289,75,40],[1449,571,42,34],[375,758,30,35],[158,672,33,26]];
export function isOpenWater(x,y,clearance=0) {
  if(!Number.isFinite(x+y))return false;
  const nx=(x-836)/(735-clearance),ny=(y-465)/(402-clearance);
  if(nx*nx+ny*ny>1)return false;
  return [...STATIC_PADS,...ROCKS].every(([px,py,rx,ry])=>((x-px)/(rx+clearance))**2+((y-py)/(ry+clearance))**2>1);
}
