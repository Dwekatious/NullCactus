// paintball.js
document.addEventListener('DOMContentLoaded', () => {
  // ─── INITIAL STATE & DATA ─────────────────────────
  let magSize = 30;              // initial magazine size
  let baseBulletDamage = 30;
  let maxReserve       = 90;
  let spawnStartTime;
  const baseInterval   = 5000;   // ms
  const minInterval    = 200;    // ms
  const decayRate      = 0.0005;
  const rampDuration   = 300_000;  // 5 min
  const latePhaseStart = rampDuration;
  const lateDecayRate  = 0.002;
  const lateMinInterval= 50;
  let latePhaseTriggered = false;

  const upgrades = {
    health:   { cost: 5,  apply: () => { player.maxHealth += 20; player.health += 20; } },
    damage:   { cost: 7,  apply: () => { baseBulletDamage += 5; currentWeapon.damage += 5; } },
    magSize:  { cost: 6,  apply: () => { magSize += 5; } },
    fireRate: { cost:10,  apply: () => {
      currentWeapon.fireRate = Math.max(20, Math.floor(currentWeapon.fireRate * 0.9));
    } }
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

  // populate upgrade & weapon buttons
  document.querySelectorAll('.upgrade-btn').forEach(btn => {
    const key = btn.dataset.upgrade;
    if (upgrades[key]) btn.textContent = `${btn.textContent} — ${upgrades[key].cost} g`;
  });
  document.querySelectorAll('.weapon-btn').forEach(btn => {
    const key = btn.dataset.weapon;
    if (weapons[key]) btn.textContent = `${btn.textContent} — ${weapons[key].cost} g`;
  });

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
    // movement
    if (keys['w']) player.y -= player.speed;
    if (keys['s']) player.y += player.speed;
    if (keys['a']) player.x -= player.speed;
    if (keys['d']) player.x += player.speed;
    // collisions
    objects.forEach(o => {
      const dx = player.x - o.x, dy = player.y - o.y;
      const dist = player.size/2 + o.size/2;
      if (Math.hypot(dx,dy) < dist) {
        const ang = Math.atan2(dy,dx);
        player.x = o.x + Math.cos(ang)*dist;
        player.y = o.y + Math.sin(ang)*dist;
      }
    });
    // bounds & camera
    player.x = Math.max(player.size/2, Math.min(mapSize-player.size/2, player.x));
    player.y = Math.max(player.size/2, Math.min(mapSize-player.size/2, player.y));
    viewX = Math.max(0, Math.min(mapSize-w, player.x-w/2));
    viewY = Math.max(0, Math.min(mapSize-h, player.y-h/2));
    // finish reload
    if (reloading && Date.now() - reloadStart >= reloadDur) {
      reloading = false;
      const take = Math.min(magSize, reserve);
      reserve -= take; ammo = take; updateUI();
    }
    // move enemies
    enemies.forEach(e => {
      const ang = Math.atan2(player.y - e.y, player.x - e.x);
      e.x += Math.cos(ang) * e.speed;
      e.y += Math.sin(ang) * e.speed;
    });
    // bullets → enemies
    bullets.forEach((b,i) => {
      b.x += Math.cos(b.ang)*b.spd;
      b.y += Math.sin(b.ang)*b.spd;
      if (b.x<0||b.x>mapSize||b.y<0||b.y>mapSize) return bullets.splice(i,1);
      enemies.forEach((e,j) => {
        if (Math.hypot(b.x-e.x,b.y-e.y) < b.size+e.size/2) {
          e.health -= b.damage;
          bullets.splice(i,1);
          if (e.health <= 0) {
            score += 10;
            let r = Math.random(), type = null;
            if (r<0.5) type = null;
            else if (r<0.8) type = 'gold';
            else if (r<0.95) type = 'ammo';
            else type = 'health';
            if (type) {
              const val = type==='ammo'?100:type==='health'?30:
                          (e.size>60?10:e.size>40?5:2);
              pickups.push({ x:e.x,y:e.y,size:20,type,value:val });
            }
            enemies.splice(j,1);
          }
        }
      });
    });
    // pickups & contact
    pickups.forEach((p,i) => {
      if (Math.hypot(player.x-p.x, player.y-p.y) < player.size/2 + p.size/2) {
        if (p.type==='ammo')   reserve+=p.value;
        if (p.type==='health') player.health = Math.min(player.maxHealth, player.health+p.value);
        if (p.type==='gold')   gold+=p.value;
        pickups.splice(i,1);
      }
    });
    enemies.forEach(e => {
      if (Math.hypot(player.x-e.x, player.y-e.y) < player.size/2 + e.size/2) {
        player.health--;
      }
    });
    // death
    if (player.health <= 0) {
      gameStarted = false;
      document.getElementById('finalScore').textContent = score;
      document.getElementById('gameOver').style.display = 'block';
      upgradePanel.style.display = 'none';
      saveHigh(score);
    }
    updateUI();
  }

  // ─── DRAW ───────────────────────────────────────
  function draw() {
    if (!player) return;
    ctx.fillStyle = latePhaseTriggered ? '#440000' : '#121418';
    ctx.fillRect(0,0,w,h);
    // grid
    ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=1;
    for (let x = -viewX%50; x < w; x += 50) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
    }
    for (let y = -viewY%50; y < h; y += 50) {
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
    }
    // objects
    ctx.fillStyle='#2A2C33';
    objects.forEach(o => {
      ctx.fillRect(o.x-viewX-o.size/2, o.y-viewY-o.size/2, o.size, o.size);
    });
    // player
    const px = player.x - viewX, py = player.y - viewY;
    ctx.save();
    ctx.translate(px,py);
    ctx.rotate(player.angle);
    ctx.fillStyle='#4A90E2';
    ctx.fillRect(-player.size/2,-player.size/2,player.size,player.size);
    ctx.restore();
    // reload bar
    if (reloading) {
      const pct = Math.min((Date.now()-reloadStart)/reloadDur,1);
      ctx.fillStyle='#FFF';
      ctx.fillRect(px-50,py-player.size-10,100*pct,6);
    }
    // bullets
    ctx.fillStyle='#F5A623';
    bullets.forEach(b => {
      ctx.fillRect(b.x-viewX-b.size/2, b.y-viewY-b.size/2, b.size, b.size);
    });
    // enemies
    enemies.forEach(e => {
      const ex = e.x - viewX, ey = e.y - viewY;
      ctx.fillStyle = e.color;
      ctx.fillRect(ex-e.size/2, ey-e.size/2, e.size, e.size);
      const pct = e.health / e.maxHealth;
      ctx.fillStyle = '#555';
      ctx.fillRect(ex-e.size/2, ey-e.size/2-8, e.size, 6);
      ctx.fillStyle = '#0F0';
      ctx.fillRect(ex-e.size/2, ey-e.size/2-8, e.size*pct, 6);
    });
    // pickups
    pickups.forEach(p => {
      const x = p.x - viewX, y = p.y - viewY;
      ctx.fillStyle = p.type==='ammo'? '#F5A623' :
                      p.type==='health'? '#0F0' : '#FFD700';
      ctx.fillRect(x-p.size/2, y-p.size/2, p.size, p.size);
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
