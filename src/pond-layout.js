// Shared world-space composition. Depth is a visual approximation, not bathymetry.
export const QUIET_WATER={x:650,y:355,rx:295,ry:205};
export const LOTUS_SITES=[[970,452,0],[1220,594,1],[1180,667,1],[945,524,0],[1015,540,0],[1130,612,1],[1040,464,0],[1110,690,1]];
export const COMPANION_PADS=[[910,465,23,23],[1045,598,21,21],[1242,659,22,22],[1195,737,24,24],[449,574,25,25],[373,581,20,20],[640,728,24,24],[595,656,18,18]];
export function waterDepth(x,y,bankDistance=200){
  const a=((x-QUIET_WATER.x)/QUIET_WATER.rx)**2+((y-QUIET_WATER.y)/QUIET_WATER.ry)**2;
  const b=((x-920)/280)**2+((y-540)/220)**2;
  const bank=Math.max(0,Math.min(1,bankDistance/125));
  return Math.min(1,(.18+.69*Math.exp(-a*1.05)+.25*Math.exp(-b*1.2))*bank);
}
