import * as THREE from 'three';
import { Random } from '../core/Random.js';
import { buildArena } from './Arena.js';
import { PlayerController } from './PlayerController.js';
import { Weapon } from './Weapon.js';
import { Effects } from './Effects.js';
import { Enemy } from './Enemy.js';
import { LootSystem } from './Loot.js';
import { Objectives } from './Objectives.js';
import { Inventory } from '../inventory/Inventory.js';
import { itemDef, itemName } from '../inventory/Item.js';
import { ENEMIES } from '../data/enemies.js';
import { Hud } from '../ui/hud/Hud.js';
import { ScopeOverlay } from './ScopeOverlay.js';
import { ViewmodelLayer } from './ViewmodelLayer.js';
import { weaponEnvironment } from './Environment.js';
import { setWeaponEnvironment } from './WeaponModel.js';
import { CoopSync } from '../net/CoopSync.js';

const RESPAWN_DELAY = 2.2;
const EXTRACT_RADIUS = 3.4;

// One playable mission. Owns its scene graph entirely and tears all of it down
// in dispose(), so lobby -> match -> lobby can repeat without leaking.
//
// `net` is an optional NetSession. With it, the match is one seat in a co-op
// run and defers to CoopSync for who owns what; without it, everything below
// behaves exactly as single-player always has.
export class Match {
  constructor({ renderer, mission, profile, loadout, hudRoot, input, onFinish, net = null }) {
    this.renderer = renderer;
    this.mission = mission;
    this.profile = profile;
    this.input = input;
    this.onFinish = onFinish;
    this.finished = false;

    this.rng = new Random(mission.seed ^ 0x9e3779b9);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fb6c4);
    this.scene.fog = new THREE.Fog(0x9fb6c4, mission.arena.size * 0.55, mission.arena.size * 1.5);

    this.camera = new THREE.PerspectiveCamera(
      profile.settings.fov, window.innerWidth / window.innerHeight, 0.05, 600,
    );
    this.scene.add(this.camera);

    this.arena = buildArena(mission.arena, mission.seed);
    this.scene.add(this.arena.group);

    this.effects = new Effects(this.scene);
    setWeaponEnvironment(weaponEnvironment(renderer));

    // The held weapon is drawn in its own pass with a fixed narrow camera.
    this.viewmodels = new ViewmodelLayer();
    this.viewmodels.resize(window.innerWidth, window.innerHeight);

    this.player = new PlayerController(this.camera, this.arena.colliders, this.arena.half);
    this.player.spawn(this.arena.playerSpawn);

    // Loadout items are cloned so a failed run cannot corrupt the stash.
    const carried = loadout.map((it) => ({ ...it }));
    this.inventory = new Inventory(carried, { ...profile.ammo });

    this.hud = new Hud(hudRoot);
    this.weapon = null;

    const luck = Math.min(0.9, (mission.level - 1) * 0.09);
    this.loot = new LootSystem(this.scene, this.rng, luck, this.inventory, {
      onPickup: (text, color) => this.hud.toast(text, color),
      onBlocked: (text) => this.hud.toast(text, '#ff6a6a'),
      onChestOpened: (chest, byId) => {
        if (byId == null) this.stats.chests++;
        this.objectives.onChestOpened();
        this.hud.toast(byId == null ? 'Chest opened' : `${this.coop.playerName(byId)} opened a chest`, '#d8b04a');
        this.coop?.announceChest(chest.index, byId);
      },
    });
    this.loot.spawnChests(this.arena.chestSpots);

    this.objectives = new Objectives(mission);
    this.objectives.on('complete', () => this.finish(true));
    this.objectives.on('objective', (o) => this.hud.toast(`Objective: ${o.label}`, '#4fd66f'));

    this.enemies = [];
    this.nextEnemyId = 1;
    this.spawnedCount = 0;
    this.spawnTimer = 1.5;
    this.stats = { kills: 0, chests: 0, headshots: 0, damage: 0, time: 0 };

    this.scope = null;
    this.useTimer = 0;
    this.useItem = null;
    this.deathTimer = 0;
    this.paused = false;

    // Must exist before the first weapon: the weapon context asks it for the
    // hit hook. It also flips the loot system to client mode when needed.
    this.coop = net ? new CoopSync(this, net) : null;

