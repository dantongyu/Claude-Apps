import * as THREE from 'three';
import { RARITIES, RARITY_ORDER, rarityOf } from '../data/rarities.js';
import { WEAPONS, CONSUMABLES, AMMO_TYPES } from '../data/weapons.js';
import { makeWeapon, makeConsumable, itemName, maxStack } from '../inventory/Item.js';

const PICKUP_RADIUS = 1.7;
const CHEST_RADIUS = 2.6;

// `luck` shifts the weight curve toward better tiers as missions get harder.
export function rollRarity(rng, luck = 0) {
  const entries = RARITY_ORDER.map((id, i) => ({
    id,
    weight: RARITIES[id].weight * Math.pow(1 + luck, i),
  }));
  return rng.weighted(entries).id;
}

const WEAPON_IDS = Object.keys(WEAPONS);
const CONSUMABLE_IDS = Object.keys(CONSUMABLES);

export function rollLootItem(rng, luck = 0) {
  const roll = rng.next();
  if (roll < 0.58) {
    return makeWeapon(rng.pick(WEAPON_IDS), rollRarity(rng, luck));
  }
  if (roll < 0.82) {
    const id = rng.pick(CONSUMABLE_IDS);
    return makeConsumable(id, rng.int(1, CONSUMABLES[id].stack));
  }
  return { kind: 'ammo', ammo: rng.pick(Object.keys(AMMO_TYPES)), count: rng.int(18, 44) };
}

class Pickup {
  constructor(payload, position, scene, id = 0) {
    this.id = id;
    this.payload = payload; // item object, or { kind:'ammo', ammo, count }
    this.origin = position.clone();
    this.scene = scene;
    this.age = 0;
    this.collected = false;
    this.requested = 0; // co-op client: seconds until we may ask the host again

    const isAmmo = payload.kind === 'ammo';
    const color = isAmmo
      ? new THREE.Color(AMMO_TYPES[payload.ammo].color)
      : new THREE.Color(rarityOf(payload.rarity).color);

    this.geo = isAmmo
      ? new THREE.BoxGeometry(0.24, 0.24, 0.24)
      : new THREE.BoxGeometry(0.5, 0.2, 0.2);
    this.mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.5 });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.position.copy(position).setY(position.y + 0.7);
    this.mesh.castShadow = true;

    // A soft beam makes loot findable across the arena.
    this.beamGeo = new THREE.CylinderGeometry(0.16, 0.16, 3.2, 8, 1, true);
    this.beamMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
    });
    this.beam = new THREE.Mesh(this.beamGeo, this.beamMat);
    this.beam.position.copy(position).setY(position.y + 1.6);
    scene.add(this.mesh, this.beam);
  }

  update(dt) {
    this.age += dt;
    this.mesh.rotation.y += dt * 1.8;
    this.mesh.position.y += Math.sin(this.age * 2.4) * dt * 0.22;
  }

  dispose() {
    this.scene.remove(this.mesh, this.beam);
    this.geo.dispose(); this.mat.dispose();
    this.beamGeo.dispose(); this.beamMat.dispose();
  }
}

class Chest {
  constructor(position, scene, index = 0) {
    this.index = index; // stable across peers: chest spots come from the seeded arena
    this.position = position.clone();
    this.scene = scene;
    this.opened = false;
    this.openT = 0;

    this.baseGeo = new THREE.BoxGeometry(1.1, 0.6, 0.8);
    this.lidGeo = new THREE.BoxGeometry(1.12, 0.22, 0.82);
    this.mat = new THREE.MeshLambertMaterial({ color: 0xb08d3a, emissive: 0x3a2c08 });
    this.lidMat = new THREE.MeshLambertMaterial({ color: 0xd8b04a, emissive: 0x4a3a10 });

    this.group = new THREE.Group();
    const base = new THREE.Mesh(this.baseGeo, this.mat);
    base.position.y = 0.3;
    base.castShadow = true;
    this.lid = new THREE.Mesh(this.lidGeo, this.lidMat);
    this.lid.position.set(0, 0.68, -0.38);
    this.lid.castShadow = true;
    this.group.add(base, this.lid);
    this.group.position.copy(this.position);
    scene.add(this.group);
  }

  update(dt) {
    if (!this.opened) {
      this.group.rotation.y += dt * 0.35;
      return;
    }
    if (this.openT < 1) {
      this.openT = Math.min(1, this.openT + dt * 2.6);
      // Hinge the lid back off the rear edge.
      this.lid.rotation.x = -this.openT * 1.9;
      this.lid.position.y = 0.68 + Math.sin(this.openT * 1.9) * 0.18;
      this.lidMat.emissive.setHex(0x000000);
      this.mat.emissive.setHex(0x000000);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.baseGeo.dispose(); this.lidGeo.dispose();
    this.mat.dispose(); this.lidMat.dispose();
  }
}

// Owns every chest and floor pickup in a match.
//
// In co-op the host is the authority: only it rolls loot, opens chests and
// decides who gets a pickup. A client (`authority === false`) never creates or
// removes anything on its own; it sends requests through `remote` and applies
// what the host announces. Single-player is the host path with `remote` null.
export class LootSystem {
  constructor(scene, rng, luck, inventory, callbacks = {}) {
    this.scene = scene;
    this.rng = rng;
    this.luck = luck;
    this.inventory = inventory;
    this.cb = callbacks; // { onPickup, onChestOpened, onBlocked }
    this.chests = [];
    this.pickups = [];
    this.chestsOpened = 0;
    this.nextId = 1;
    this.authority = true;
    // Set by the co-op layer: { spawn(id, payload, pos), claimed(id, byId),
    //   take(id), drop(payload, pos), openChest(index) }
    this.remote = null;
  }

