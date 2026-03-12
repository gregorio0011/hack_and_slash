const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Input Handling ---
const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup', e => { keys[e.code] = false; });
    window.addEventListener('mousedown', e => { 
        if(e.button === 0) mouse.clicked = true; 
        if(e.button === 2) mouse.rightClicked = true;
    });
    window.addEventListener('mouseup', e => { 
        if(e.button === 0) mouse.clicked = false; 
        if(e.button === 2) mouse.rightClicked = false;
    });
    // Previne o menu de contexto do botão direito
    window.addEventListener('contextmenu', e => e.preventDefault());

// --- Game Constants & Globals ---
const GRAVITY = 0.5;
const FRICTION = 0.8;
const MAX_FALL_SPEED = 12;
const TILE_SIZE = 40;

const MAP = [
    "11111111111111111111111111111111111111111111111111",
    "10000000000000000000000000000000000000000000000001",
    "10000000000000000000000000000000000000000000022001",
    "10000000022200000000000000000000022000000000000001",
    "10000000000000022200000000002200000000222000000001",
    "10000222000000000000002220000000000000000000000001",
    "10000000000000000000000000000000000220000002200001",
    "10000000000222000000220000000000000000000000000001",
    "10220000000000002200000022200000222000000000000001",
    "10000000000000000000000000000000000000222000022201",
    "10000022200000000000220000000002220000000000000001",
    "10000000000022200000000000220000000000000002220001",
    "10000000000000000000000000000000000000000000000001",
    "11111111111111111111111111111111111111111111111111",
    "11111111111111111111111111111111111111111111111111"
];

let platforms = [];
for (let y = 0; y < MAP.length; y++) {
    for (let x = 0; x < MAP[y].length; x++) {
        if (MAP[y][x] !== '0') {
            platforms.push({ x: x * TILE_SIZE, y: y * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE, type: MAP[y][x] });
        }
    }
}

// Camera Globals
let camX = 0, camY = 0;

// --- Utils ---
function AABB(rect1, rect2) {
    return rect1.x < rect2.x + rect2.w &&
           rect1.x + rect1.w > rect2.x &&
           rect1.y < rect2.y + rect2.h &&
           rect1.y + rect1.h > rect2.y;
}
function lerp(a, b, t) { return a + (b - a) * t; }

// --- Effects ---
class ScreenShake {
    constructor() { this.duration = 0; this.intensity = 0; }
    trigger(intensity, duration) { this.intensity = intensity; this.duration = duration; }
    update(dt) { if (this.duration > 0) this.duration -= dt; }
    getOffset() {
        if (this.duration > 0) return { x: (Math.random() - 0.5) * this.intensity, y: (Math.random() - 0.5) * this.intensity };
        return { x: 0, y: 0 };
    }
}
const cameraShake = new ScreenShake();

class Particle {
    constructor(x, y, color, speed, life, hasGravity = false) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * speed * 2;
        this.vy = (Math.random() - 0.5) * speed * 2;
        if(hasGravity) this.vy -= speed;
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.size = Math.random() * 3 + 2;
        this.hasGravity = hasGravity;
    }
    update(dt) {
        if (this.hasGravity) this.vy += GRAVITY * 0.5;
        this.x += this.vx;
        this.y += this.vy;
        
        if (this.hasGravity) {
            for (let p of platforms) {
                if (this.x > p.x && this.x < p.x + p.w && this.y + this.size > p.y && this.y < p.y + p.h) {
                    this.y = p.y - this.size;
                    this.vy *= -0.3; // Bounce
                    this.vx *= 0.5; // Friction
                }
            }
        }
        
        this.life -= dt;
        this.size = Math.max(0, this.size - dt * 0.05);
    }
    draw(ctx, cx, cy) {
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.beginPath();
        ctx.arc(this.x - cx, this.y - cy, this.size, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }
}

class FloatingText {
    constructor(x, y, text, color) {
        this.x = x; this.y = y;
        this.text = text;
        this.color = color;
        this.life = 40;
        this.vy = -1.5;
    }
    update(dt) { this.y += this.vy; this.life -= dt; }
    draw(ctx, cx, cy) {
        ctx.fillStyle = this.color;
        ctx.font = "bold 20px 'Segoe UI', sans-serif";
        ctx.shadowBlur = 5;
        ctx.shadowColor = "#000";
        ctx.globalAlpha = Math.max(0, this.life / 40);
        ctx.fillText(this.text, this.x - cx, this.y - cy);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }
}

