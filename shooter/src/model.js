export const WIDTH = 480, HEIGHT = 720, WAVE_SECONDS = 25;
export const STAGES = [
  { name: 'STAGE 1', color: '#7ce6e9', rgb: 0x7ce6e9, background: 0x071b2b },
  { name: 'STAGE 2', color: '#ffbe77', rgb: 0xffbe77, background: 0x291b26 },
  { name: 'STAGE 3', color: '#c8a1ff', rgb: 0xc8a1ff, background: 0x1c1534 },
];
export function createGame(random = Math.random) {
  return { status: 'ready', stage: 0, time: 0, totalTime: 0, player: { x: WIDTH/2, y: HEIGHT-100, hp: 5, maxHp: 5, power: 1, invincible: 0 },
    enemies: [], bullets: [], shots: [], particles: [], pickups: [], boss: null, bossSpawned: false, score: 0, kills: 0, bombs: 2,
    shotTimer: 0, spawnTimer: .4, id: 0, wave: 0, random, shake: 0, flash: 0, transition: 0, shotsFired: 0, hits: 0, autoFire: true };
}
const clamp = (n,min,max)=>Math.min(max,Math.max(min,n));
export function explosion(s,x,y,color=0xffbe77,count=20){
  for(let i=0;i<count;i++){const a=s.random()*Math.PI*2,v=30+s.random()*160;s.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.35+s.random()*.4,max:.75,color,size:1+s.random()*3});}
  if(s.particles.length>400)s.particles.splice(0,s.particles.length-400);
}
function bullet(s,x,y,angle,speed,size=4,color=0xff8c95){s.bullets.push({id:++s.id,x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,radius:size,color});}
function aimed(s,x,y,count=1,spread=.18,speed=145){const a=Math.atan2(s.player.y-y,s.player.x-x);for(let i=0;i<count;i++)bullet(s,x,y,a+(i-(count-1)/2)*spread,speed);}
function damage(s,amount){const p=s.player;if(p.invincible>0)return;p.hp=Math.max(0,p.hp-amount);p.invincible=1.5;s.shake=.3;explosion(s,p.x,p.y,0x9eeeff,14);if(!p.hp)s.status='lost';}
function spawnWave(s){
  s.wave++;
  const count=s.stage===0?3:4;
  for(let i=0;i<count;i++){
    const kind=s.stage===0?(s.wave%3===0?'fighter':'scout'):s.stage===1?(s.wave%3===0?'tank':i%2?'fighter':'scout'):(i===0?'tank':i%2?'fighter':'runner');
    const x=60+i*(360/Math.max(1,count-1));
    s.enemies.push({id:++s.id,x,baseX:x,y:-40-i*35,age:0,kind,hp:kind==='tank'?12:kind==='fighter'?5:3,radius:kind==='tank'?23:16,fire:1.1+i*.3,speed:kind==='runner'?115:kind==='tank'?42:70+s.stage*12});
  }
}
function spawnBoss(s){const maxHp=[240,360,520][s.stage];s.boss={x:240,y:-80,hp:maxHp,maxHp,age:0,fire:1.3,phase:1,radius:57,hit:0};s.bossSpawned=true;s.bullets=[];s.enemies=[];s.flash=.35;}
export function bomb(s){if(s.status!=='playing'||s.bombs<=0)return false;s.bombs--;s.bullets=[];s.player.invincible=2;s.flash=.65;s.shake=.4;for(const e of s.enemies)e.hp-=30;if(s.boss)s.boss.hp=Math.max(0,s.boss.hp-70);explosion(s,s.player.x,s.player.y,0xa6f5ff,70);return true;}
function nextStage(s){s.score+=2500*(s.stage+1);explosion(s,s.boss.x,s.boss.y,STAGES[s.stage].rgb,100);s.boss=null;s.bullets=[];s.shots=[];s.shake=.7;s.flash=.7;if(s.stage===2)s.status='won';else{s.status='transition';s.transition=3;}}
export function tick(s,dt,input={}){
  if(!['playing','transition'].includes(s.status))return;
  dt=Math.min(dt,.05);s.shake=Math.max(0,s.shake-dt);s.flash=Math.max(0,s.flash-dt);
  for(const p of s.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.98;p.vy*=.98;p.life-=dt;}
  s.particles=s.particles.filter(p=>p.life>0);
  if(s.status==='transition'){s.transition-=dt;if(s.transition<=0){s.stage++;s.time=0;s.bossSpawned=false;s.status='playing';s.spawnTimer=.6;s.player.hp=Math.min(s.player.maxHp,s.player.hp+1);s.bombs=Math.min(3,s.bombs+1);s.pickups=[];}return;}
  s.time+=dt;s.totalTime+=dt;const p=s.player;p.invincible=Math.max(0,p.invincible-dt);
  if(input.target){p.x+=clamp(input.target.x-p.x,-340*dt,340*dt);p.y+=clamp(input.target.y-p.y,-340*dt,340*dt);}else{let x=input.x||0,y=input.y||0;const d=Math.max(1,Math.hypot(x,y));const speed=input.focus?155:300;p.x+=x/d*speed*dt;p.y+=y/d*speed*dt;}
  p.x=clamp(p.x,20,WIDTH-20);p.y=clamp(p.y,55,HEIGHT-28);
  s.shotTimer-=dt;
  if((s.autoFire||input.fire)&&s.shotTimer<=0){s.shotTimer=.14;const angles=p.power===1?[0]:p.power===2?[-.055,.055]:[-.11,0,.11];for(const angle of angles){s.shots.push({id:++s.id,x:p.x,y:p.y-20,vx:Math.sin(angle)*520,vy:-Math.cos(angle)*520,radius:4,damage:2});s.shotsFired++;}}
  if(s.time<WAVE_SECONDS){s.spawnTimer-=dt;if(s.spawnTimer<=0){spawnWave(s);s.spawnTimer=[3.0,2.6,2.2][s.stage];}}
  else if(!s.bossSpawned)spawnBoss(s);
  for(const e of s.enemies){e.age+=dt;e.y+=e.speed*dt;e.fire-=dt;e.x=e.baseX+Math.sin(e.age*(e.kind==='runner'?3:1.6)+e.id)* (e.kind==='tank'?30:45);if(e.fire<=0&&e.y>10&&e.y<550){aimed(s,e.x,e.y,e.kind==='tank'?3:s.stage===2?2:1,.22,120+s.stage*25);e.fire=e.kind==='fighter'?1.3:2;}if(Math.hypot(e.x-p.x,e.y-p.y)<e.radius+8){damage(s,1);e.hp=0;}}
  s.enemies=s.enemies.filter(e=>e.y<HEIGHT+60);
  if(s.boss){const b=s.boss;b.age+=dt;b.y=Math.min(125,b.y+70*dt);b.x=WIDTH/2+Math.sin(b.age*.8)*(s.stage===2?125:95);b.phase=b.hp<=b.maxHp*.5?2:1;b.hit=Math.max(0,b.hit-dt);b.fire-=dt;
    if(b.y>=100&&b.fire<=0){
      if(b.phase===1){aimed(s,b.x,b.y+45,3+s.stage*2,.19,145+s.stage*12);if(s.stage>0){bullet(s,b.x-45,b.y+15,Math.PI/2,130);bullet(s,b.x+45,b.y+15,Math.PI/2,130);}}
      else{const count=9+s.stage*3;const rotation=b.age*.5;for(let i=0;i<count;i++)bullet(s,b.x,b.y+25,rotation+i*Math.PI*2/count,100+s.stage*15,4,0xffba72);aimed(s,b.x,b.y+45,3,.23,175+s.stage*10);}
      b.fire=b.phase===1?.95:.85;
    }
    if(Math.hypot(b.x-p.x,b.y-p.y)<b.radius+10)damage(s,1);
  }
  for(const shot of s.shots){shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;if(shot.dead)continue;for(const e of s.enemies){if(e.hp>0&&Math.hypot(e.x-shot.x,e.y-shot.y)<e.radius+shot.radius){e.hp-=shot.damage;shot.dead=true;s.hits++;explosion(s,shot.x,shot.y,0x9eeeff,3);break;}}
    if(!shot.dead&&s.boss&&Math.hypot(s.boss.x-shot.x,s.boss.y-shot.y)<s.boss.radius+shot.radius){s.boss.hp-=shot.damage;s.boss.hit=.06;shot.dead=true;s.hits++;explosion(s,shot.x,shot.y,0xffd29c,2);}}
  s.shots=s.shots.filter(b=>!b.dead&&b.y>-25&&b.x>-10&&b.x<WIDTH+10);
  for(const b of s.bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;if(Math.hypot(b.x-p.x,b.y-p.y)<b.radius+6){damage(s,1);b.dead=true;}}
  s.bullets=s.bullets.filter(b=>!b.dead&&b.x>-30&&b.x<WIDTH+30&&b.y>-100&&b.y<HEIGHT+30);
  for(const e of s.enemies.filter(e=>e.hp<=0)){s.kills++;s.score+=e.kind==='tank'?250:100;explosion(s,e.x,e.y,STAGES[s.stage].rgb);if(s.kills%5===0)s.pickups.push({id:++s.id,x:e.x,y:e.y,kind:s.kills%15===0?'health':'power'});}
  s.enemies=s.enemies.filter(e=>e.hp>0);
  for(const item of s.pickups){item.y+=70*dt;if(Math.hypot(item.x-p.x,item.y-p.y)<28){item.dead=true;if(item.kind==='health')p.hp=Math.min(p.maxHp,p.hp+1);else{p.power=Math.min(3,p.power+1);s.score+=100;}explosion(s,item.x,item.y,0xaff5cc,15);}}
  s.pickups=s.pickups.filter(i=>!i.dead&&i.y<HEIGHT+25);
  if(s.boss?.hp<=0&&s.status==='playing')nextStage(s);
}
export function snapshot(s){return {status:s.status,stage:s.stage,time:s.time,totalTime:s.totalTime,hp:s.player.hp,power:s.player.power,score:s.score,kills:s.kills,bombs:s.bombs,autoFire:s.autoFire,boss:s.boss?{hp:Math.max(0,s.boss.hp),maxHp:s.boss.maxHp,phase:s.boss.phase}:null,accuracy:s.shotsFired?Math.round(s.hits/s.shotsFired*100):0};}
