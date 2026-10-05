import { Texture, Rectangle } from 'pixi.js';

const cache=new Map();
// Small reusable atlas for scenery; all drawing happens once per style.
export function ecologyArt(style){
  if(cache.has(style))return cache.get(style);
  const cartoon=style==='cartoon',canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const c=canvas.getContext('2d');
  const ellipse=(x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();};
  const line=(points,color,width=1)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.stroke();};
  // Grayscale vegetation receives seasonal tint in the scene.
  line([[48,156],[43,123],[51,83],[44,43],[47,9]],'#a8b79a',2.1);
  for(let i=0;i<7;i++){
    const y=139-i*18,x=47+Math.sin(i*1.8)*4;
    for(const side of [-1,1]){
      const length=26-i*1.8,tipX=x+side*length,tipY=y-18;
      const g=c.createLinearGradient(x,y,tipX,tipY);g.addColorStop(0,'#71876b');g.addColorStop(.65,'#c4d1ae');g.addColorStop(1,'#8b9e7c');
      c.fillStyle=g;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+side*length*.25,y-20,tipX,tipY);c.quadraticCurveTo(x+side*length*.7,y-2,x,y);c.fill();
      line([[x,y],[tipX,tipY]],'#e4eaca',.6);
    }
  }
  // Dragonfly: slim segmented abdomen, compound eyes and separate veined wings.
  c.save();c.translate(128,0);
  const body=c.createLinearGradient(0,8,0,24);body.addColorStop(0,cartoon?'#71babe':'#86b4ad');body.addColorStop(.45,cartoon?'#397f86':'#4a8278');body.addColorStop(1,'#28433f');
  ellipse(44,16,34,3.8,body);ellipse(74,16,11,6,body);ellipse(84,12,4,3.5,'#304b42');ellipse(84,20,4,3.5,'#304b42');
  for(let x=15;x<66;x+=7)line([[x,13],[x,19]],'#365248',1);
  line([[23,14],[65,14]],'#b1d5b4',.7);c.restore();
  c.save();c.translate(128,48);c.fillStyle=cartoon?'rgba(228,250,234,.62)':'rgba(225,239,221,.42)';
  c.beginPath();c.moveTo(5,16);c.bezierCurveTo(28,1,78,2,89,11);c.bezierCurveTo(98,23,45,32,5,16);c.fill();
  c.strokeStyle='rgba(132,167,149,.65)';c.lineWidth=.8;c.stroke();
  line([[6,16],[83,12]],'rgba(143,172,153,.7)',.7);
  for(let i=1;i<6;i++){const x=12+i*11;line([[x,15],[x+10,7]],'rgba(143,172,153,.45)',.6);line([[x,16],[x+9,25]],'rgba(143,172,153,.45)',.6);}
  c.restore();
  // Translucent freshwater shrimp with a curved, tapering segmented abdomen.
  c.save();c.translate(256,0);
  const shell=c.createLinearGradient(0,14,0,34);shell.addColorStop(0,cartoon?'#deb482':'rgba(182,161,116,.8)');shell.addColorStop(.5,cartoon?'#ab8057':'rgba(126,131,89,.7)');shell.addColorStop(1,'rgba(82,91,59,.5)');
  for(let i=0;i<6;i++)ellipse(25+i*7,26-Math.sin(i/5*Math.PI)*4,6+i*.8,3+i*.4,shell);
  ellipse(69,22,9,5,shell);ellipse(75,19,1.5,1.5,'#283c30');
  for(let i=0;i<4;i++)line([[48+i*6,26],[44+i*6,35],[49+i*6,37]],'rgba(165,155,115,.8)',1);
  line([[72,20],[83,13],[92,12]],'rgba(202,199,154,.8)',.8);line([[73,23],[87,24],[94,29]],'rgba(202,199,154,.8)',.8);
  c.fillStyle=shell;c.beginPath();c.moveTo(26,25);c.lineTo(13,19);c.lineTo(16,30);c.lineTo(12,35);c.lineTo(28,29);c.fill();c.restore();
  c.save();c.translate(384,0);
  const petal=c.createLinearGradient(8,4,23,41);petal.addColorStop(0,'#fae6df');petal.addColorStop(.65,cartoon?'#f1b1b7':'#d8b3b4');petal.addColorStop(1,'#b88b95');
  c.fillStyle=petal;c.beginPath();c.moveTo(17,42);c.bezierCurveTo(-2,24,5,1,14,3);c.bezierCurveTo(35,5,28,29,17,42);c.fill();line([[15,10],[17,35]],'rgba(249,229,219,.6)',1);c.restore();
  const texture=Texture.from(canvas),frame=(x,y,width,height)=>new Texture({source:texture.source,frame:new Rectangle(x,y,width,height)});
  const result={grass:frame(0,0,96,160),dragon:frame(128,0,96,32),wing:frame(128,48,96,32),shrimp:frame(256,0,96,48),petal:frame(384,0,32,48)};
  cache.set(style,result);return result;
}
