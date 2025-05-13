// paintball.js
document.addEventListener('DOMContentLoaded', () => {
  // ─── INITIAL STATE & DATA ─────────────────────────
  let magSize             = 30;        // How many rounds fit in one magazine initially
  let baseBulletDamage    = 30;        // The starting damage of each shot
  let maxReserve          = 90;        // The maximum ammo you can carry in reserve
  let spawnStartTime;                  // Timestamp when enemy‐spawning began

  const baseInterval      = 2000;      // Initial delay (ms) between enemy spawn waves
  const minInterval       = 500;       // Fastest possible spawn delay (ms) after ramp‐up
  const decayRate         = 0.0005;    // Linear interpolation rate for spawn delay ramp
  const rampDuration      = 300_000;   // 5 minutes (ms) over which spawn delay linearly goes from baseInterval→minInterval
  const latePhaseStart    = rampDuration; // Alias: when to switch from “ramp” mode into “late phase”
  const lateDecayRate     = 0.002;     // Exponential‐decay rate for spawn delay once you’re past rampDuration
  const lateMinInterval   = 150;        // Hard lower-bound on spawn delay in the late phase (ms)
  let   latePhaseTriggered= false;     // Has the game entered late-phase yet?

  // ─── MAGNETIC PICKUP ─────────────────────────────────
  let   pickupRadius      = 40;        // How far (px) loot will be magnetically pulled in
  const maxPickupRadius   = 600;       // Absolute cap on pickupRadius
  const magnetPullSpeed   = 15;         // Speed (px/frame) at which loot moves toward player

  // ─── BOSS SPAWN CONFIG ───────────────────────────────
  const bossSpawnIntervalMin = 60_000;  // Minimum delay (ms) between boss spawns
  const bossSpawnIntervalMax = 120_000; // Maximum delay (ms) between boss spawns

  const upgrades = {
    health:   { cost: 5,  apply: () => { player.maxHealth += 20; player.health += 20; } },
    damage:   { cost: 5,  apply: () => { baseBulletDamage += 5; currentWeapon.damage += 5; } },
    magSize:  { cost: 6,  apply: () => { magSize += 5; } },
    fireRate: { cost:10,  apply: () => {currentWeapon.fireRate = Math.max(20, Math.floor(currentWeapon.fireRate * 0.9));} },
    magnet: { cost: 6, apply: () => {pickupRadius = Math.min(maxPickupRadius, pickupRadius + 20);}}

  };
  const weapons = {
    buckshot:{ cost:10, damage:15, bullets:5, spread:0.3,  reload:800,  fireRate:300 },
    minigun: { cost:20, damage:5,  bullets:1, spread:0.15, reload:1500, fireRate:50  },
    sniper:  { cost:30, damage:1000,bullets:1, spread:0,    reload:2000, fireRate:800 }
  };
  const enemyTypes = {
    grunt:      { size:40,  health:80,  speed:1.5, color:'#D0021B', weight:40 },
    runner:     { size:30,  health:50,  speed:2.5, color:'#F5A623', weight:30 },
    tank:       { size:100, health:200, speed:0.8, color:'#5555FF', weight:15, armor:20 },
    sniper:     { size:50,  health:60,  speed:1.2, color:'#00FF00', weight:10, ranged:true },
    bomber:     { size:60,  health:100, speed:1.0, color:'#FF6A00', weight:8,  explodeOnDeath:true },
    healer:     { size:45,  health:70,  speed:1.3, color:'#00C8FF', weight:5,  regen:0.5 },
    shadow:     { size:35,  health:40,  speed:3.0, color:'#333333', weight:3,  stealth:true },
    juggernaut: { size:120, health:300, speed:0.6, color:'#8B0000', weight:4,  armor:50 },
    assassin:   { size:25,  health:45,  speed:3.5, color:'#800080', weight:5,  critChance:0.2 },
    drone:      { size:20,  health:30,  speed:2.8, color:'#FFD700', weight:8,  fly:true },
    spitter:    { size:55,  health:80,  speed:1.1, color:'#7FFF00', weight:6,  ranged:true, spitDamage:10 },
    shieldbearer:{size:70,  health:150, speed:1.0, color:'#1E90FF', weight:7,  shield:50 }
  };

    // ─── DEFINE MULTIPLE BOSS TYPES ────────────────────
  enemyTypes.basicBoss = {
    size: 120, health: 4000, speed: 0.6, color: '#FF0000',
    fireRate: 10000, lastShot: 0, pattern: 'radial'
  };
  enemyTypes.rocketBoss = {
    size: 140, health: 10000, speed: 0.5, color: '#FF00AA',
    fireRate: 3000, lastShot: 0, pattern: 'homing'
  };
  enemyTypes.spiralBoss = {
    size: 130, health: 6000, speed: 0.4, color: '#00FFAA',
    fireRate: 2500, lastShot: 0, pattern: 'spiral', spiralAngle: 0
  };
  


  // human‐readable labels for buttons
  const upgradeLabels = {
    health:   "+20 HP",
    damage:   "+5 DMG",
    magSize:  "+5 Mag",
    fireRate: "–10% FR",
    magnet:   "Magnetic Pull "
  };

  function updateUpgradeButtons() {
    document.querySelectorAll('.upgrade-btn').forEach(btn => {
      const key = btn.dataset.upgrade;
      if (!upgrades[key]) return;
      btn.textContent = `${upgradeLabels[key]} — ${upgrades[key].cost} g`;
    });
  }
  const panel = document.getElementById('upgradePanel');
  panel.addEventListener('click', e => {
    const uKey = e.target.dataset.upgrade;
    if (uKey && upgrades[uKey] && gold >= upgrades[uKey].cost) {
      gold -= upgrades[uKey].cost;
      upgrades[uKey].apply();

      // bump price by 10%
      upgrades[uKey].cost = Math.ceil(upgrades[uKey].cost * 1.1);

      refreshPanel();           // your existing UI update
      updateUpgradeButtons();   // redraw all upgrade buttons
    }
  });



  
  
  updateUpgradeButtons();
  // container for flame-particles
  let rocketParticles = [];



  // ─── CANVAS SETUP ───────────────────────────────
  const canvas = document.getElementById('game');
  const ctx    = canvas.getContext('2d');
  let w = canvas.width  = innerWidth;
  let h = canvas.height = innerHeight;
  window.addEventListener('resize', () => {
    w = canvas.width  = innerWidth;
    h = canvas.height = innerHeight;
  });

  // ─── GAME STATE ─────────────────────────────────
  const mapSize = 5000;
  let player, keys = {}, bullets = [], enemies = [], objects = [], pickups = [];
  let score = 0, reserve = maxReserve, gold = 0;
  let ammo = magSize, reloading = false, reloadStart = 0, reloadDur = 1000;
  let currentWeapon = { damage:30, bullets:1, spread:0, reload:reloadDur, fireRate:300 };
  let gameStarted = false;
  let highs = [];
  let bossBullets = [];


  // ─── UI REFERENCES ──────────────────────────────
  const ui      = document.getElementById('ui');
  const startBtn= document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');
  const upgradePanel = document.getElementById('upgradePanel');
  const upGold  = document.getElementById('upGold');

  // ─── INITIALIZE BUTTONS ─────────────────────────
  startBtn.onclick = () => {
    localStorage.setItem('curName', document.getElementById('nameInput').value.trim() || 'Player');
    loadHighs();
    ui.style.display = 'none';
    initGame();
  };
  restartBtn.onclick = () => location.reload();

  
  // ─── SHOP PANEL HANDLER ─────────────────────────
  function refreshPanel() {
    upGold.textContent = gold;
  }
  upgradePanel.addEventListener('click', e => {
    const u = e.target.dataset.upgrade, wKey = e.target.dataset.weapon;
    if (u && upgrades[u] && gold >= upgrades[u].cost) {
      gold -= upgrades[u].cost;
      upgrades[u].apply();
    }
    if (wKey && weapons[wKey] && gold >= weapons[wKey].cost) {
      gold -= weapons[wKey].cost;
      currentWeapon = { ...weapons[wKey] };
    }
    refreshPanel();
  });

  // ─── GAME INITIALIZATION & LOOP ────────────────
  function initGame() {
    player = { x: mapSize/2, y: mapSize/2, size:40, angle:0, speed:4, health:100, maxHealth:100 };
    score = gold = 0;
    reserve = maxReserve;
    ammo = magSize;
    reloading = false;
    baseBulletDamage = 30;
    currentWeapon = { damage:30, bullets:1, spread:0, reload:reloadDur, fireRate:300 };
    upgradePanel.style.display = 'block';
    initObjects();
    bullets = []; enemies = []; pickups = [];
    spawnStartTime = Date.now();
    gameStarted = true;
    scheduleNextSpawn();
    updateUI();
    requestAnimationFrame(loop);
    scheduleNextBoss();
  }
  // call this at end of initGame()
scheduleNextBoss();

function scheduleNextBoss(){
  const delay = bossSpawnIntervalMin
              + Math.random()*(bossSpawnIntervalMax - bossSpawnIntervalMin);
  setTimeout(()=>{
    spawnBoss();
    scheduleNextBoss();
  }, delay);
}

function spawnBoss(){
  // pick a boss type at random
  const keys = ['basicBoss','rocketBoss','spiralBoss'];
  const choice = keys[Math.floor(Math.random()*keys.length)];
  const def = enemyTypes[choice];
  // spawn at random edge
  let x,y,edge = Math.floor(Math.random()*4);
  if(edge===0){ x=0;           y=Math.random()*mapSize; }
  if(edge===1){ x=mapSize;      y=Math.random()*mapSize; }
  if(edge===2){ y=0;           x=Math.random()*mapSize; }
  if(edge===3){ y=mapSize;      x=Math.random()*mapSize; }

  enemies.push({
    ...def,
    x, y,
    maxHealth: def.health,
    isBoss: true
  });
}


  function loop() {
    if (!gameStarted) return;
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // ─── OBJECT & ENEMY SPAWNING ───────────────────
  function initObjects() {
    objects = [];
    for (let i = 0; i < 50; i++) {
      let sz = 80, x, y;
      do {
        x = Math.random() * (mapSize - sz) + sz/2;
        y = Math.random() * (mapSize - sz) + sz/2;
      } while (objects.some(o => Math.hypot(o.x-x, o.y-y) < o.size + sz));
      objects.push({ x, y, size: sz });
    }
  }

  function spawnEnemy() {
    const t = score / 50;
    const order = Object.keys(enemyTypes);
    let maxTier = Math.min(Math.floor(t/2), order.length - 1);
    const unlocked = order.slice(0, maxTier + 1);
    let pool = [];
    unlocked.forEach(key => {
      for (let i = 0; i < enemyTypes[key].weight; i++) pool.push(key);
    });
    const typeKey = pool[Math.floor(Math.random() * pool.length)];
    const def = enemyTypes[typeKey];
    const x = Math.random()*(mapSize-def.size)+def.size/2;
    const y = Math.random()*(mapSize-def.size)+def.size/2;
    enemies.push({
      x, y, size: def.size,
      health: def.health, maxHealth: def.health,
      speed: def.speed, color: def.color, type: typeKey
    });
  }

  function scheduleNextSpawn() {
    const elapsed = Date.now() - spawnStartTime;
    if (!latePhaseTriggered && elapsed >= rampDuration) {
      latePhaseTriggered = true;
      document.body.classList.add('late-phase');
    }
    let interval;
    if (elapsed <= rampDuration) {
      const t = elapsed / rampDuration;
      interval = baseInterval + t * (minInterval - baseInterval);
    } else {
      const lateTime = elapsed - latePhaseStart;
      interval = minInterval * Math.exp(-lateDecayRate * lateTime);
      interval = Math.max(interval, lateMinInterval);
    }
    setTimeout(() => {
      const count = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) spawnEnemy();
      scheduleNextSpawn();
    }, interval);
  }

  // ─── INPUT HANDLING ────────────────────────────
  document.addEventListener('keydown', e => keys[e.key] = true);
  document.addEventListener('keyup',   e => keys[e.key] = false);
  canvas.addEventListener('mousemove', e => {
    if (!player) return;
    player.angle = Math.atan2(
      e.clientY - (player.y - viewY),
      e.clientX - (player.x - viewX)
    );
  });
  canvas.addEventListener('mousedown', () => {
    if (gameStarted && ammo > 0 && !reloading) shoot();
  });

  // ─── SHOOT & RELOAD ────────────────────────────
  function shoot() {
    const now = Date.now();
    if (now - (player.lastShot || 0) < currentWeapon.fireRate) return;
    player.lastShot = now;
    for (let i = 0; i < currentWeapon.bullets; i++) {
      const ang = player.angle + (Math.random() - 0.5) * currentWeapon.spread;
      bullets.push({ x: player.x, y: player.y, ang, spd:14, size:8, damage: currentWeapon.damage });
    }
    ammo--; updateUI();
    if (ammo === 0) startReload();
  }
  function startReload() {
    reloading = true;
    reloadStart = Date.now();
  }

  // ─── UPDATE ────────────────────────────────────
  let viewX = 0, viewY = 0;
  function update() {
  if (!player) return;
  // ─── PLAYER MOVEMENT & COLLISIONS ─────────────────────────────
  if (keys['w']) player.y -= player.speed;
  if (keys['s']) player.y += player.speed;
  if (keys['a']) player.x -= player.speed;
  if (keys['d']) player.x += player.speed;

  objects.forEach(o => {
    const dx = player.x - o.x, dy = player.y - o.y;
    const dist = player.size/2 + o.size/2;
    if (Math.hypot(dx,dy) < dist) {
      const ang = Math.atan2(dy,dx);
      player.x = o.x + Math.cos(ang)*dist;
      player.y = o.y + Math.sin(ang)*dist;
    }
  });

  // ─── BOUNDS & CAMERA ───────────────────────────────────────────
  player.x = Math.max(player.size/2, Math.min(mapSize-player.size/2, player.x));
  player.y = Math.max(player.size/2, Math.min(mapSize-player.size/2, player.y));
  viewX = Math.max(0, Math.min(mapSize-w, player.x-w/2));
  viewY = Math.max(0, Math.min(mapSize-h, player.y-h/2));

  // ─── RELOAD FINISH ─────────────────────────────────────────────
  if (reloading && Date.now() - reloadStart >= reloadDur) {
    reloading = false;
    const take = Math.min(magSize, reserve);
    reserve -= take; 
    ammo = take; 
    updateUI();
  }

  // ─── ENEMY MOVEMENT ────────────────────────────────────────────
  enemies.forEach(e => {
    const ang = Math.atan2(player.y - e.y, player.x - e.x);
    e.x += Math.cos(ang) * e.speed;
    e.y += Math.sin(ang) * e.speed;
  });

  // ─── PLAYER BULLETS → ENEMIES & BOSS ───────────────────────────
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    // 1) MOVE
    b.x += Math.cos(b.ang) * b.spd;
    b.y += Math.sin(b.ang) * b.spd;

    // 2) OUT OF BOUNDS?
    if (b.x < 0 || b.x > mapSize || b.y < 0 || b.y > mapSize) {
      bullets.splice(i, 1);
      continue;
    }

    // 3) COLLIDE WITH ANY ENEMY (regular or boss)
    let hitSomething = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const dx = b.x - e.x, dy = b.y - e.y;
      if (Math.hypot(dx, dy) < b.size + e.size/2) {
        // DAMAGE
        e.health -= b.damage;
        bullets.splice(i, 1);
        hitSomething = true;

        // IF KILLED
        if (e.health <= 0) {
          if (e.isBoss) {
            score += 100;
            // boss kill reward
            const dropAmount = Math.floor(score/10);
            pickups.push({
              x: e.x,
              y: e.y,
              size: 20,
              type: 'gold',
              value: dropAmount
            });
            } 
            else {
            score += 10;
            // spawn regular pickups…
            let r = Math.random(), type = null;
            if (r < 0.5)        type = null;
            else if (r < 0.8)   type = 'gold';
            else if (r < 0.95)  type = 'ammo';
            else                type = 'health';
            if (type) {
              const val = 
                type==='ammo'   ? 100 :
                type==='health'?  30 :
                (e.size>60?10:e.size>40?5:2);
              pickups.push({ x:e.x, y:e.y, size:20, type, value:val });
            }
          }
          enemies.splice(j, 1);
        }
        break;
      }
      
    }

    if (hitSomething) continue;
  }
w
  // ─── MOVE + COLLIDE bossBullets ────────────────────
  bossBullets.forEach((b,i) => {
    // homing adjustment
    if (b.homing) {
      const desired = Math.atan2(player.y-b.y, player.x-b.x);
      b.ang += (desired - b.ang)*0.08;  // a bit more responsive
    }

    // step
    const dx = Math.cos(b.ang)*b.spd;
    const dy = Math.sin(b.ang)*b.spd;
    b.x += dx;
    b.y += dy;
    b.life++;

    // emit a flame-particle behind the rocket
    if (b.homing) {
      rocketParticles.push({
        x: b.x - dx*0.5,
        y: b.y - dy*0.5,
        life: 0, maxLife: 30 + Math.random()*20
      });
    }

    // collision with map objects
    for (const o of objects) {
      if (Math.hypot(b.x - o.x, b.y - o.y) < b.size + o.size/2) {
        bossBullets.splice(i,1);
        return;
      }
    }
    // expire if life or out of bounds
    if (
      b.life > b.maxLife ||
      b.x < -50 || b.x > mapSize+50 ||
      b.y < -50 || b.y > mapSize+50
    ) {
      bossBullets.splice(i,1);
    }
  });


  // ─── BOSS BULLETS MOVEMENT ─────────────────────────────────────
  bossBullets.forEach((b,i) => {
    if (b.homing) {
      const desired = Math.atan2(player.y-b.y, player.x-b.x);
      b.ang += (desired - b.ang) * 0.05;
    }
    b.x += Math.cos(b.ang)*b.spd;
    b.y += Math.sin(b.ang)*b.spd;
    b.life++;
    // expire
    if (b.life > b.maxLife || b.x<0||b.x>mapSize||b.y<0||b.y>mapSize) {
      bossBullets.splice(i,1);
    }
  });

  // ─── BOSS BULLETS → PLAYER ONLY ────────────────────────────────
  bossBullets.forEach((b,i) => {
    if (Math.hypot(player.x-b.x, player.y-b.y) < player.size/2 + b.size) {
      player.health -= 20;     // boss bullet damage
      bossBullets.splice(i,1);
    }
  });

  // ─── MAGNETIC PULL ─────────────────────
  pickups.forEach(p=>{
    const dx = player.x - p.x,
          dy = player.y - p.y,
          d  = Math.hypot(dx,dy);
    if (d < pickupRadius && d > 1) {
      p.x += (dx/d) * magnetPullSpeed;
      p.y += (dy/d) * magnetPullSpeed;
    }
  });
  // ─── PICKUPS & ENEMY CONTACT ───────────────────────────────────
  pickups.forEach((p,i) => {
    if (Math.hypot(player.x-p.x, player.y-p.y) < player.size/2 + p.size/2) {
      if (p.type==='ammo')   reserve += p.value;
      if (p.type==='health') player.health = Math.min(player.maxHealth, player.health+p.value);
      if (p.type==='gold')   gold    += p.value;
      pickups.splice(i,1);
    }
  });
  enemies.forEach(e => {
    if (Math.hypot(player.x-e.x, player.y-e.y) < player.size/2 + e.size/2) {
      player.health--;
    }
  });

  // ─── DEATH CHECK ───────────────────────────────────────────────
  if (player.health <= 0) {
    gameStarted = false;
    document.getElementById('finalScore').textContent = score;
    document.getElementById('gameOver').style.display = 'block';
    upgradePanel.style.display = 'none';
    saveHigh(score);
  }

  updateUI();

  // ─── BOSS SHOOTING (unchanged) ────────────────────────────────
  enemies.forEach(boss => {
    if (!boss.isBoss) return;
    const now = Date.now();
    if (now - boss.lastShot < boss.fireRate) return;
    boss.lastShot = now;

    if (boss.pattern === 'radial') {
      for (let i=0; i<8; i++) {
        const angle = (Math.PI*2/8)*i;
        bossBullets.push({
          x: boss.x, y: boss.y,
          ang: angle, spd: 8, size: 8,
          color: '#FF4500',
          life: 0, maxLife: 200, homing: false
        });
      }
    } else {
      const angleToPlayer = Math.atan2(player.y-boss.y, player.x-boss.x);
      bossBullets.push({
        x: boss.x, y: boss.y,
        ang: angleToPlayer, spd: 2, size: 12,
        color: '#FF00FF',
        life: 0, maxLife: 300, homing: true
      });
    }
  });
}


  // ─── DRAW ───────────────────────────────────────
  function draw() {
    if (!player) return;

    // ─── BACKGROUND & GRID ─────────────────────────────
    ctx.fillStyle = latePhaseTriggered ? '#440000' : '#121418';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = -viewX % 50; x < w; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = -viewY % 50; y < h; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // ─── MAP OBJECTS ────────────────────────────────────
    ctx.fillStyle = '#2A2C33';
    objects.forEach(o => {
      ctx.fillRect(
        o.x - viewX - o.size/2,
        o.y - viewY - o.size/2,
        o.size, o.size
      );
    });

    // ─── PLAYER ─────────────────────────────────────────
    const px = player.x - viewX,
          py = player.y - viewY;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#4A90E2';
    ctx.fillRect(-player.size/2, -player.size/2, player.size, player.size);
    ctx.restore();

    // ─── RELOAD BAR ─────────────────────────────────────
    if (reloading) {
      const pct = Math.min((Date.now() - reloadStart)/reloadDur, 1);
      ctx.fillStyle = '#FFF';
      ctx.fillRect(px - 50, py - player.size - 10, 100 * pct, 6);
    }

    // ─── PLAYER BULLETS ──────────────────────────────────
    ctx.fillStyle = '#F5A623';
    bullets.forEach(b => {
      ctx.fillRect(
        b.x - viewX - b.size/2,
        b.y - viewY - b.size/2,
        b.size, b.size
      );
    });

    // ─── ENEMIES ─────────────────────────────────────────
    enemies.forEach(e => {
      const ex = e.x - viewX,
            ey = e.y - viewY;
      // body
      ctx.fillStyle = e.color;
      ctx.fillRect(ex - e.size/2, ey - e.size/2, e.size, e.size);
      // health bar
      const pct = e.health / e.maxHealth;
      ctx.fillStyle = '#555';
      ctx.fillRect(ex - e.size/2, ey - e.size/2 - 8, e.size, 6);
      ctx.fillStyle = '#0F0';
      ctx.fillRect(ex - e.size/2, ey - e.size/2 - 8, e.size * pct, 6);
    });

    // ─── PICKUPS ─────────────────────────────────────────
    pickups.forEach(p => {
      const x = p.x - viewX,
            y = p.y - viewY;
      ctx.fillStyle =
        p.type === 'ammo'   ? '#F5A623' :
        p.type === 'health' ? '#0F0'    :
                              '#FFD700';
      ctx.fillRect(x - p.size/2, y - p.size/2, p.size, p.size);
    });

    // ─── ROCKET FLAME PARTICLES ─────────────────────────
    rocketParticles.forEach((p, i) => {
      // advance life
      p.life++;
      // compute alpha fade
      const alpha = 1 - p.life / p.maxLife;
      if (alpha <= 0) {
        rocketParticles.splice(i, 1);
        return;
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgba(255,150,0,${alpha})`;
      ctx.beginPath();
      ctx.arc(
        p.x - viewX,
        p.y - viewY,
        4 + 2 * alpha,
        0, Math.PI * 2
      );
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // ─── BOSS BULLETS & ROCKETS ─────────────────────────
    bossBullets.forEach(b => {
      const bx = b.x - viewX,
            by = b.y - viewY;

      if (b.homing) {
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(b.ang);

        // body rectangle (now twice as long)
        const bodyW = b.size * 2,
              bodyH = b.size / 2;
        ctx.fillStyle = b.color;
        ctx.fillRect(-bodyW/2, -bodyH/2, bodyW, bodyH);

        // nose triangle (scaled to match)
        ctx.beginPath();
        ctx.moveTo(bodyW/2, 0);
        ctx.lineTo(bodyW/2 + bodyW/2, -bodyH/2);
        ctx.lineTo(bodyW/2 + bodyW/2,  bodyH/2);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      } else {
        // radial bullet as circle
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(bx, by, b.size, 0, Math.PI*2);
        ctx.fill();
      }
    });
  }


  // ─── UI UPDATE HELPERS ──────────────────────────
  function pop(el) {
    el.classList.add('pop');
    setTimeout(() => el.classList.remove('pop'), 300);
  }
  function updateUI() {
    ['score','gold','ammo','reserve','healthText','maxHealthText']
      .forEach(id => {
        const e = document.getElementById(id);
        if (!e) return;
        if (id==='healthText')    e.textContent = Math.floor(player.health);
        else if (id==='maxHealthText') e.textContent = player.maxHealth;
        else e.textContent = eval(id); // score, gold, ammo, reserve
        pop(e);
      });
    document.getElementById('healthBar').style.width =
      (player.health/player.maxHealth*100) + '%';
    refreshPanel();
  }

  // ─── HIGH-SCORE STORAGE ─────────────────────────
  function saveHigh(sc) {
    highs = JSON.parse(localStorage.getItem('hs')||'[]');
    highs.push({ name: localStorage.getItem('curName'), score: sc });
    highs.sort((a,b) => b.score - a.score);
    localStorage.setItem('hs', JSON.stringify(highs));
    renderLeader();
  }
  function loadHighs() {
    highs = JSON.parse(localStorage.getItem('hs')||'[]');
    renderLeader();
  }
function renderLeader(){
  const ul = document.getElementById('lbList');
  ul.innerHTML = '';
  highs.slice(0,5).forEach(h => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="name">${h.name}</span>
      <span class="score">${h.score}</span>
    `;
    ul.appendChild(li);
  });
}

  loadHighs();
});
