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
  c.fillStyle=body;c.beginPath();c.moveTo(8,16);c.bezierCurveTo(18,12,45,12,67,12);c.lineTo(67,20);c.bezierCurveTo(42,20,17,19,8,16);c.fill();
  ellipse(72,16,9,5,body);ellipse(83,12.5,4.8,3.8,'#304b42');ellipse(83,19.5,4.8,3.8,'#304b42');
  for(let x=17;x<66;x+=6)line([[x,13.5],[x,18.5]],'#365248',.8);
  line([[18,14],[65,14]],'#b1d5b4',.7);
  for(const side of [-1,1])for(let j=0;j<3;j++)line([[72-j*2,16],[76-j*4,16+side*5],[79-j*5,16+side*7]],'#344840',.8);
  ellipse(84,11.5,1.5,.9,'#a7ccc0');c.restore();
  for(let pair=0;pair<2;pair++){
    c.save();c.translate(128,48+pair*48);
    c.beginPath();c.moveTo(5,16);c.bezierCurveTo(22,pair?2:10,74,3,89,11);c.bezierCurveTo(97,19,78,24,53,24);c.bezierCurveTo(30,pair?31:25,13,20,5,16);
    c.fillStyle=cartoon?'rgba(233,251,242,.68)':'rgba(225,242,233,.48)';c.fill();
    c.strokeStyle='rgba(122,158,143,.65)';c.lineWidth=.75;c.stroke();c.save();c.clip();
    line([[5,16],[43,12],[87,12]],'rgba(116,155,139,.65)',.7);
    line([[5,16],[44,20],[83,17]],'rgba(143,172,153,.48)',.6);
    for(let i=0;i<9;i++){const x=13+i*8;line([[x,2],[x+7,14],[x+2,31]],'rgba(143,172,153,.38)',.5);}
    c.restore();line([[77,8],[82,9]],'rgba(79,108,96,.72)',1.8);c.restore();
  }
  // Bee body and wings are separate so the thorax stays stable during flight.
  c.save();c.translate(128,176);
  for(const side of [-1,1])for(let j=0;j<3;j++)line([[57-j*4,24],[54-j*5,24+side*9],[59-j*7,24+side*13]],'#58492d',1.3);
  const gold=c.createLinearGradient(0,14,0,34);gold.addColorStop(0,cartoon?'#ffdb77':'#d9b969');gold.addColorStop(.45,'#c99a3e');gold.addColorStop(1,'#806131');
  ellipse(36,24,22,10,gold);c.save();c.beginPath();c.ellipse(36,24,22,10,0,0,Math.PI*2);c.clip();
  for(const x of [20,32,44]){c.fillStyle='#514530';c.fillRect(x,12,5,24);}c.restore();
  ellipse(61,24,12,10,gold);ellipse(75,24,7,7,'#403e2c');ellipse(77,20,2,2,'#202e26');ellipse(77,28,2,2,'#202e26');
  line([[79,21],[87,17],[90,18]],'#5f593d',1);line([[79,27],[88,31],[91,30]],'#5f593d',1);
  for(let i=0;i<6;i++)line([[56+i*2,16],[55+i*2,13]],'rgba(241,219,154,.6)',.8);c.restore();
  c.save();c.translate(256,96);c.fillStyle='rgba(234,246,229,.65)';c.beginPath();c.moveTo(5,16);c.bezierCurveTo(26,0,72,0,83,12);c.bezierCurveTo(91,29,38,30,5,16);c.fill();c.strokeStyle='rgba(147,164,139,.6)';c.lineWidth=.8;c.stroke();
  line([[6,16],[74,13]],'rgba(151,171,143,.65)',.8);line([[26,15],[44,7],[60,15],[71,22]],'rgba(151,171,143,.45)',.6);c.restore();
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
  const result={grass:frame(0,0,96,160),dragon:frame(128,0,96,32),wing:frame(128,48,96,32),hindwing:frame(128,96,96,32),bee:frame(128,176,96,48),beeWing:frame(256,96,96,32),shrimp:frame(256,0,96,48),petal:frame(384,0,32,48)};
  cache.set(style,result);return result;
}
