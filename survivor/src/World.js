import * as THREE from 'three';
import { createRun, tick, snapshot, chooseUpgrade, UPGRADES, terrainHeight } from './model.js';
import { OBSTACLES, HILLS, SUPPLIES, isHighGround, isMud, segmentBlocked } from './field.js';
export class World {
  constructor(container, onChange, onError) {
    this.container = container; this.onChange = onChange; this.state = createRun(); this.keys = new Set(); this.touch = {x:0,z:0}; this.objects = new Map(); this.resources = new Set(); this.uiTimer = 0; this.covers = []; this.sightRay = new THREE.Ray();
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#bccbb8'); this.scene.fog = new THREE.Fog('#bccbb8', 38, 85);
    this.camera = new THREE.PerspectiveCamera(42, 1, .1, 160);
    this.camera.position.set(0,24,23);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement); this.renderer.domElement.setAttribute('aria-label','起伏のある3Dフィールド。WASDで移動し、敵を自動攻撃します。');
    this.scene.add(new THREE.HemisphereLight('#f4ffe7','#41564b',1.8));
    this.sun = new THREE.DirectionalLight('#fff2cc',2.2); this.sun.position.set(-14,30,14); this.sun.castShadow=true; this.sun.shadow.mapSize.set(1024,1024); Object.assign(this.sun.shadow.camera,{left:-38,right:38,top:38,bottom:-38,far:100}); this.sun.shadow.bias=-.001; this.scene.add(this.sun);
    this.buildTerrain(); this.player = this.makePlayer(); this.scene.add(this.player);
    this.rangeRing = this.mesh(new THREE.RingGeometry(.8,.86,32), '#f0ffd5', {emissive:'#f0ffd5',emissiveIntensity:1,depthTest:false,depthWrite:false}); this.rangeRing.castShadow=false; this.rangeRing.material.transparent=true; this.rangeRing.material.opacity=.6; this.rangeRing.material.side=THREE.DoubleSide; this.rangeRing.renderOrder=10; this.rangeRing.rotation.x=-Math.PI/2; this.scene.add(this.rangeRing);

