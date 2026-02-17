import * as nipplejs from './nipplejs.js';
const ASSETS = {
  player: 'player.png',
  enemy_shadow: 'enemy_shadow.png',
  enemy_mage: 'enemy_mage.png',
  enemy_beast: 'enemy_beast.png',
  boss_castle: 'boss_castle.png',
  tileset: 'tileset.png',
  bg_forest: 'bg_forest.png',
  bg_ruins: 'bg_ruins.png',
  bg_castle: 'bg_castle.png',
  particle: 'particle.png',
  music: 'music_theme.mp3',
  sfx_attack: 'sfx_attack.mp3',
  sfx_magic: 'sfx_magic.mp3',
  sfx_dash: 'sfx_dash.mp3'
};

function loadImage(src){return new Promise(res=>{const i=new Image();i.src=src;i.onload=()=>res(i)})}
function loadAudio(src){return new Promise(res=>{const a=new Audio(src);a.loop=false;a.oncanplaythrough=()=>res(a)})}

export default class Game {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = canvas.width;
    this.h = canvas.height;
    this.scale = Math.min(this.w/1280, this.h/720);
    this.last = 0;
    this.dt = 0;
    this.state = 'loading';
    this.cameraX = 0;
    this.levelIndex = 0;
    this.player = null;
    this.entities = [];
    this.particles = [];
    this.ui = {hp:100,mp:50};
    this.skillPoints = 0;
    this.keys = {};
    this.touchInput = {left:false,right:false,jump:false,attack:false,dash:false};
    this.levels = this.createLevels();
  }

  async start(){
    await this.loadAssets();
    this.initControls();
    this.resetLevel(this.levelIndex);
    this.state = 'playing';
    this.last = performance.now();
    requestAnimationFrame(this.loop.bind(this));
    this.music && (this.music.loop = true, this.music.play().catch(()=>{}));
  }

  async loadAssets(){
    const items = Object.entries(ASSETS);
    this.assets = {};
    for(const [k,v] of items){
      if(v.endsWith('.png')) this.assets[k]=await loadImage(v);
      else this.assets[k]=await loadAudio(v);
    }
    // small sounds: ensure they can overlap
    this.sfx = {
      attack: () => {const a=this.assets.sfx_attack.cloneNode();a.play().catch(()=>{});},
      magic: () => {const a=this.assets.sfx_magic.cloneNode();a.play().catch(()=>{});},
      dash: () => {const a=this.assets.sfx_dash.cloneNode();a.play().catch(()=>{});},
    };
    this.music = this.assets.music;
  }

  initControls(){
    window.addEventListener('keydown',e=>{this.keys[e.key]=true});
    window.addEventListener('keyup',e=>{this.keys[e.key]=false});
    // touch buttons - simple virtual dpad
    const gz = navigator.userAgent.includes('Mobile') || innerWidth < 900;
    if(gz){
      Promise.resolve(nipplejs).then(nip=>{
        const manager = nip.create({zone:document.body,mode:'static',position:{left:'80px',bottom:'80px'},size:120,color:'#ffffff30'});
        manager.on('move',(_,data)=>{const rad=data.angle.radian; const dist=data.distance; this.touchInput.left = Math.cos(rad)<-0.3; this.touchInput.right = Math.cos(rad)>0.3; this.touchInput.jump = data.direction && data.direction.y === 'up';});
        manager.on('end',()=>{this.touchInput.left=this.touchInput.right=this.touchInput.jump=false});
      }).catch(()=>{});
      // simple tap zones for attack/dash
      window.addEventListener('touchstart', e=>{
        for(const t of e.touches){
          if(t.clientX > innerWidth*0.6 && t.clientY > innerHeight*0.5) this.touchInput.attack = true;
          if(t.clientX > innerWidth*0.6 && t.clientY < innerHeight*0.5) this.touchInput.dash = true;
        }
      });
      window.addEventListener('touchend', e=>{this.touchInput.attack=false;this.touchInput.dash=false});
    }
  }

  createLevels(){
    // Minimal level data: tile platforms and spawn waves + boss marker
    return [
      {id:'forest', bg:'bg_forest', length:4000, enemies:[{type:'shadow',x:800},{type:'beast',x:1400},{type:'mage',x:2000}], boss:{type:'shadow',x:3600}, music:this.assets?.music},
      {id:'ruins', bg:'bg_ruins', length:4200, enemies:[{type:'mage',x:600},{type:'shadow',x:1500},{type:'beast',x:2300}], boss:{type:'mage',x:3800}},
      {id:'grove', bg:'bg_forest', length:3800, enemies:[{type:'beast',x:900},{type:'beast',x:1700},{type:'mage',x:2400}], boss:{type:'beast',x:3200}},
      {id:'ancient', bg:'bg_ruins', length:4600, enemies:[{type:'shadow',x:700},{type:'mage',x:1200},{type:'shadow',x:2100}], boss:{type:'mage',x:4000}},
      {id:'castle', bg:'bg_castle', length:5000, enemies:[{type:'mage',x:1000},{type:'beast',x:1800},{type:'shadow',x:2600}], boss:{type:'castle',x:4600}}
    ];
  }

  resetLevel(i){
    const lvl = this.levels[i];
    this.cameraX = 0;
    this.entities = [];
    this.particles = [];
    this.player = this.createPlayer(200, 520);
    // spawn simple ground platforms scattered
    for(let x=0;x<lvl.length;x+=160){
      if(Math.random()<0.8) this.entities.push({type:'platform',x,y:600 - (Math.random()*120|0),w:160,h:32});
    }
    // enemies from data
    for(const e of lvl.enemies) this.spawnEnemy(e.type, e.x, 520);
    this.boss = null;
    this.ui.hp = 100; this.ui.mp = 60;
  }

  createPlayer(x,y){
    return {
      type:'player',
      x,y,
      vx:0,vy:0,
      w:48,h:56,
      onGround:false,
      canDouble:true,
      facing:1,
      speed:200,
      runMultiplier:1.5,
      dashTimer:0,
      attackTimer:0,
      hp:100, mp:60,
      level:1, xp:0
    };
  }

  spawnEnemy(kind,x,y){
    const base = {x,y,w:48,h:48,vx:0,ax:0,hp:20};
    if(kind==='shadow') this.entities.push({...base,type:'enemy',sub:'shadow',patrol:true});
    if(kind==='mage') this.entities.push({...base,type:'enemy',sub:'mage',patrol:false,range:220});
    if(kind==='beast') this.entities.push({...base,type:'enemy',sub:'beast',patrol:true,fast:true});
    if(kind==='castle') this.boss = {type:'boss',x,y,w:120,h:160,hp:300,phase:0};
  }

  loop(t){
    this.dt = Math.min((t-this.last)/1000,0.033);
    this.last = t;
    this.update(this.dt);
    this.render();
    requestAnimationFrame(this.loop.bind(this));
  }

  update(dt){
    if(this.state!=='playing') return;
    const p = this.player;
    // input
    const left = this.keys['a']||this.keys['ArrowLeft']||this.touchInput.left;
    const right = this.keys['d']||this.keys['ArrowRight']||this.touchInput.right;
    const run = this.keys['Shift'];
    const jumpPressed = this.keys['w']||this.keys['ArrowUp']||this.keys[' ' ]||this.touchInput.jump;
    const attack = this.keys['j']||this.touchInput.attack;
    const dash = this.keys['k']||this.touchInput.dash;
    // horizontal
    let target = 0;
    if(left) target = -1;
    if(right) target = 1;
    p.facing = target===0? p.facing : target;
    const spd = p.speed * (run? p.runMultiplier:1);
    p.vx = p.vx + (target*spd - p.vx) * Math.min(12*dt,1);
    // gravity
    p.vy += 1200*dt;
    // jump
    if(jumpPressed && (p.onGround || (p.canDouble && !p.onGround))){
      if(!p.onGround){ p.canDouble=false; p.vy = -520; this.spawnParticle(p.x+20,p.y,'magic'); this.sfx.magic(); }
      else { p.vy = -480; p.onGround=false; }
    }
    // dash
    if(dash && p.dashTimer<=0 && p.mp>=10){
      p.dashTimer = 0.22;
      p.mp -= 10;
      p.vx = p.facing * 900;
      this.sfx.dash();
      for(let i=0;i<6;i++) this.spawnParticle(p.x+Math.random()*40,p.y+Math.random()*40,'particle');
    }
    if(p.dashTimer>0){ p.dashTimer -= dt; if(p.dashTimer<=0) p.vx=0; }

    // attack
    if(attack && p.attackTimer<=0){
      p.attackTimer = 0.36;
      this.sfx.attack();
      // hit detection
      const range = {x:p.x + (p.facing>0? p.w: -40), y:p.y, w:40, h:p.h};
      for(const e of this.entities){ if(e.type==='enemy' && this.rectOverlap(range,e)){ e.hp -= 20 + (p.level-1)*4; this.spawnHit(e.x,e.y); if(e.hp<=0){ this.player.xp += 10; this.killEntity(e); }}}
      if(this.boss && this.rectOverlap(range,this.boss)){ this.boss.hp -= 12; if(this.boss.hp<=0){ this.winLevel(); }}
    }
    if(p.attackTimer>0) p.attackTimer -= dt;

    // movement integrate and collisions with simple platforms and world bounds
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.onGround = false;
    const lvl = this.levels[this.levelIndex];
    // ground baseline
    if(p.y + p.h > 680){ p.y = 680 - p.h; p.vy = 0; p.onGround = true; p.canDouble = true; }
    // platform collisions
    for(const ent of this.entities){
      if(ent.type==='platform'){
        if(this.rectOverlap(p,ent) && p.vy>=0 && p.y < ent.y){
          p.y = ent.y - p.h; p.vy = 0; p.onGround = true; p.canDouble=true;
        }
      }
    }

    // enemies update
    for(const e of this.entities.slice()){
      if(e.type==='enemy'){
        // simple AI: move toward player or patrol
        const dx = (this.player.x - e.x);
        if(e.patrol){
          e.vx = (Math.sin((performance.now()+e.x)/1000) * (e.fast?120:60));
        } else {
          e.vx = Math.sign(dx) * (e.fast?160:80);
        }
        e.x += e.vx * dt;
        // gravity
        e.vy = (e.vy||0) + 900*dt;
        e.y += e.vy*dt;
        if(e.y + e.h > 680){ e.y = 680 - e.h; e.vy = 0; }
        // attack player if close
        if(this.rectOverlap(e,{x:p.x,y:p.y,w:p.w,h:p.h})){
          p.hp -= 12*dt; if(p.hp<=0) this.lose();
        }
        if(e.hp<=0) this.killEntity(e);
      }
    }

    // boss simple AI
    if(this.boss){
      // move slowly toward player and occasionally charge
      const dx = this.player.x - this.boss.x;
      this.boss.x += Math.sign(dx)*60*dt;
      if(Math.abs(dx)<220 && Math.random()<0.01) { this.boss.hp -= 0; this.spawnParticle(this.boss.x,this.boss.y,'magic');}
      // collision with player
      if(this.rectOverlap(this.boss,this.player)){ this.player.hp -= 30*dt; if(this.player.hp<=0) this.lose(); }
    }

    // camera follows player
    this.cameraX = Math.max(0, this.player.x - 420);
    // spawn boss when approaching its x
    const lvlData = this.levels[this.levelIndex];
    if(lvlData.boss && !this.bossCreated && this.player.x > lvlData.boss.x - 600){
      this.spawnEnemy(lvlData.boss.type, lvlData.boss.x, 520);
      if(lvlData.boss.type==='castle') this.spawnEnemy('castle', lvlData.boss.x, 520);
      this.bossCreated = true;
    }

    // regen MP slowly
    if(this.player.mp < 100) this.player.mp += 6*dt;

    // simple xp -> level up
    if(this.player.xp >= 100){
      this.player.xp -= 100; this.player.level++; this.player.hp = Math.min(100 + this.player.level*6,200); this.skillPoints++;
    }

    // update particles
    for(let i=this.particles.length-1;i>=0;i--){
      const pr=this.particles[i];
      pr.x += pr.vx*dt; pr.y += pr.vy*dt;
      pr.life -= dt;
      if(pr.life<=0) this.particles.splice(i,1);
    }
  }

  rectOverlap(a,b){
    return a.x < b.x + (b.w||b.width) && a.x + (a.w||a.width) > b.x && a.y < b.y + (b.h||b.height) && a.y + (a.h||a.height) > b.y;
  }

  spawnParticle(x,y,type='particle'){
    const p = {x,y, vx:(Math.random()-0.5)*120, vy:(Math.random()-0.5)*40, life:0.6 + Math.random()*0.6, type};
    this.particles.push(p);
  }

  spawnHit(x,y){ for(let i=0;i<8;i++) this.spawnParticle(x+Math.random()*40,y+Math.random()*40,'particle'); }

  killEntity(e){
    const idx = this.entities.indexOf(e);
    if(idx>=0) this.entities.splice(idx,1);
    for(let i=0;i<12;i++) this.spawnParticle(e.x+Math.random()*e.w,e.y+Math.random()*e.h,'particle');
  }

  winLevel(){
    this.levelIndex++;
    if(this.levelIndex>=this.levels.length){ this.state='win'; setTimeout(()=>location.reload(),3000); }
    else { this.resetLevel(this.levelIndex); this.bossCreated=false; }
  }

  lose(){
    this.state='dead';
    setTimeout(()=>location.reload(),2000);
  }

  render(){
    const ctx=this.ctx;
    ctx.save();
    ctx.clearRect(0,0,this.w,this.h);
    ctx.fillStyle='#071017'; ctx.fillRect(0,0,this.w,this.h);
    const cam = this.cameraX;
    // draw background parallax
    const lvl = this.levels[this.levelIndex];
    const bgImg = this.assets[lvl.bg];
    if(bgImg){
      const par = 0.4;
      const x = -cam*par % bgImg.width;
      ctx.drawImage(bgImg, x, 0, bgImg.width, this.h);
      ctx.drawImage(bgImg, x+bgImg.width, 0, bgImg.width, this.h);
    }
    // draw platforms and ground
    for(const ent of this.entities){
      if(ent.type==='platform'){
        ctx.fillStyle='#3c2f23'; ctx.fillRect(ent.x - cam, ent.y, ent.w, ent.h);
        ctx.fillStyle='#6fe8d8'; ctx.globalAlpha=0.12; ctx.fillRect(ent.x - cam, ent.y-6, ent.w, 6); ctx.globalAlpha=1;
      }
    }
    // draw boss if exists
    if(this.boss){
      const bx = this.boss.x - cam, by = this.boss.y;
      ctx.fillStyle='#223'; ctx.fillRect(bx,by,this.boss.w,this.boss.h);
      ctx.fillStyle='#9fd'; ctx.fillText('BOSS', bx+10, by+20);
    }
    // draw enemies
    for(const e of this.entities){
      if(e.type==='enemy'){
        const ex = e.x - cam, ey = e.y;
        ctx.fillStyle = e.sub==='shadow'? '#111':'#6b3'; ctx.fillRect(ex,ey,e.w,e.h);
        if(e.sub==='mage'){ ctx.fillStyle='#7df'; ctx.fillRect(ex+6,ey-8,6,6); }
      }
    }
    // draw player
    const p = this.player;
    if(p){
      const px = p.x - cam, py = p.y;
      ctx.fillStyle='#8fd7d0'; ctx.fillRect(px,py,p.w,p.h);
      // small glow when using magic (mp use)
      if(p.mp < 30){ ctx.globalAlpha=0.18; ctx.fillStyle='#8ff'; ctx.fillRect(px-8,py-8,p.w+16,p.h+16); ctx.globalAlpha=1; }
    }
    // particles
    for(const pr of this.particles){
      const sx = pr.x - cam, sy = pr.y;
      ctx.globalAlpha = Math.max(0, Math.min(1, pr.life));
      ctx.fillStyle = '#fff6'; ctx.fillRect(sx,sy,4,4);
      ctx.globalAlpha=1;
    }

    // UI minimal
    ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(18,18,420,56);
    ctx.fillStyle='#111'; ctx.fillRect(20,20,416,20);
    ctx.fillStyle='#a33'; ctx.fillRect(20,20, Math.max(0, (p.hp/100))*400,20);
    ctx.fillStyle='#0b2'; ctx.fillRect(20,44, Math.max(0,(p.mp/100))*400,12);
    ctx.fillStyle='#fff'; ctx.font='14px sans-serif'; ctx.fillText(`HP ${Math.round(p.hp)}`, 28, 35);
    ctx.fillText(`MP ${Math.round(p.mp)}`, 28, 60);
    ctx.fillText(`Level ${p.level}  XP ${p.xp}/100`, 300, 35);

    // story prompt minimal
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(this.w-360,18,340,72);
    ctx.fillStyle='#fff'; ctx.font='13px sans-serif';
    const story = this.getStoryText();
    ctx.fillText(story[0], this.w-350, 36);
    ctx.fillText(story[1], this.w-350, 56);
    ctx.fillText(story[2], this.w-350, 76);

    // state overlays
    if(this.state==='win' || this.state==='dead'){
      ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,this.w,this.h);
      ctx.fillStyle='#fff'; ctx.font='48px sans-serif'; ctx.fillText(this.state==='win'?'You saved Lunarya!':'You fell...', this.w/2-200, this.h/2);
    }

    ctx.restore();
  }

  getStoryText(){
    const snippets = {
      0: ["Um tempo que sangra fragmentos...", "Guardião, tarefas-te purgar Lunarya.", "Avança e recolhe os pedaços do tempo."],
      1: ["As ruínas sussurram memórias quebradas.", "A corrupção aprende—tu também deves.", "Derrota os magos e restaura o fluxo."],
      2: ["A clareira guarda segredos antigos.", "Bestas protegem o último eco.", "Cresce em poder; o tempo responde."],
      3: ["Ecos carregam peças do próprio relógio.", "Desvenda o propósito das rachaduras.", "Continua, guardião."],
      4: ["No castelo, o tempo tornou-se rei.", "Enfrenta o núcleo e sela a brecha.", "Este é o último confronto."]
    };
    return snippets[Math.min(this.levelIndex,4)];
  }
}