    this._equipFirstWeapon();
    this.hud.setBanner(mission.name, mission.brief);
    this.hud.objectiveList(this.objectives.view());
  }

  // True when this match simulates the world: single-player, or the co-op host.
  get isAuthority() {
    return !this.coop || this.coop.isHost;
  }

  // --- weapons ---------------------------------------------------------------

  _weaponCtx() {
    return {
      camera: this.camera,
      scene: this.scene,
      effects: this.effects,
      arena: this.arena,
      viewmodels: this.viewmodels,
      enemies: this.enemies,
      player: this.player,
      inventory: this.inventory,
      onDamage: (info) => this._onEnemyDamaged(info),
      onKill: (enemy) => this._onEnemyKilled(enemy),
      applyHit: this.coop?.isClient
        ? (enemy, dmg, isHead) => this.coop.clientHit(enemy, dmg, isHead)
        : null,
    };
  }

  _enemyCtx() {
    return {
      scene: this.scene,
      colliders: this.arena.colliders,
      arenaHalf: this.arena.half,
      player: this.player,
      effects: this.effects,
      onPlayerDamaged: (dmg, from, targetId) => this._onPlayerDamaged(dmg, from, targetId),
    };
  }

  _equipFirstWeapon() {
    const idx = this.inventory.slots.findIndex((i) => i && i.kind === 'weapon');
    this.inventory.select(idx === -1 ? 0 : idx);
    this._syncWeapon();
  }

  // Rebuilds the held weapon when the active slot changes.
  _syncWeapon() {
    const item = this.inventory.activeItem;
    const same = this.weapon && this.weapon.item === item;
    if (same) return;
    this.weapon?.dispose();
    this.weapon = null;
    if (item && item.kind === 'weapon') {
      this.weapon = new Weapon(item, this._weaponCtx());
    }
  }

  // --- combat callbacks ------------------------------------------------------

  _onEnemyDamaged({ enemy, damage, isHead, point }) {
    this.stats.damage += damage;
    if (isHead) this.stats.headshots++;
    this.hud.hitMark(isHead);
    const p = point.clone().project(this.camera);
    if (p.z < 1) {
      this.hud.damageNumber(
        (p.x * 0.5 + 0.5) * window.innerWidth,
        (-p.y * 0.5 + 0.5) * window.innerHeight,
        damage, isHead,
      );
    }
  }

  // `byId` is the co-op peer who landed the killing shot (null = us). Only the
  // authority ever gets here; clients hear about kills via _onKillAnnounced.
  _onEnemyKilled(enemy, byId = null) {
    if (byId == null) this.stats.kills++;
    this.objectives.onKill();
    this.loot.dropFromEnemy(enemy.pos);
    this.hud.kill(byId == null
      ? `Eliminated ${enemy.def.name}`
      : `${this.coop.playerName(byId)} eliminated ${enemy.def.name}`);
    this.coop?.announceKill(enemy, byId);
  }

  // Co-op client: the host confirmed a kill.
  _onKillAnnounced(byId, enemyName) {
    if (byId === this.coop.localId) {
      this.stats.kills++;
      this.hud.kill(`Eliminated ${enemyName}`);
    } else {
      this.hud.kill(`${this.coop.playerName(byId)} eliminated ${enemyName}`);
    }
  }

  // Co-op client: the host confirmed a chest opened.
  _onChestOpenedRemote(byId) {
    if (byId === this.coop.localId) {
      this.stats.chests++;
      this.hud.toast('Chest opened', '#d8b04a');
    } else {
      this.hud.toast(`${this.coop.playerName(byId)} opened a chest`, '#d8b04a');
    }
  }

  // `targetId` names a remote player a bot shot (co-op host only); null is us.
  _onPlayerDamaged(amount, fromPos, targetId = null) {
    if (targetId != null) {
      this.coop?.hurtRemote(targetId, amount, fromPos);
      return;
    }
    if (!this.player.alive) return;
    this.player.takeDamage(amount, fromPos);
    this.hud.tookDamage(this.player.damageIndicatorAngle());
    if (!this.player.alive) {
      this.deathTimer = RESPAWN_DELAY;
      if (this.coop) this.hud.setBanner('You went down', 'Spectating — your squad is still in the fight');
      else this.hud.setBanner('You went down', 'Mission failed');
    }
  }

  // --- spawning --------------------------------------------------------------

  _spawnTick(dt) {
    const cfg = this.mission.spawns;
    const alive = this.enemies.filter((e) => e.alive).length;
    if (alive >= cfg.maxAlive) return;
    if (this.spawnedCount >= cfg.budget) return;

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = this.rng.range(1.2, 3.0);

    // Spawn out of everyone's immediate view so bots don't pop in on top of them.
    const players = this.coop ? this.coop.playerPositions() : [this.player.pos];
    const candidates = this.arena.enemySpawns
      .filter((s) => players.every((p) => s.distanceTo(p) > 18));
    this.rng.shuffle(candidates);
    const spot = candidates[0] ?? this.rng.pick(this.arena.enemySpawns);

    const typeId = this.rng.pick(cfg.types);
    const enemy = new Enemy(ENEMIES[typeId], spot, this._enemyCtx());
    enemy.id = this.nextEnemyId++;
    this.enemies.push(enemy);
    this.spawnedCount++;
  }

  // --- input -----------------------------------------------------------------

  _handleActions(dt) {
    const input = this.input;

    const slot = input.takeSlotRequest();
    if (slot >= 0) {
      this.inventory.select(slot);
      this._syncWeapon();
      this._cancelUse();
    }
    const wheel = input.takeWheel();
    if (wheel !== 0) {
      this.inventory.cycle(wheel > 0 ? 1 : -1);
      this._syncWeapon();
      this._cancelUse();
    }

    if (input.pressed('reload')) this.weapon?.startReload();

    if (input.pressed('drop')) {
      const item = this.inventory.removeAt(this.inventory.active);
      if (item) {
        this.loot.dropAt(this.player.pos.clone().addScaledVector(this.player.forwardVector(), 1.4), item);
        this.hud.toast(`Dropped ${itemName(item)}`, '#9aa0a6');
        this._syncWeapon();
      }
    }

    // Chest interaction.
    const chest = this.loot.chestNear(this.player.pos);
    if (chest && input.pressed('interact')) this.loot.openChest(chest);

    // Held-F consumable use.
    const active = this.inventory.activeItem;
    const usable = active && active.kind === 'consumable';
    if (usable && input.down('use')) {
      if (this.useItem !== active) {
        this.useItem = active;
        this.useTimer = itemDef(active).useTime;
      }
      this.useTimer -= dt;
      if (this.useTimer <= 0) this._finishUse();
    } else if (this.useItem) {
      this._cancelUse();
    }

    // Prompt priority: using > chest > nothing.
    if (this.useItem) {
      const def = itemDef(this.useItem);
      const pct = Math.round((1 - this.useTimer / def.useTime) * 100);
      this.hud.setPrompt(`Using ${def.name}… ${pct}%`);
    } else if (chest) {
      this.hud.setPrompt('[E] Open chest');
    } else if (usable) {
      this.hud.setPrompt(`[F] Use ${itemDef(active).name}`);
    } else {
      this.hud.setPrompt(null);
    }
  }

  _cancelUse() {
    this.useItem = null;
    this.useTimer = 0;
  }

  _finishUse() {
    const item = this.useItem;
    const def = itemDef(item);
    this._cancelUse();
    const slot = this.inventory.slots.indexOf(item);
    if (slot === -1) return;
    if (def.heal) {
      const healed = this.player.heal(def.heal, def.cap);
      this.hud.toast(`+${Math.round(healed)} health`, '#4fd66f');
    }
    if (def.shield) {
      const gained = this.player.addShield(def.shield, def.shieldCap);
      this.hud.toast(`+${Math.round(gained)} shield`, '#4aa9ff');
    }
    this.inventory.consumeAt(slot);
    this._syncWeapon();
  }

  // --- loop ------------------------------------------------------------------

  update(dt) {
    if (this.finished) return;

    const active = !this.paused && this.input.locked;
    if (!active && !this.coop) {
      // Single-player freezes outright. Still drain edge-triggered input so
      // nothing queues up while paused.
      this.input.endFrame();
      return;
    }
    // In co-op the world keeps moving while a menu is open: the host's bots
    // are everyone's bots, and a client's squad does not wait for them.

    this.stats.time += dt;

    if (this.player.alive) {
      if (active) {
        // Aiming slows the mouse in proportion to magnification, or an 8x scope
        // is unusable.
        const look = this.input.takeMouseDelta();
        const aim = this.weapon?.aimSensitivity ?? 1;
        this.player.look(look.x * aim, look.y * aim, this.profile.settings.invertY);
        this.player.update(dt, this.input);
        this._handleActions(dt);
        const ads = this.input.rightDown && !this.useItem;
        this.weapon?.update(dt, this.input.mouseDown && !this.useItem, ads);
      }
    } else {
      this.deathTimer -= dt;
      this.hud.setPrompt(null);
      if (this.coop && active) {
        // Spectate from where you fell: free look, no movement.
        const look = this.input.takeMouseDelta();
        this.player.look(look.x, look.y, this.profile.settings.invertY);
        this.camera.quaternion.setFromEuler(new THREE.Euler(this.player.pitch, this.player.yaw, 0, 'YXZ'));
      }
      // Single-player ends here; co-op waits until nobody is left standing
      // (the host decides), or the host reports the outcome to clients.
      if (this.deathTimer <= 0 && this.isAuthority && (!this.coop || !this.coop.anyAlive())) {
        this.finish(false);
        this.input.endFrame();
        return;
      }
    }
    // A kill can complete the mission from inside weapon.update(), which
    // disposes this match; nothing below may run on a torn-down scene.
    if (this.finished) return;

    if (this.isAuthority) {
      this._spawnTick(dt);
      for (const e of this.enemies) {
        if (this.coop) {
          const t = this.coop.targetFor(e.pos);
          e.update(dt, t.pos, t.alive, t.id);
        } else {
          e.update(dt, this.player.pos, this.player.alive);
        }
      }

      // Reap corpses once their topple animation has played out.
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (!e.alive && e.deathTime > 3) {
          e.dispose();
          this.enemies.splice(i, 1);
        }
      }
    }

    this.loot.update(dt, this.player.pos);
    this.effects.update(dt);

    if (this.isAuthority) {
      const atExtract = this.arena.extractPos.distanceTo(this.player.pos) < EXTRACT_RADIUS
        || !!this.coop?.anyPlayerAt(this.arena.extractPos, EXTRACT_RADIUS);
      this.objectives.tick(dt, atExtract);
      // tick() can complete the mission, which disposes this match immediately.
      if (this.finished) return;
    }

    // Co-op: send our state / the snapshot, and move remote bodies and puppets.
    this.coop?.update(dt);
    if (this.finished) return;

    const view = this._objectiveView();
    const pad = this.arena.extractPad;
    const ext = this.objectives.extractEntry;
    if (ext) {
      const unlocked = this.isAuthority
        ? this.objectives.extractUnlocked
        : !(view[this.objectives.entries.indexOf(ext)]?.locked ?? true);
      pad.visible = unlocked;
      if (pad.visible) pad.material.opacity = 0.35 + Math.sin(this.stats.time * 3) * 0.2;
    }

    this.hud.vitals(this.player.health, this.player.shield);
    this.hud.ammo(this.weapon);
    this.hud.aimState(this.weapon, this.camera.fov);
    this.hud.hotbarState(this.inventory);
    this.hud.objectiveList(view);
    this.hud.update(dt);

    this.input.endFrame();
  }

  // A client shows the host's objective progress; everyone else computes it.
  _objectiveView() {
    if (this.isAuthority) return this.objectives.view();
    return this.coop.objectives ?? this.objectives.view();
  }

  render() {
    this.renderer.render(this.scene, this.camera);

    // Scoped in, the sight picture replaces the gun entirely.
    if (this.weapon?.scopeActive) {
      if (!this.scope) {
        this.scope = new ScopeOverlay(this.renderer);
        this.scope.resize(window.innerWidth, window.innerHeight);
      }
      this.scope.render(this.scene, this.camera, this.player.baseFov / this.weapon.zoom);
    } else {
      this.viewmodels.render(this.renderer);
    }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewmodels.resize(w, h);
    this.scope?.resize(w, h);
  }

  setPaused(paused) {
    this.paused = paused;
  }

  // --- ending ----------------------------------------------------------------

  finish(success) {
    if (this.finished) return;
    this.finished = true;
    // Clients learn the outcome from us; a downed client still fails on its own.
    if (this.coop?.isHost) this.coop.announceEnd(success);
    this.weapon?.syncItem();

    const result = {
      mission: this.mission,
      success,
      kills: this.stats.kills,
      chests: this.stats.chests,
      headshots: this.stats.headshots,
      damage: Math.round(this.stats.damage),
      time: this.stats.time,
      // On success everything in the backpack extracts with you; on a wipe you
      // keep only what you brought in.
      carried: success ? this.inventory.items().map((i) => ({ ...i })) : null,
      ammo: { ...this.inventory.ammo },
      objectives: this._objectiveView(),
    };
    this.onFinish?.(result);
  }

  dispose() {
    this.coop?.dispose();
    this.coop = null;
    this.weapon?.dispose();
    this.weapon = null;
    this.scope?.dispose();
    this.scope = null;
    this.viewmodels.dispose();
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    this.loot.dispose();
    this.effects.dispose();
    this.arena.dispose();
    this.hud.dispose();
    this.scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
        else m?.dispose?.();
      }
    });
    this.scene.clear();
  }
}