    this.down = e => { if (this.state.status === 'upgrade' && ['Digit1','Digit2','Digit3'].includes(e.code) && !e.repeat) { e.preventDefault(); this.upgrade(UPGRADES[Number(e.code.at(-1))-1].id); return; } if (document.querySelector('dialog[open]')) return; if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Escape','KeyP'].includes(e.code) && !['BUTTON','INPUT'].includes(e.target.tagName)) e.preventDefault(); if (!e.repeat && ['Escape','KeyP'].includes(e.code)) this.pause(); this.keys.add(e.code); };
    this.up = e => this.keys.delete(e.code);
    this.blur = () => { this.keys.clear(); this.touch = {x:0,z:0}; if(this.state.status==='playing')this.pause(); };
    this.contextLost = e => { e.preventDefault(); this.blur(); onError('3D描画が中断されました。ページを再読み込みしてください。'); };
    window.addEventListener('keydown',this.down); window.addEventListener('keyup',this.up); window.addEventListener('blur',this.blur); this.renderer.domElement.addEventListener('webglcontextlost',this.contextLost);
    this.resize = new ResizeObserver(()=>{const {clientWidth:w,clientHeight:h}=container;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}); this.resize.observe(container);
    this.accumulator = 0; this.last = performance.now(); this.renderer.setAnimationLoop(now=>this.frame(now)); onChange(snapshot(this.state));
  }
  mesh(geometry, color, extra={}) {
    this.resources.add(geometry); const material=new THREE.MeshStandardMaterial({color,flatShading:true,roughness:.9,...extra}); this.resources.add(material); const m=new THREE.Mesh(geometry,material); m.castShadow=true;m.receiveShadow=true;return m;
  }
  buildTerrain() {
    const geo = new THREE.PlaneGeometry(76,76,100,100); geo.rotateX(-Math.PI/2);
    const pos=geo.attributes.position, colors=[];
    for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);pos.setY(i,terrainHeight(x,z));const h=terrainHeight(x,z);const c=new THREE.Color(isMud(x,z)?'#70664b':isHighGround(x,z)?'#b2bd85':h>1?'#819265':'#758765');c.multiplyScalar(.97+Math.sin(x*.7+z*.5)*.035);colors.push(c.r,c.g,c.b);}
    const old=geo.index.array, indices=[];for(let i=0;i<old.length;i+=3){if([old[i],old[i+1],old[i+2]].every(j=>Math.hypot(pos.getX(j),pos.getZ(j))<37))indices.push(old[i],old[i+1],old[i+2]);}
    geo.setIndex(indices);geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();this.scene.add(this.mesh(geo,'#ffffff',{vertexColors:true}));
    const base=this.mesh(new THREE.CylinderGeometry(36,31,6,64),'#566456');base.position.y=-4;this.scene.add(base);
    const rim=this.mesh(new THREE.TorusGeometry(29.5,.045,4,100),'#d8e5b3',{emissive:'#7c9a51',emissiveIntensity:.6});rim.rotation.x=Math.PI/2;rim.position.y=1.3;this.scene.add(rim);
    for(let i=0;i<50;i++){
      const a=i*2.39996,r=32+Math.sin(i*7)*1.5;const x=Math.cos(a)*r,z=Math.sin(a)*r;
      const group=new THREE.Group();const height=2.1+(i%4)*.55;
      if(i%4===0){const rock=this.mesh(new THREE.DodecahedronGeometry(1+(i%3)*.4,0),'#91a087');rock.scale.y=.65;group.add(rock);}
      else{const trunk=this.mesh(new THREE.CylinderGeometry(.12,.2,height,5),'#655c44');trunk.position.y=height/2;group.add(trunk);for(let j=0;j<3;j++){const leaves=this.mesh(new THREE.ConeGeometry(1.3-j*.26,1.9,5),i%3===0?'#c7a47b':j%2?'#60785a':'#76916a');leaves.position.y=height-1+j*.6;leaves.rotation.y=i;group.add(leaves);}}
      group.position.set(x,terrainHeight(x,z),z);this.scene.add(group);
    }
    for(let i=0;i<60;i++){const x=Math.sin(i*8.13)*28,z=Math.cos(i*4.78)*28;if(Math.hypot(x,z)>29)continue;const flower=this.mesh(new THREE.ConeGeometry(.16,.5,4),i%2?'#e6dba3':'#dad8b6');flower.castShadow=false;flower.position.set(x,terrainHeight(x,z)+.25,z);this.scene.add(flower);}
    for (const o of OBSTACLES) {
      const wall=this.mesh(new THREE.BoxGeometry(o.width,o.height,o.depth),'#9ea99a');
      wall.position.set(o.x,terrainHeight(o.x,o.z)+o.height/2,o.z);this.scene.add(wall);
      const cap=this.mesh(new THREE.BoxGeometry(o.width+.03,.15,o.depth+.03),'#bdc7ae');
      cap.position.set(o.x,terrainHeight(o.x,o.z)+o.height+.075,o.z);this.scene.add(cap);
      const bottom=terrainHeight(o.x,o.z);
      this.covers.push({meshes:[wall,cap],bounds:new THREE.Box3(new THREE.Vector3(o.x-o.width/2,bottom,o.z-o.depth/2),new THREE.Vector3(o.x+o.width/2,bottom+o.height+.15,o.z+o.depth/2))});
    }
    for (const h of HILLS) {
      const top=this.mesh(new THREE.RingGeometry(4.12,4.2,64),'#e8dda4',{transparent:true,opacity:.65});
      top.rotation.x=-Math.PI/2;top.position.set(h.x,terrainHeight(h.x,h.z)+.22,h.z);top.castShadow=false;this.scene.add(top);
    }
    for (const spot of SUPPLIES) {
      const marker=this.mesh(new THREE.RingGeometry(1.35,1.5,32),'#efc981');marker.rotation.x=-Math.PI/2;
      marker.position.set(spot.x,terrainHeight(spot.x,spot.z)+.05,spot.z);marker.castShadow=false;this.scene.add(marker);
    }
  }
  makeWarning() {
    const group=new THREE.Group();
    const ring=this.mesh(new THREE.RingGeometry(.85,1.05,24),'#ffc08a',{emissive:'#ff8040',emissiveIntensity:.6,side:THREE.DoubleSide});ring.rotation.x=-Math.PI/2;ring.castShadow=false;group.add(ring);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(5*2*16*3),3));
    const material=new THREE.LineBasicMaterial({color:'#ffaf81',transparent:true,opacity:.9});this.resources.add(geometry);this.resources.add(material);
    group.add(new THREE.LineSegments(geometry,material));return group;
  }
  updateWarning(group,e,s) {
    group.children[0].position.set(e.x,terrainHeight(e.x,e.z)+.12,e.z);
    group.children[0].scale.setScalar(e.warmup>0?1+e.warmup:1);
    const geometry=group.children[1].geometry,positions=geometry.attributes.position;let count=0;
    group.children[1].material.color.set(e.windup<=.35?'#ff6655':'#ffcf88');
    if(e.windup>0)for(const offset of e.type==='ranger'&&s.phase===2?[-.36,-.18,0,.18,.36]:e.type==='ranger'&&s.phase?[-.18,0,.18]:[0]) {
      const angle=Math.atan2(e.aimZ,e.aimX)+offset,range=e.type==='runner'?13.3:20;
      for(let j=0;j<16;j++) {
        const x=e.x+Math.cos(angle)*range*j/16,z=e.z+Math.sin(angle)*range*j/16;
        const tx=e.x+Math.cos(angle)*range*(j+1)/16,tz=e.z+Math.sin(angle)*range*(j+1)/16;
        if(segmentBlocked(x,z,tx,tz,.1))break;
        positions.setXYZ(count++,x,terrainHeight(x,z)+.12,z);positions.setXYZ(count++,tx,terrainHeight(tx,tz)+.12,tz);
      }
    }
    geometry.setDrawRange(0,count);positions.needsUpdate=true;geometry.computeBoundingSphere();
  }

  makePlayer(){
    const g=new THREE.Group();const body=this.mesh(new THREE.ConeGeometry(.5,1.1,6),'#f0ead1');body.position.y=.75;g.add(body);
    const head=this.mesh(new THREE.IcosahedronGeometry(.35,0),'#2b5351');head.position.y=1.5;g.add(head);
    const hood=this.mesh(new THREE.ConeGeometry(.43,.6,5),'#e7e4c8');hood.position.y=1.85;hood.rotation.z=-.2;g.add(hood);
    const scarf=this.mesh(new THREE.BoxGeometry(.6,.17,.27),'#dc855e');scarf.position.set(0,1.22,.27);g.add(scarf);
    const staff=this.mesh(new THREE.CylinderGeometry(.045,.045,1.7,5),'#795d42');staff.position.set(.6,.85,0);g.add(staff);
    const gem=this.mesh(new THREE.OctahedronGeometry(.19),'#dfffad',{emissive:'#bdff7c',emissiveIntensity:1});gem.position.set(.6,1.8,0);g.add(gem);
    return g;
  }
  enemyMesh(e){const g=new THREE.Group();const color=e.type==='brute'?'#9b5140':e.type==='runner'?'#d98b51':e.type==='ranger'?'#557fbb':'#b96772';const body=this.mesh(e.type==='runner'?new THREE.OctahedronGeometry(.65):new THREE.IcosahedronGeometry(e.radius,0),color);body.position.y=e.radius+.2;g.add(body);for(const x of [-.22,.22]){const eye=this.mesh(new THREE.BoxGeometry(.12,.12,.1),'#ffecd0',{emissive:'#ffbd81',emissiveIntensity:1});eye.position.set(x,e.radius+.25,.5);g.add(eye);}return g;}
  sync(items,prefix,make,update){const alive=new Set(items.map(i=>prefix+i.id));for(const [key,obj] of this.objects){if(key.startsWith(prefix)&&!alive.has(key)){this.scene.remove(obj);obj.traverse(child=>{if(child.geometry&&child.material){child.geometry.dispose();this.resources.delete(child.geometry);child.material.dispose();this.resources.delete(child.material);}});this.objects.delete(key);}}
    for(const item of items){const key=prefix+item.id;let obj=this.objects.get(key);if(!obj){obj=make(item);if(prefix==='shot'||prefix==='particle'||prefix==='item')obj.traverse(child=>{child.castShadow=false;child.receiveShadow=false;});this.objects.set(key,obj);this.scene.add(obj);}update(obj,item);}}
  frame(now){const dt=Math.min((now-this.last)/1000,.05);this.last=now;const s=this.state;
    const input={x:(this.keys.has('KeyD')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('KeyA')||this.keys.has('ArrowLeft')?1:0)+this.touch.x,z:(this.keys.has('KeyS')||this.keys.has('ArrowDown')?1:0)-(this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:0)+this.touch.z,dash:this.keys.has('Space')||this.touch.dash};
    // Match the evaluator's physics step regardless of the rendering frame rate.
    this.accumulator += dt;
    while(this.accumulator >= 1/60) { tick(s,1/60,input); this.accumulator -= 1/60; }
    const p=s.player,t=s.status==='ready'?now/1000:s.time;
    this.player.position.set(p.x,terrainHeight(p.x,p.z)+Math.sin(t*6)*.045,p.z);this.player.rotation.y=p.angle;this.player.visible=p.invincible<=0||Math.floor(now/65)%2===0;
    this.rangeRing.position.set(p.x,terrainHeight(p.x,p.z)+.05,p.z);this.rangeRing.material.opacity=.6;
    const zoom=Math.max(1,Math.min(1.7,1/this.camera.aspect));const target=new THREE.Vector3(p.x*.84,23*zoom+terrainHeight(p.x,p.z),p.z*.84+23*zoom);this.camera.position.lerp(target,1-Math.exp(-dt*4));this.camera.lookAt(p.x*.84,0,p.z*.84-1.5);
    const bodyPosition=new THREE.Vector3(p.x,terrainHeight(p.x,p.z)+.8,p.z),sight=bodyPosition.clone().sub(this.camera.position),distance=sight.length(),intersection=new THREE.Vector3();
    this.sightRay.set(this.camera.position,sight.normalize());
    for(const cover of this.covers) {
      const occluded=this.sightRay.intersectBox(cover.bounds,intersection)!==null&&intersection.distanceTo(this.camera.position)<distance;
      for(const mesh of cover.meshes) {mesh.material.transparent=occluded;mesh.material.opacity=occluded?.28:1;mesh.material.depthWrite=!occluded;}
    }
    this.sync(s.enemies,'enemy',e=>this.enemyMesh(e),(o,e)=>{o.position.set(e.x,terrainHeight(e.x,e.z)+Math.abs(Math.sin(t*7+e.id))*.1,e.z);o.rotation.y=Math.atan2(p.x-e.x,p.z-e.z);o.scale.setScalar(e.warmup>0?.45:e.hit?1.15:1);o.rotation.z=e.stunned>0?Math.sin(t*18)*.3:0;});
    this.sync(s.shots,'shot',()=>this.mesh(new THREE.IcosahedronGeometry(.2,0),'#e7ffc3',{emissive:'#b7f87a',emissiveIntensity:1}),(o,b)=>{o.position.set(b.x,terrainHeight(b.x,b.z)+1,b.z);o.scale.set(1,1,1.6);});
    this.sync(s.items,'item',i=>this.mesh(i.kind==='upgrade'?new THREE.OctahedronGeometry(.65):new THREE.OctahedronGeometry(i.kind==='xp'?.18:.35),i.kind==='upgrade'?'#ffcf7d':i.kind==='health'?'#ffa5a1':'#b9ecbb',{emissive:i.kind==='upgrade'?'#df9c42':'#80c591',emissiveIntensity:.4}),(o,i)=>{o.position.set(i.x,terrainHeight(i.x,i.z)+.55+Math.sin(t*3+i.id)*.15,i.z);o.rotation.y=t*1.4;});
    this.sync(s.particles,'particle',pt=>this.mesh(new THREE.BoxGeometry(.13,.13,.13),pt.color),(o,pt)=>{o.position.set(pt.x,terrainHeight(pt.x,pt.z)+Math.max(.05,pt.y),pt.z);o.scale.setScalar(pt.life/.7);});
    this.sync(s.bolts,'bolt',()=>this.mesh(new THREE.IcosahedronGeometry(.27,0),'#ffb69a',{emissive:'#ff794c',emissiveIntensity:.7}),(o,b)=>{o.position.set(b.x,terrainHeight(b.x,b.z)+.8,b.z);});
    this.sync(s.enemies.filter(e=>e.warmup>0||e.windup>0),'warning',()=>this.makeWarning(),(o,e)=>this.updateWarning(o,e,s));
    if(s.status==='upgrade'&&this.lastStatus!=='upgrade'){this.keys.clear();this.touch={x:0,z:0};}
    this.renderer.render(this.scene,this.camera);this.uiTimer+=dt;if(this.uiTimer>.08||s.status!==this.lastStatus){this.uiTimer=0;this.lastStatus=s.status;this.onChange(snapshot(s));}
  }
  start(){this.state=createRun();this.state.status='playing';this.accumulator=0;this.keys.clear();this.touch={x:0,z:0};this.onChange(snapshot(this.state));}
  pause(){if(this.state.status==='playing')this.state.status='paused';else if(this.state.status==='paused')this.state.status='playing';this.keys.clear();this.touch={x:0,z:0};this.onChange(snapshot(this.state));}
  upgrade(id){if(chooseUpgrade(this.state,id)){this.keys.clear();this.touch={x:0,z:0};this.onChange(snapshot(this.state));}}
  dispose(){this.renderer.setAnimationLoop(null);this.resize.disconnect();window.removeEventListener('keydown',this.down);window.removeEventListener('keyup',this.up);window.removeEventListener('blur',this.blur);this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);for(const r of this.resources)r.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
