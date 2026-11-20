import { createRun, tick, chooseUpgrade, TOTAL_SECONDS, UPGRADES } from '../src/model.js';
import { moveBody, terrainSpeed, isHighGround, isMud, segmentBlocked } from '../src/field.js';
export const DT = 1 / 60;
export const PROTOCOL = { physicsHz: 60, reactionMs: 200, commandIntervalMs: 500, candidates: 'stop + eight directions, with or without dash', note: 'Diagnostic bots with known terrain, not human success probabilities. Inputs are held for 500ms; decisions take effect after 200ms. Selection time is excluded while gameplay is paused.' };
export const ROUTE = [[-11,7],[-14,-10],[0,-18],[14,-16],[18,0],[14,10],[0,18],[-14,16]];
const directions = [{x:0,z:0}, ...Array.from({length:8},(_,i)=>({x:Math.cos(i*Math.PI/4),z:Math.sin(i*Math.PI/4)}))];
function choose(s, build) {
  if (Array.isArray(build)) {const id=build[s.build.length % build.length];return s.build.filter(u=>u===id).length >= (UPGRADES.find(u=>u.id===id).maxLevel || Infinity) ? 'guard' : id;}
  if (build !== 'balanced') return s.build.filter(id=>id===build).length >= (UPGRADES.find(u=>u.id===build).maxLevel || Infinity) ? 'guard' : build;
  const n = id => s.build.filter(u => u === id).length;
  if (!n('power')) return 'power';
  if (!n('mobility')) return 'mobility';
  if (s.player.hp < s.player.maxHp * .6) return 'guard';
  return n('power') < 3 ? 'power' : n('mobility') < 3 ? 'mobility' : 'guard';
}
function goalFor(s, memory) {
  const waypoint = memory.route[memory.waypoint % memory.route.length];
  if (Math.hypot(s.player.x-waypoint[0],s.player.z-waypoint[1]) < 2.3) memory.waypoint++;
  const next = memory.route[memory.waypoint % memory.route.length];
  const useful = s.items.filter(i => (i.kind === 'upgrade' || i.kind === 'health' && s.player.hp < s.player.maxHp - 18) && Math.hypot(i.x-s.player.x,i.z-s.player.z)<11 && !segmentBlocked(s.player.x,s.player.z,i.x,i.z,.6)).sort((a,b)=>Math.hypot(a.x-s.player.x,a.z-s.player.z)-Math.hypot(b.x-s.player.x,b.z-s.player.z));
  return useful[0] || {x:next[0],z:next[1]};
}
function command(s, policy, memory, held) {
  if (policy === 'idle') return {};
  if (policy === 'circle') { const a = Math.round(s.time*.36/(Math.PI/4))*Math.PI/4; return {x:Math.cos(a),z:Math.sin(a),dash:s.enemies.some(e=>Math.hypot(e.x-s.player.x,e.z-s.player.z)<2)}; }
  const goal = goalFor(s,memory), candidates = [...directions];
  if (s.dashCooldown < .2) candidates.push(...directions.slice(1).map(d=>({...d,dash:true})));
  let best = candidates[0], bestScore = -Infinity;
  for (const candidate of candidates) {
    const p = {...s.player}; let score = candidate.dash ? -8 : 0, gap = 8;
    for (let step=0;step<14;step++) {
      const t=(step+1)*.05, input=step<4?held:candidate;
      const boost=input.dash && step>=4 && step<9 ? 2.6:1;
      moveBody(p,(input.x||0)*s.stats.speed*terrainSpeed(p.x,p.z,input.x||0,input.z||0)*boost*.05,(input.z||0)*s.stats.speed*terrainSpeed(p.x,p.z,input.x||0,input.z||0)*boost*.05);
      for (const e of s.enemies) {
        if (e.warmup>t || e.hp<=0) continue;
        let ex=e.x,ez=e.z;
        if(e.windup>0 && e.type==='runner') {const travel=Math.max(0,t-e.windup)*14;ex+=e.aimX*travel;ez+=e.aimZ*travel;}
        else {ex+=e.vx*t;ez+=e.vz*t;}
        if(segmentBlocked(e.x,e.z,ex,ez,e.radius)) {ex=e.x;ez=e.z;}
        const d=Math.hypot(ex-p.x,ez-p.z)-e.radius-.5;gap=Math.min(gap,d);
        if(d<.3) score-=80; else if(d<1.2) score-=(1.2-d)*10;
      }
      for(const b of s.bolts) {const bx=b.x+b.vx*t,bz=b.z+b.vz*t;if(!segmentBlocked(b.x,b.z,bx,bz,.15)){const d=Math.hypot(bx-p.x,bz-p.z)-.75;gap=Math.min(gap,d);if(d<.3)score-=80;}}
    }
    score += (Math.hypot(s.player.x-goal.x,s.player.z-goal.z)-Math.hypot(p.x-goal.x,p.z-goal.z))*memory.goalWeight + Math.min(5,gap)*2;
    if(isMud(p.x,p.z)) score-=8;
    if(isHighGround(p.x,p.z)) score+=1;
    if(score>bestScore){bestScore=score;best=candidate;}
  }
  return best;
}
export function trial({policy='route',seed=314159,build='balanced',record=false,reverse=false,goalWeight=3,reactionFrames=12,commandFrames=30}={}) {
  if (!Number.isInteger(reactionFrames) || !Number.isInteger(commandFrames) || reactionFrames < 0 || reactionFrames >= commandFrames) throw new Error('Reaction delay must fit within the held command interval.');
  const s=createRun(()=>.5,seed);s.status='playing';const memory={waypoint:0,route:reverse?[ROUTE[0],...ROUTE.slice(1).reverse()]:ROUTE,goalWeight};let held={},pending={};const actions=[],upgrades=[];
  for(let frame=0;frame<=TOTAL_SECONDS*60 && !['won','lost'].includes(s.status);frame++) {
    while(s.status==='upgrade') {const id=choose(s,build);chooseUpgrade(s,id);upgrades.push({time:s.time,id});}
    if(frame%commandFrames===0) pending=command(s,policy,memory,held);
    if(frame%commandFrames===reactionFrames){held=pending;if(record)actions.push({frame,input:held});}
    tick(s,DT,held);
  }
  return {policy,seed,build,reverse,goalWeight,reactionFrames,commandFrames,status:s.status,seconds:s.time,hp:s.player.hp,maxHp:s.player.maxHp,kills:s.kills,upgrades:upgrades.length,...s.metrics,...(record?{actions,choices:upgrades}: {})};
}

// Replay uses only the saved commands and choices, without reading enemy state.
export function replay(recording, { offsetFrames = 0 } = {}) {
  const s = createRun(() => .5, recording.seed); s.status = 'playing';
  let action = 0, choice = 0, held = {};
  for (let frame = 0; frame <= TOTAL_SECONDS * 60 && !['won', 'lost'].includes(s.status); frame++) {
    while (s.status === 'upgrade') {
      const id = recording.choices[choice++]?.id || 'guard';
      if (!chooseUpgrade(s, id)) chooseUpgrade(s, 'guard');
    }
    while (action < recording.actions.length && recording.actions[action].frame + offsetFrames <= frame) held = recording.actions[action++].input;
    tick(s, DT, held);
  }
  return { offsetFrames, status: s.status, seconds: s.time, hp: s.player.hp, maxHp: s.player.maxHp, kills: s.kills, upgrades: s.build.length, ...s.metrics };
}
