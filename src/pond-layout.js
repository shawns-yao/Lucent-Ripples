// Shared world-space composition. Depth is a visual approximation, not bathymetry.
export const QUIET_WATER={x:650,y:355,rx:295,ry:205};
export function waterDepth(x,y,bankDistance=200){
  const a=((x-QUIET_WATER.x)/QUIET_WATER.rx)**2+((y-QUIET_WATER.y)/QUIET_WATER.ry)**2;
  const b=((x-920)/280)**2+((y-540)/220)**2;
  const bank=Math.max(0,Math.min(1,bankDistance/125));
  return Math.min(1,(.18+.69*Math.exp(-a*1.05)+.25*Math.exp(-b*1.2))*bank);
}