class Orb {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 6; this.h = 6;
        this.vx = (Math.random() - 0.5) * 6;
        this.vy = -Math.random() * 5 - 3;
        this.life = 600;
        this.collected = false;
    }
    update(dt) {
        this.vy += GRAVITY;
        this.x += this.vx; this.y += this.vy;
        this.vx *= 0.95;

        for (let p of platforms) {
            if (AABB(this, p)) {
                this.y = p.y - this.h;
                this.vy = -this.vy * 0.5;
                this.vx *= 0.8;
            }
        }
        
        let dx = player.x + player.w/2 - this.x;
        let dy = player.y + player.h/2 - this.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 150) {
            this.vx += (dx / dist) * 1.5;
            this.vy += (dy / dist) * 1.5;
        }

        this.life -= dt;
    }
    draw(ctx, cx, cy) {
        // Core
        ctx.fillStyle = "#e0ffff";
        ctx.beginPath();
        ctx.arc(this.x - cx, this.y - cy, this.w/2, 0, Math.PI*2);
        ctx.fill();
        
        // Glow
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#00f3ff";
        ctx.fillStyle = "rgba(0, 243, 255, 0.8)";
        ctx.beginPath();
        ctx.arc(this.x - cx, this.y - cy, this.w, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// --- Entities ---
class Entity {
    constructor(x, y, w, h) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.vx = 0; this.vy = 0;
        this.grounded = false;
        this.facingRight = true;
        this.hp = 100; this.maxHp = 100;
        this.flashTimer = 0;
    }
    move(dt) {
        this.vy += GRAVITY;
        if(this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;

        this.x += this.vx; this.checkCollisionX();
        this.y += this.vy; this.checkCollisionY();
        if (this.flashTimer > 0) this.flashTimer -= dt;
    }
    checkCollisionX() {
        for (let p of platforms) {
            if (AABB(this, p)) {
                if (this.vx > 0) { this.x = p.x - this.w; this.vx = 0; }
                else if (this.vx < 0) { this.x = p.x + p.w; this.vx = 0; }
            }
        }
    }
    checkCollisionY() {
        this.grounded = false;
        for (let p of platforms) {
            if (AABB(this, p)) {
                if (this.vy > 0) { this.y = p.y - this.h; this.vy = 0; this.grounded = true; }
                else if (this.vy < 0) { this.y = p.y + p.h; this.vy = 0; }
            }
        }
    }
}

class Player extends Entity {
    constructor(x, y) {
        super(x, y, 20, 36);
        this.speed = 4.5;
        this.jumpForce = 9;
        this.maxJumpTime = 15; // Frames allowed to hold jump
        this.jumpTimer = 0;
        this.doubleJumped = false;
        
        this.level = 1; this.xp = 0; this.xpNext = 100; this.score = 0;
        this.baseDamage = 25; this.attackSpeedMult = 1.0;
        this.attacking = false; this.attackTimer = 0; this.comboStep = 0; this.comboWaitTimer = 0;
        this.charging = false; this.chargeTime = 0;
        this.justClicked = false;
        this.justRightClicked = false;
        this.justJumped = false;
        this.trail = []; // For scarf
    }
    
    update(dt) {
        if (keys['KeyA'] || keys['ArrowLeft']) { this.vx = -this.speed; this.facingRight = false; }
        else if (keys['KeyD'] || keys['ArrowRight']) { this.vx = this.speed; this.facingRight = true; }
        else { this.vx *= FRICTION; }
        
        let jumpInput = keys['Space'] || keys['KeyW'] || keys['ArrowUp'];
        
        // Reset double jump on ground
        if (this.grounded) {
            this.doubleJumped = false;
            this.jumpTimer = 0;
        }

        // Variable Jump & Double Jump Logic
        if (jumpInput) {
            if (!this.justJumped) {
                this.justJumped = true;
                if (this.grounded) {
                    // Initial Jump
                    this.vy = -this.jumpForce;
                    this.grounded = false;
                    this.jumpTimer = this.maxJumpTime;
                    for(let i=0; i<5; i++) particles.push(new Particle(this.x + this.w/2, this.y + this.h, "#aaa", 2, 10)); // Jump dust
                } else if (!this.doubleJumped && !this.grounded) {
                    // Double Jump
                    this.vy = -this.jumpForce * 0.9;
                    this.doubleJumped = true;
                    this.jumpTimer = this.maxJumpTime * 0.5; // Shorter variable height for double jump
                    // Double jump effect
                    for(let i=0; i<8; i++) particles.push(new Particle(this.x + this.w/2, this.y + this.h, "#0ff", 3, 15, true));
                }
            } else if (this.jumpTimer > 0) {
                // Holding Jump to go higher
                this.vy -= 0.4 * dt;
                this.jumpTimer -= dt;
            }
        } else {
            this.justJumped = false;
            this.jumpTimer = 0; // Cut jump short if released
        }

        // Light Attack (Left Click / Z)
        let attackInput = (keys['KeyZ'] || mouse.clicked);
        if (attackInput && !this.justClicked && !this.charging) { 
            this.justClicked = true; 
            this.triggerAttack(); 
        } else if (!attackInput) { 
            this.justClicked = false; 
        }

        // Heavy Attack Hold (Right Click / X)
        let heavyInput = (keys['KeyX'] || mouse.rightClicked);
        if (heavyInput && !this.attacking) {
            this.charging = true;
            this.chargeTime += dt;
            this.vx *= 0.1; // extreme slow down while charging
            
            // Charge visual particle gather
            if (Math.random() < 0.3) {
                let px = this.x + this.w/2 + (Math.random()-0.5)*40;
                let py = this.y + this.h/2 + (Math.random()-0.5)*40;
                particles.push(new Particle(px, py, "#ff00ea", 1, 10)); // Purple gather
            }
            
            if (!this.justRightClicked) this.justRightClicked = true;
        } else if (!heavyInput && this.justRightClicked) {
            // Release Heavy Attack
            this.justRightClicked = false;
            if (this.charging) {
                this.charging = false;
                if (this.chargeTime > 30) {
                    this.triggerHeavyAttack();
                }
                this.chargeTime = 0;
            }
        }

        if (this.attacking) {
            this.attackTimer -= dt * this.attackSpeedMult;
            this.vx *= 0.3; // Huge friction during attack
            if (this.attackTimer <= 0) {
                this.attacking = false;
                if(this.comboStep === 4) {
                    this.comboStep = 0; // Reset after heavy
                } else {
                    this.comboWaitTimer = 25; 
                }
                this.doDamage();
            }
        }

        if (this.comboWaitTimer > 0 && !this.attacking) {
            this.comboWaitTimer -= dt;
            if (this.comboWaitTimer <= 0) this.comboStep = 0;
        }

        this.move(dt);
        
        // Scarf update (ribbon trailing)
        // Insert neck position
        this.trail.unshift({x: this.facingRight ? this.x + 5 : this.x + this.w - 5, y: this.y + 12});
        if (this.trail.length > 8) this.trail.pop();
    }

    triggerAttack() {
        if (this.attacking) return;
        this.attacking = true;
        this.comboStep = (this.comboStep + 1) % 4;
        if (this.comboStep === 0) this.comboStep = 1;
        this.attackTimer = this.comboStep === 3 ? 18 : 12;
        this.vx += this.facingRight ? 6 : -6; // Lunge forward
        
        // Swing dust
        for(let i=0; i<3; i++) particles.push(new Particle(this.x + this.w/2, this.y + this.h, "#555", 3, 10));
    }

    triggerHeavyAttack() {
        this.attacking = true;
        this.comboStep = 4; // Indicator for heavy attack
        this.attackTimer = 25;
        this.vx += this.facingRight ? 16 : -16; // Huge Lunge
        this.vy = -4; // Slight hop
        cameraShake.trigger(5, 10);
        for(let i=0; i<10; i++) particles.push(new Particle(this.x + this.w/2, this.y + this.h, "#ff00ea", 5, 20)); // Blast off dust
    }

    doDamage() {
        let isHeavy = (this.comboStep === 4);
        
        let hitbox = {
            x: this.facingRight ? this.x + this.w : this.x - (isHeavy ? 100 : 60),
            y: this.y - (isHeavy ? 30 : 15), 
            w: (isHeavy ? 100 : 60), 
            h: this.h + (isHeavy ? 60 : 30)
        };

        let damage = this.baseDamage + (this.comboStep === 3 ? this.baseDamage * 0.8 : 0);
        if (isHeavy) damage = this.baseDamage * 3.5; // Massive damage

        let crit = Math.random() < (isHeavy ? 0.5 : 0.25);
        if (crit) { damage *= 2; cameraShake.trigger(isHeavy ? 15 : 8, 10); }

        // Sword Visual Arc Particles
        for(let i=0; i<(isHeavy ? 20 : 8); i++) {
            particles.push(new Particle(
                hitbox.x + Math.random() * hitbox.w,
                hitbox.y + Math.random() * hitbox.h,
                isHeavy ? "#ff00ea" : "#ff0055", isHeavy ? 6 : 3, 15
            ));
        }

        for (let enemy of enemies) {
            if (AABB(hitbox, enemy)) {
                enemy.takeDamage(damage, this.facingRight);
                if (crit) cameraShake.trigger(10, 15);
                if (isHeavy) {
                    // Huge knockback
                    enemy.vx = this.facingRight ? 15 : -15;
                    enemy.vy = -8;
                }
            }
        }
    }

    gainXp(amount) {
        this.xp += amount; this.score += amount * 10;
        if (this.xp >= this.xpNext) this.levelUp();
    }

    levelUp() {
        this.xp -= this.xpNext; this.level++;
        this.xpNext = Math.floor(this.xpNext * 1.5);
        this.hp = this.maxHp;
        if (this.level >= 2 && this.level <= 5) this.attackSpeedMult += 0.10;
        else if (this.level >= 6) this.baseDamage += 5;
        
        texts.push(new FloatingText(this.x, this.y - 30, "LEVEL UP", "#ffea00"));
        for(let i=0; i<30; i++) particles.push(new Particle(this.x + this.w/2, this.y + this.h, "#ffea00", 6, 40));
    }

    draw(ctx, cx, cy) {
        let px = this.x - cx, py = this.y - cy;
        
        // Draw Scarf Physics (Wind + Movement inverted)
        ctx.beginPath();
        ctx.strokeStyle = "#e6194b";
        ctx.lineWidth = 4;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        let wind = Math.sin(performance.now() * 0.005) * 5;
        for(let i=0; i<this.trail.length; i++) {
            let tx = this.trail[i].x - cx + (i * (this.facingRight ? -2 : 2)) + (i * wind * 0.1);
            let ty = this.trail[i].y - cy + (i * 1.5);
            if(i===0) ctx.moveTo(tx, ty);
            else ctx.lineTo(tx, ty);
        }
        ctx.stroke();

        ctx.filter = this.flashTimer > 0 ? "brightness(3)" : "none";

        // Draw Ninja Body
        ctx.fillStyle = "#111217";
        ctx.shadowBlur = 0;
        ctx.fillRect(px, py + 12, this.w, this.h - 12); // Torso

        // Draw Ninja Head
        ctx.fillStyle = "#1b1d26";
        ctx.beginPath();
        ctx.arc(px + this.w/2, py + 10, 12, 0, Math.PI*2);
        ctx.fill();

        // Eye Glow
        ctx.fillStyle = "#0ff";
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#00f3ff";
        let eyeX = this.facingRight ? px + this.w/2 + 5 : px + this.w/2 - 8;
        ctx.fillRect(eyeX, py + 6, 4, 3);
        ctx.shadowBlur = 0;

        ctx.filter = "none";

        // Draw Sword Attack
        if (this.attacking) {
            let isHeavy = (this.comboStep === 4);
            let totalTime = isHeavy ? 25 : (this.comboStep === 3 ? 18 : 12);
            let progress = 1 - (this.attackTimer / totalTime);
            ctx.save();
            
            // Neon Glow effect
            ctx.shadowBlur = isHeavy ? 30 : 20;
            ctx.shadowColor = isHeavy ? "#ff00ea" : "#ff0055";
            ctx.fillStyle = isHeavy ? "rgba(255, 0, 234, 0.9)" : "rgba(255, 0, 85, 0.9)";
            
            let sx = this.facingRight ? px + this.w + 10 : px - 10;
            let sy = py + 16;
            ctx.translate(sx, sy);
            
            let angle = 0, length = isHeavy ? 100 : (60 + (this.comboStep === 3 ? 30 : 0));
            
            if (this.comboStep === 1) angle = Math.PI/2 - progress * Math.PI*1.2;
            else if (this.comboStep === 2) angle = -Math.PI/2 + progress * Math.PI*1.2;
            else if (this.comboStep === 3) angle = 0; // Thrust
            else if (isHeavy) {
                // Circular massive spin for heavy
                angle = progress * Math.PI * 4; // spin twice
            }

            if (!this.facingRight && this.comboStep !== 3 && !isHeavy) angle = Math.PI - angle;
            else if (!this.facingRight && !isHeavy) angle = Math.PI;

            ctx.rotate(angle);
            
            // Blade shape
            ctx.beginPath();
            if (this.comboStep === 3) {
                ctx.moveTo(0, -6); ctx.lineTo(length, 0); ctx.lineTo(0, 6);
            } else if (isHeavy) {
                // Crescent shape for heavy spin
                ctx.moveTo(0, -10);
                ctx.quadraticCurveTo(length, -30, length, 0);
                ctx.quadraticCurveTo(length, 30, 0, 10);
            } else {
                ctx.moveTo(0, -4);
                ctx.quadraticCurveTo(length/2, -15, length, 0);
                ctx.quadraticCurveTo(length/2, 10, 0, 4);
            }
            ctx.fill();
            ctx.restore();
            ctx.shadowBlur = 0;
        }

        // Charge glow aura
        if (this.charging) {
            let auraSize = Math.min(30, this.chargeTime);
            ctx.beginPath();
            ctx.arc(px + this.w/2, py + this.h/2, this.w + auraSize, 0, Math.PI*2);
            ctx.fillStyle = `rgba(255, 0, 234, ${auraSize/100})`;
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = `rgba(255, 0, 234, ${auraSize/50})`;
            ctx.stroke();
        }
    }
}

class Enemy extends Entity {
    constructor(x, y) {
        super(x, y, 24, 30);
        this.speed = 1.0 + Math.random()*1.5;
        this.hp = 60; this.maxHp = 60;
        this.patrolTimer = 60;
        this.bouncePhase = Math.random() * Math.PI * 2;
    }
    update(dt) {
        this.patrolTimer -= dt;
        if (this.patrolTimer <= 0) {
            this.patrolTimer = 60 + Math.random() * 60;
            this.facingRight = !this.facingRight;
        }
        
        this.vx = this.facingRight ? this.speed : -this.speed;
        this.bouncePhase += 0.1 * dt;
        
        // Edge cliff detection
        let edgeX = this.facingRight ? this.x + this.w + 5 : this.x - 5;
        let edgeY = this.y + this.h + 5;
        let onGround = false;
        for (let p of platforms) {
            if (edgeX > p.x && edgeX < p.x + p.w && edgeY > p.y && edgeY < p.y + p.h) { onGround = true; break; }
        }
        if (!onGround && this.grounded) { this.facingRight = !this.facingRight; this.patrolTimer = 60; }

        if (AABB(this, player) && player.flashTimer <= 0) {
            player.hp -= 15;
            player.flashTimer = 40;
            player.vx = this.facingRight ? 8 : -8;
            player.vy = -6;
            cameraShake.trigger(12, 15);
            for(let i=0; i<15; i++) particles.push(new Particle(player.x+10, player.y+16, "#f00", 5, 25, true));
        }
        this.move(dt);
    }
    takeDamage(amt, hitRight) {
        this.hp -= amt; this.flashTimer = 8;
        this.vx = hitRight ? 6 : -6;
        this.vy = -4;
        
        texts.push(new FloatingText(this.x, this.y, Math.floor(amt), "#fff"));
        for(let i=0; i<10; i++) particles.push(new Particle(this.x+10, this.y+15, "#a10000", 5, 30, true)); // Blood physics
        
        if (this.hp <= 0) {
            for(let i=0; i<4; i++) orbs.push(new Orb(this.x + 10, this.y + 10)); // XP Drop
            for(let i=0; i<25; i++) particles.push(new Particle(this.x+10, this.y+15, "#a10000", 8, 40, true)); // Big gore
            cameraShake.trigger(5, 10);
        }
    }
    draw(ctx, cx, cy) {
        let ex = this.x - cx, ey = this.y - cy;
        // Bobbing animation for beast
        let bob = Math.sin(this.bouncePhase) * 3;
        ey += bob;

        ctx.filter = this.flashTimer > 0 ? "brightness(3)" : "none";

        // Body Beast
        ctx.fillStyle = "#150b0b"; // dark red black
        ctx.beginPath();
        ctx.moveTo(ex, ey + this.h);
        ctx.lineTo(ex + this.w, ey + this.h);
        ctx.lineTo(ex + this.w - (this.facingRight ? -5 : 5), ey + 8);
        ctx.lineTo(ex + (this.facingRight ? 5 : -5), ey + 8);
        ctx.fill();

        // Horns
        ctx.fillStyle = "#050202";
        ctx.beginPath();
        ctx.moveTo(ex + this.w/2, ey + 8);
        ctx.lineTo(ex + this.w/2 - 10, ey - 5);
        ctx.lineTo(ex + this.w/2 - 5, ey + 8);
        ctx.fill();

        // Beast Eyes
        ctx.fillStyle = "#ff0000";
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#ff0000";
        let eyeX = this.facingRight ? ex + this.w - 8 : ex + 4;
        ctx.fillRect(eyeX, ey + 10, 5, 3);
        ctx.shadowBlur = 0;

        ctx.filter = "none";
    }
}

// --- Parallax Background Renderer ---
function drawParallaxBackground(ctx, camX, camY) {
    // 1. Sky Gradient
    let skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    skyGrad.addColorStop(0, "#080612"); // deep night
    skyGrad.addColorStop(1, "#18142b"); // twilight horizon
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Huge Moon
    ctx.fillStyle = "#e5dfd3";
    ctx.shadowBlur = 60;
    ctx.shadowColor = "rgba(229, 223, 211, 0.5)";
    ctx.beginPath();
    ctx.arc(canvas.width - 200 - camX * 0.05, 200 - camY * 0.05, 80, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 3. Back Mountains (Cam Speed 0.1)
    ctx.fillStyle = "#0c0a13";
    ctx.beginPath();
    ctx.moveTo(0, canvas.height);
    for(let i=0; i<30; i++) {
        let px = (i * 180) - (camX * 0.1) % 180;
        let py = canvas.height - 300 + Math.sin(i * 77) * 150; // Random looking height
        ctx.lineTo(px, py);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.fill();

    // 4. Mid Ruins/Trees (Cam Speed 0.3)
    ctx.fillStyle = "#120f1c";
    ctx.beginPath();
    ctx.moveTo(0, canvas.height);
    for(let i=0; i<40; i++) {
        let px = (i * 120) - (camX * 0.3) % 120;
        let py = canvas.height - 180 + Math.sin(i * 123) * 80;
        ctx.lineTo(px, py);
        // Draw some ruins spikes
        ctx.lineTo(px + 10, py - 40);
        ctx.lineTo(px + 20, py);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.fill();
}

// --- Tile Renderer ---
function drawTile(ctx, p, camX, camY) {
    let tx = p.x - camX, ty = p.y - camY;
    
    // Main Block
    ctx.fillStyle = p.type === '2' ? "#1e2236" : "#242533";
    ctx.fillRect(tx, ty, p.w, p.h);
    
    // "Moss" or "Neon Circuit" top border
    ctx.fillStyle = p.type === '2' ? "#00ffff" : "#1a1625";
    if (p.type === '2') {
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#00ffff";
    }
    ctx.fillRect(tx, ty, p.w, 4);
    ctx.shadowBlur = 0;

    // Stone texture detail (Horizontal Scratches)
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(tx + 8, ty + 10, 15, 2);
    ctx.fillRect(tx + 20, ty + 25, 12, 2);
    ctx.fillRect(tx + 5, ty + 30, 8, 2);

    // Edge lines
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(tx, ty, p.w, p.h);
}

// --- Globals ---
let player = new Player(100, 100);
let enemies = [
    new Enemy(400, 200),
    new Enemy(600, 400),
    new Enemy(900, 400),
    new Enemy(1200, 300),
    new Enemy(1500, 300)
];
let particles = [];
let texts = [];
let orbs = [];

// Game Loop
let lastTime = performance.now();
const TARGET_FPS = 60;
const TIME_STEP = 1000 / TARGET_FPS;

function update(dt) {
    player.update(dt);
    
    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].update(dt);
        if (enemies[i].hp <= 0) enemies.splice(i, 1);
    }
    
    if (Math.random() < 0.015 && enemies.length < 12) {
        enemies.push(new Enemy(player.x + (Math.random() < 0.5 ? 800 : -800), 50));
    }

    for (let i = orbs.length - 1; i >= 0; i--) {
        orbs[i].update(dt);
        if (AABB(orbs[i], player)) { player.gainXp(25); orbs.splice(i, 1); continue; }
        if (orbs[i].life <= 0) orbs.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(dt);
        if (particles[i].life <= 0) particles.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
        texts[i].update(dt);
        if (texts[i].life <= 0) texts.splice(i, 1);
    }

    cameraShake.update(dt);
}

function drawHUD() {
    // Health Bar
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(30, 30, 200, 20);
    ctx.fillStyle = "#ff003c";
    let hpRatio = Math.max(0, player.hp / player.maxHp);
    ctx.fillRect(30, 30, 200 * hpRatio, 20);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, 200, 20);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px 'Segoe UI', sans-serif";
    ctx.fillText("HP " + Math.floor(player.hp), 35, 45);

    // XP Bar
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(30, 60, 200, 10);
    ctx.fillStyle = "#0ff";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#0ff";
    let xpRatio = player.xp / player.xpNext;
    ctx.fillRect(30, 60, 200 * xpRatio, 10);
    ctx.shadowBlur = 0;
    ctx.strokeRect(30, 60, 200, 10);
    
    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px 'Segoe UI', sans-serif";
    ctx.fillText("LVL " + player.level, 30, 100);

    // Score
    ctx.textAlign = "right";
    ctx.font = "bold 28px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#ffd700";
    ctx.shadowBlur = 5; ctx.shadowColor = "#ffea00";
    ctx.fillText("SCORE: " + player.score, canvas.width - 40, 50);
    ctx.shadowBlur = 0;
    ctx.textAlign = "left"; 
    
    // Death screen
    if (player.hp <= 0) {
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ff003c";
        ctx.textAlign = "center";
        ctx.font = "bold 60px 'Segoe UI', sans-serif";
        ctx.fillText("WASTED", canvas.width/2, canvas.height/2);
        ctx.fillStyle = "#fff";
        ctx.font = "24px 'Segoe UI', sans-serif";
        ctx.fillText("F5 to Resurrect", canvas.width/2, canvas.height/2 + 50);
        ctx.textAlign = "left";
    }
}

function draw() {
    // 1. Smooth Camera Lerp
    let targetCamX = player.x + player.w/2 - canvas.width / 2;
    let targetCamY = player.y + player.h/2 - canvas.height / 2;
    targetCamX = Math.max(0, Math.min(targetCamX, MAP[0].length * TILE_SIZE - canvas.width));
    targetCamY = Math.max(0, Math.min(targetCamY, MAP.length * TILE_SIZE - canvas.height));

    camX = lerp(camX, targetCamX, 0.1);
    camY = lerp(camY, targetCamY, 0.1);

    let shakeOffset = cameraShake.getOffset();
    let finalCamX = camX + shakeOffset.x;
    let finalCamY = camY + shakeOffset.y;

    // 2. Parallax
    drawParallaxBackground(ctx, finalCamX, finalCamY);

    // 3. World Group
    for (let p of platforms) drawTile(ctx, p, finalCamX, finalCamY);
    for (let orb of orbs) orb.draw(ctx, finalCamX, finalCamY);
    for (let enemy of enemies) enemy.draw(ctx, finalCamX, finalCamY);
    player.draw(ctx, finalCamX, finalCamY);

    // 4. Foreground Entities (Particles / Texts)
    // Fog overlay
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = "#fff";
    for(let i=0; i<3; i++) {
        ctx.fillRect( ((performance.now()*0.02 + i*200) % canvas.width), 0, 500, canvas.height);
    }
    ctx.globalAlpha = 1.0;

    for (let p of particles) p.draw(ctx, finalCamX, finalCamY);
    for (let t of texts) t.draw(ctx, finalCamX, finalCamY);

    // 5. Interface
    drawHUD();
}

function loop(timestamp) {
    requestAnimationFrame(loop);
    let dt = timestamp - lastTime;
    if (dt > 100) dt = 100;
    let steps = dt / TIME_STEP;
    
    if (player.hp > 0) update(steps);
    draw();
    lastTime = timestamp;
}

requestAnimationFrame(loop);
