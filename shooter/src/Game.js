import Phaser from 'phaser';
import { laserActive } from './lasers.js';
import { createGame, createCheckpoint, tick, bomb, snapshot, WIDTH, HEIGHT, STAGES } from './model.js';
export function mountGame(parent,onChange,entry=null){
  const freshGame=()=>entry?createCheckpoint(entry):createGame();
  let gameState=freshGame(),sceneRef=null;
  const controller={
    start(){const autoFire=gameState.autoFire;gameState=freshGame();gameState.autoFire=autoFire;gameState.status='playing';sceneRef?.input.keyboard.resetKeys();onChange(snapshot(gameState));},
    pause(){if(gameState.status==='playing'||gameState.status==='transition'){gameState.previousStatus=gameState.status;gameState.status='paused';}else if(gameState.status==='paused')gameState.status=gameState.previousStatus||'playing';sceneRef?.input.keyboard.resetKeys();onChange(snapshot(gameState));},
    setInputEnabled(enabled){if(sceneRef){sceneRef.input.keyboard.resetKeys();sceneRef.input.keyboard.enabled=enabled;}},
    bomb(){bomb(gameState);},toggleAuto(){gameState.autoFire=!gameState.autoFire;onChange(snapshot(gameState));},
    destroy(){window.removeEventListener('blur',blur);game.destroy(true);}
  };
  class FlightScene extends Phaser.Scene{
    constructor(){super('flight');}
    create(){sceneRef=this;this.g=this.add.graphics();this.keys=this.input.keyboard.addKeys({up:'W',down:'S',left:'A',right:'D',up2:'UP',down2:'DOWN',left2:'LEFT',right2:'RIGHT',fire:'SPACE',fire2:'Z',focus:'SHIFT'});this.input.keyboard.on('keydown-P',()=>controller.pause());this.input.keyboard.on('keydown-ESC',()=>controller.pause());this.input.keyboard.on('keydown-X',()=>controller.bomb());this.uiTime=0;this.bgTime=0;this.accumulator=0;this.lastStatus=null;this.stars=Array.from({length:95},(_,i)=>({x:(i*137.39)%WIDTH,y:(i*83.74)%HEIGHT,size:i%4===0?1.8:.8,speed:15+i%5*12}));onChange(snapshot(gameState));}
    update(_, delta) {
      const dt = Math.min(delta / 1000, .05);
      this.bgTime += dt;
      const k = this.keys, pointer = this.input.activePointer;
      const input = {
        x: (k.right.isDown || k.right2.isDown ? 1 : 0) - (k.left.isDown || k.left2.isDown ? 1 : 0),
        y: (k.down.isDown || k.down2.isDown ? 1 : 0) - (k.up.isDown || k.up2.isDown ? 1 : 0),
        fire: k.fire.isDown || k.fire2.isDown, focus: k.focus.isDown,
      };
      if (pointer.isDown && pointer.downElement === this.game.canvas) input.target = { x: pointer.x, y: pointer.y - 28 };
      // The attack clock and collisions use a fixed step, independent of rendering.
      this.accumulator += dt;
      while (this.accumulator >= 1 / 60) {
        tick(gameState, 1 / 60, input);
        this.accumulator -= 1 / 60;
      }
      this.draw(gameState);
      this.uiTime += dt;
      if (this.uiTime > .08 || gameState.status !== this.lastStatus) {
        this.uiTime = 0; this.lastStatus = gameState.status; onChange(snapshot(gameState));
      }
    }

    polygon(points,color,alpha=1,lineColor){this.g.fillStyle(color,alpha);this.g.fillPoints(points,true);if(lineColor){this.g.lineStyle(1,lineColor,.8);this.g.strokePoints(points,true);}}
    ship(x,y,scale=1,enemy=false,color=0x8ae9ed){const dir=enemy?-1:1;const points=[{x,y:y-22*scale*dir},{x:x+6*scale,y:y-4*scale*dir},{x:x+20*scale,y:y+13*scale*dir},{x:x+7*scale,y:y+9*scale*dir},{x,y:y+17*scale*dir},{x:x-7*scale,y:y+9*scale*dir},{x:x-20*scale,y:y+13*scale*dir},{x:x-6*scale,y:y-4*scale*dir}];this.polygon(points,enemy?0x374358:0xc4e4e8,1,color);this.polygon([{x,y:y-11*scale*dir},{x:x+4*scale,y:y+5*scale*dir},{x:x-4*scale,y:y+5*scale*dir}],color);this.g.fillStyle(enemy?0xff7d7d:0x85edff,.7);this.g.fillTriangle(x-4*scale,y+15*scale*dir,x+4*scale,y+15*scale*dir,x,y+(25+Math.sin(this.bgTime*40)*8)*scale*dir);}
    draw(s){const g=this.g,stage=STAGES[s.stage],t=this.bgTime;g.clear();g.fillStyle(stage.background);g.fillRect(0,0,WIDTH,HEIGHT);
      // Parallax dust, orbital arcs and scrolling navigation lanes.
      g.lineStyle(1,stage.rgb,.07);for(let i=0;i<8;i++){const y=(i*120+t*22)%960-120;g.strokeEllipse(240,y,620,220);}for(const x of [45,435])g.lineBetween(x,0,x,HEIGHT);
      for(const star of this.stars){g.fillStyle(stage.rgb,star.size>1?.55:.28);g.fillRect(star.x,(star.y+t*star.speed)%HEIGHT,star.size,star.size+(s.status==='playing'?star.speed*.05:0));}
      g.lineStyle(1,stage.rgb,.14);for(let i=0;i<5;i++){const y=(i*190+t*36)%950-100;g.strokeRect(8,y,22,80);g.strokeRect(450,y,22,80);g.lineBetween(15,y+10,23,y+10);g.lineBetween(457,y+60,465,y+60);}
      if(s.stage===1){g.lineStyle(2,0xffa973,.12);g.strokeCircle(-90,250,240);g.strokeCircle(-90,250,260);}if(s.stage===2){g.lineStyle(1,0xc8a1ff,.12);g.strokeCircle(390,130,135);g.strokeCircle(390,130,150);}
      // Warnings show the locked line/origin before the first shot. Gate edges
      // identify the entry to a narrow corridor; they are never damaging.
      for(const cue of s.cues){
        const progress=1-cue.life/cue.maxLife;
        g.lineStyle(1,cue.color,.15+progress*.3);
        if(cue.pattern==='gate'){
          const half=cue.hard?26:44;
          g.lineStyle(1,0xa6eef0,.2+progress*.3);
          for(const edge of [cue.gapX-half,cue.gapX+half]){
            for(let y=10;y<HEIGHT;y+=24)g.lineBetween(edge,y,edge,y+10);
          }
          g.lineBetween(cue.gapX-half,18,cue.gapX+half,18);
        }else if(cue.pattern==='cage'){
          g.strokeCircle(cue.x,cue.y,cue.radius);
        }else if(cue.pattern==='stream'){
          const angle=Math.atan2(cue.targetY-cue.y,cue.targetX-cue.x);
          const length=900;
          g.lineBetween(cue.x,cue.y,cue.x+Math.cos(angle)*length,cue.y+Math.sin(angle)*length);
          g.strokeCircle(cue.targetX,cue.targetY,10);
        }else if(cue.pattern==='weave'){
          g.lineBetween(8,10,WIDTH-8,10);
        }else{
          g.strokeCircle(cue.x,cue.y,12+progress*20);
          g.strokeCircle(cue.x,cue.y,35-progress*15);
        }
      }
      for (const laser of s.lasers) {
        const active = laserActive(laser);
        const warning = laser.age < laser.warning;
        if (warning) {
          g.lineStyle(1, laser.color, .25 + .4 * laser.age / laser.warning);
          g.lineBetween(laser.x1, laser.y1, laser.x2, laser.y2);
          g.lineStyle(1, laser.color, .7);
          g.strokeCircle(laser.x1, laser.y1, 8);
        } else {
          const opacity = active ? 1 : Math.max(0, 1 - (laser.age - laser.warning - laser.duration) / laser.fade);
          g.lineStyle(laser.width + 8, laser.color, .12 * opacity);
          g.lineBetween(laser.x1, laser.y1, laser.x2, laser.y2);
          g.lineStyle(laser.width, laser.color, .85 * opacity);
          g.lineBetween(laser.x1, laser.y1, laser.x2, laser.y2);
          g.lineStyle(2, 0xf4fcff, opacity);
          g.lineBetween(laser.x1, laser.y1, laser.x2, laser.y2);
        }
      }
      for(const item of s.pickups){const color=item.kind==='power'?0xa4e9b2:0xffa7b1;g.fillStyle(color,.13);g.fillCircle(item.x,item.y,20);g.lineStyle(1,color,.8);g.strokeCircle(item.x,item.y,12);g.lineStyle(3,color);g.lineBetween(item.x-5,item.y,item.x+5,item.y);if(item.kind==='health')g.lineBetween(item.x,item.y-5,item.x,item.y+5);else{g.lineBetween(item.x-5,item.y+4,item.x,item.y-4);g.lineBetween(item.x,item.y-4,item.x+5,item.y+4);}}
      for(const shot of s.shots){g.fillStyle(0x86eeff,.12);g.fillRoundedRect(shot.x-5,shot.y-12,10,27,5);g.fillStyle(0xc1fbff);g.fillRoundedRect(shot.x-1.5,shot.y-10,3,19,2);}
      for(const e of s.enemies){if(e.kind==='tank'){this.polygon([{x:e.x-24,y:e.y-15},{x:e.x+24,y:e.y-15},{x:e.x+19,y:e.y+18},{x:e.x,y:e.y+25},{x:e.x-19,y:e.y+18}],0x484655,1,stage.rgb);g.fillStyle(0xffa9a9);g.fillRect(e.x-10,e.y,20,4);}else this.ship(e.x,e.y,e.kind==='runner'?.75:.9,true,s.stage===0?0xffb39c:0xe5a1ea);}
      if(s.boss){const b=s.boss,c=[stage.rgb,0xff96ba,0x91e9ff,0xffd88c][b.phase-1];g.fillStyle(c,.035);g.fillCircle(b.x,b.y,85+Math.sin(t*2)*8);this.polygon([{x:b.x-65,y:b.y-24},{x:b.x-30,y:b.y-45},{x:b.x,y:b.y-26},{x:b.x+30,y:b.y-45},{x:b.x+65,y:b.y-24},{x:b.x+52,y:b.y+30},{x:b.x+23,y:b.y+16},{x:b.x,y:b.y+52},{x:b.x-23,y:b.y+16},{x:b.x-52,y:b.y+30}],b.hit?0xa8a4ae:0x37384f,1,c);g.lineStyle(2,c,.8);g.strokeCircle(b.x,b.y,22);g.fillStyle(c);g.fillCircle(b.x,b.y,9+Math.sin(t*7)*2);for(const dx of [-43,43]){g.fillStyle(c,.9);g.fillRect(b.x+dx-3,b.y+12,6,18);}}
      for(const b of s.bullets){g.fillStyle(b.color,.16);g.fillCircle(b.x,b.y,b.radius+2);g.fillStyle(b.color,b.age<(b.wait||0)?.3:1);g.fillCircle(b.x,b.y,b.radius);g.fillStyle(0xfff4fa);g.fillCircle(b.x,b.y,1.4);}
      const p=s.player;if(s.status!=='lost'&&(p.invincible<=0||Math.floor(t*15)%2===0)){g.fillStyle(0x7ce6e9,.05);g.fillCircle(p.x,p.y,34);this.ship(p.x,p.y,1,false);g.fillStyle(0xffffff);g.fillCircle(p.x,p.y,3);if(this.keys.focus.isDown){g.lineStyle(1,0xb9f8ff,.6);g.strokeCircle(p.x,p.y,12);}if(p.invincible>0){g.lineStyle(1,0x9cefff,.6);g.strokeCircle(p.x,p.y,28);}}
      for(const pt of s.particles){g.fillStyle(pt.color,Math.max(0,pt.life/pt.max));g.fillCircle(pt.x,pt.y,pt.size*(pt.life/pt.max+.3));}
      if(s.flash>0){g.fillStyle(stage.rgb,Math.min(.5,s.flash*.6));g.fillRect(0,0,WIDTH,HEIGHT);}if(s.shake>0){g.setPosition(Math.sin(t*87)*s.shake*8,Math.cos(t*61)*s.shake*7);}else g.setPosition(0,0);
      g.fillStyle(0x000000,.06);for(let y=0;y<HEIGHT;y+=4)g.fillRect(0,y,WIDTH,1);
    }
  }
  const game=new Phaser.Game({type:Phaser.AUTO,parent,width:WIDTH,height:HEIGHT,backgroundColor:'#071b2b',scene:FlightScene,render:{antialias:true,roundPixels:false},scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},input:{keyboard:true,touch:true},audio:{noAudio:true}});
  function blur(){if(gameState.status==='playing'||gameState.status==='transition')controller.pause();}
  window.addEventListener('blur',blur);
  return controller;
}