  spawnChests(spots) {
    spots.forEach((spot, i) => this.chests.push(new Chest(spot, this.scene, i)));
  }

  pickupById(id) {
    return this.pickups.find((p) => p.id === id) ?? null;
  }

  _spawn(id, payload, position) {
    const p = new Pickup(payload, position, this.scene, id);
    this.pickups.push(p);
    return p;
  }

  dropAt(position, payload) {
    if (!this.authority) {
      this.remote?.drop(payload, position);
      return null;
    }
    const jitter = new THREE.Vector3(
      this.rng.range(-0.7, 0.7), 0, this.rng.range(-0.7, 0.7),
    );
    const p = this._spawn(this.nextId++, payload, position.clone().add(jitter));
    this.remote?.spawn(p.id, payload, p.origin);
    return p;
  }

  // Client: the host says a pickup exists here.
  spawnRemote(id, payload, position) {
    if (this.pickupById(id)) return;
    this._spawn(id, payload, position);
  }

  // Client: the host says this pickup is gone. `mine` means we were granted it.
  resolveRemote(id, mine) {
    const p = this.pickupById(id);
    if (!p) return;
    this._remove(p);
    if (!mine) return;
    // The backpack could have filled between the request and the grant; rather
    // than lose the item, hand it straight back to the floor.
    if (!this._collect(p.payload)) this.remote?.drop(p.payload, p.origin);
  }

  // Host: a client asked for a pickup. First request wins.
  grantRemote(id, toId) {
    const p = this.pickupById(id);
    if (!p) return false;
    this._remove(p);
    this.remote?.claimed(id, toId);
    return true;
  }

  _remove(p) {
    const i = this.pickups.indexOf(p);
    if (i === -1) return;
    p.dispose();
    this.pickups.splice(i, 1);
  }

  // Enemies drop a little ammo and occasionally something worth stopping for.
  dropFromEnemy(position) {
    this.dropAt(position, {
      kind: 'ammo', ammo: this.rng.pick(Object.keys(AMMO_TYPES)), count: this.rng.int(12, 30),
    });
    if (this.rng.next() < 0.35) this.dropAt(position, rollLootItem(this.rng, this.luck));
  }

  // Nearest unopened chest the player is standing next to, if any.
  chestNear(pos) {
    for (const c of this.chests) {
      if (!c.opened && c.position.distanceTo(pos) < CHEST_RADIUS) return c;
    }
    return null;
  }

  // `byId` is the co-op peer who asked (null = the local player).
  openChest(chest, byId = null) {
    if (!chest || chest.opened) return false;
    if (!this.authority) {
      this.remote?.openChest(chest.index);
      return false;
    }
    chest.opened = true;
    this.chestsOpened++;
    const count = this.rng.int(2, 3);
    for (let i = 0; i < count; i++) {
      this.dropAt(chest.position, rollLootItem(this.rng, this.luck + 0.35));
    }
    this.dropAt(chest.position, {
      kind: 'ammo', ammo: this.rng.pick(Object.keys(AMMO_TYPES)), count: this.rng.int(30, 60),
    });
    this.cb.onChestOpened?.(chest, byId);
    return true;
  }

  // Client: the host opened this chest (its loot arrives as spawn messages).
  markChestOpened(index) {
    const chest = this.chests[index];
    if (!chest || chest.opened) return null;
    chest.opened = true;
    this.chestsOpened++;
    return chest;
  }

  update(dt, playerPos) {
    for (const c of this.chests) c.update(dt);

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.update(dt);
      if (p.requested > 0) p.requested -= dt;
      if (p.age < 0.4) continue; // brief grace so chest loot doesn't insta-vanish
      if (p.mesh.position.distanceTo(playerPos) > PICKUP_RADIUS) continue;

      if (this.authority) {
        const taken = this._collect(p.payload);
        if (taken) {
          this._remove(p);
          this.remote?.claimed(p.id, null);
        }
        continue;
      }

      // Client: ask the host, but only if it would fit, and not every frame.
      if (!this._canTake(p.payload)) {
        this.cb.onBlocked?.('Backpack full');
        continue;
      }
      if (p.requested > 0) continue;
      p.requested = 0.5;
      this.remote?.take(p.id);
    }
  }

  _canTake(payload) {
    if (payload.kind === 'ammo') return true;
    if (payload.kind === 'consumable') {
      const cap = maxStack(payload);
      const room = this.inventory.slots.some((s) =>
        s && s.kind === 'consumable' && s.itemId === payload.itemId && s.count < cap);
      if (room) return true;
    }
    return !this.inventory.isFull();
  }

  _collect(payload) {
    if (payload.kind === 'ammo') {
      this.inventory.addAmmo(payload.ammo, payload.count);
      this.cb.onPickup?.(`+${payload.count} ${AMMO_TYPES[payload.ammo].name}`, '#e8d16a');
      return true;
    }
    const res = this.inventory.add(payload);
    if (!res.ok) {
      this.cb.onBlocked?.('Backpack full');
      return false;
    }
    this.cb.onPickup?.(itemName(payload), rarityOf(payload.rarity).color);
    return true;
  }

  dispose() {
    for (const c of this.chests) c.dispose();
    for (const p of this.pickups) p.dispose();
    this.chests = [];
    this.pickups = [];
  }
}
