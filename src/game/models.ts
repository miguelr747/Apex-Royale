import * as THREE from 'three';
import { CELL_SIZE, WALL_HEIGHT } from '../shared/gameTypes';
import type { BuildMaterial, BuildPieceType, ConsumableId, Rarity, WeaponId } from '../shared/gameTypes';
import type { ProceduralTextureSet } from './textures';

export interface PlayerRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  headGroup: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  weaponMount: THREE.Group;
  currentWeaponId: string;
}

const RARITY_COLORS: Record<Rarity, number> = {
  common: 0x94a3b8,
  uncommon: 0x22c55e,
  rare: 0x3b82f6,
  epic: 0xa855f7,
  legendary: 0xf59e0b,
};

/**
 * Composite 10-part Fortnite-style Battle Royale character rig.
 * Grounded at bottom-center (y = 0 at boot soles).
 */
export function createPlayerCharacter(skinHex: string): PlayerRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const jacketMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(skinHex),
    roughness: 0.55,
    metalness: 0.1,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.78,
    metalness: 0.05,
  });
  const armorMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.35,
    metalness: 0.65,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xe6b89c,
    roughness: 0.68,
    metalness: 0.02,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.15,
    metalness: 0.85,
    emissive: 0x0284c7,
    emissiveIntensity: 0.35,
  });

  // Legs (pivot at hip y = 0.85)
  const buildLeg = (side: -1 | 1): THREE.Group => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.15, 0.85, 0);

    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.44, 0.24), pantsMat);
    thigh.position.y = -0.22;
    thigh.castShadow = true;
    leg.add(thigh);

    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.32, 0.21), pantsMat);
    shin.position.y = -0.56;
    shin.castShadow = true;
    leg.add(shin);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.3), armorMat);
    boot.position.set(0, -0.77, 0.04);
    boot.castShadow = true;
    leg.add(boot);

    return leg;
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  bodyPivot.add(leftLeg, rightLeg);

  // Tactical Belt + Torso Jacket + Chestplate + Backpack (Back Bling)
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.34), armorMat);
  belt.position.y = 0.89;
  belt.castShadow = true;
  bodyPivot.add(belt);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.56, 0.32), jacketMat);
  torso.position.y = 1.21;
  torso.castShadow = true;
  bodyPivot.add(torso);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.36, 0.36), armorMat);
  vest.position.y = 1.24;
  vest.castShadow = true;
  bodyPivot.add(vest);

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.44, 0.18), armorMat);
  backpack.position.set(0, 1.24, -0.24);
  backpack.castShadow = true;
  bodyPivot.add(backpack);

  const packAccent = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.05), visorMat);
  packAccent.position.set(0, 1.34, -0.33);
  bodyPivot.add(packAccent);

  // Head + Tactical Visor + Headset
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.54, 0);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.1, 8), skinMat);
  neck.position.y = 0.03;
  headGroup.add(neck);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), skinMat);
  head.position.y = 0.22;
  head.castShadow = true;
  headGroup.add(head);

  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.36), jacketMat);
  helmet.position.y = 0.34;
  helmet.castShadow = true;
  headGroup.add(helmet);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.12), visorMat);
  visor.position.set(0, 0.24, 0.13);
  headGroup.add(visor);

  bodyPivot.add(headGroup);

  // Arms (pivot at shoulder y = 1.42)
  const buildArm = (side: -1 | 1): THREE.Group => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.38, 1.42, 0);

    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.22), armorMat);
    shoulder.position.y = -0.04;
    shoulder.castShadow = true;
    arm.add(shoulder);

    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.44, 0.18), jacketMat);
    sleeve.position.y = -0.28;
    sleeve.castShadow = true;
    arm.add(sleeve);

    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 0.16), armorMat);
    glove.position.y = -0.54;
    arm.add(glove);

    return arm;
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);
  bodyPivot.add(leftArm, rightArm);

  const weaponMount = new THREE.Group();
  weaponMount.position.set(0, -0.54, 0.12);
  rightArm.add(weaponMount);

  return {
    root,
    bodyPivot,
    headGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    weaponMount,
    currentWeaponId: '',
  };
}

export function animateCharacter(
  rig: PlayerRig,
  time: number,
  moveSpeed: number,
  grounded: boolean,
  swingTimer: number,
  buildMode: boolean,
  pitch: number,
): void {
  const isMoving = moveSpeed > 0.4;
  const runCycle = isMoving ? Math.sin(time * 12) : 0;

  if (!grounded) {
    rig.leftLeg.rotation.x = 0.45;
    rig.rightLeg.rotation.x = -0.35;
  } else if (isMoving) {
    rig.leftLeg.rotation.x = runCycle * 0.65;
    rig.rightLeg.rotation.x = -runCycle * 0.65;
  } else {
    rig.leftLeg.rotation.x *= 0.85;
    rig.rightLeg.rotation.x *= 0.85;
  }

  // Weapon / swing / build pose
  rig.headGroup.rotation.x = THREE.MathUtils.clamp(-pitch * 0.45, -0.45, 0.45);

  if (swingTimer > 0) {
    const swingAngle = Math.sin(swingTimer * Math.PI) * 1.45;
    rig.rightArm.rotation.x = -1.2 + swingAngle;
    rig.leftArm.rotation.x = -0.5;
  } else if (buildMode) {
    rig.rightArm.rotation.x = -1.05;
    rig.leftArm.rotation.x = -0.95;
  } else {
    rig.rightArm.rotation.x = -1.15 - pitch * 0.45;
    rig.leftArm.rotation.x = -0.85 - (isMoving ? runCycle * 0.25 : 0);
  }
}

/**
 * Composite multi-part 3D weapon & tool models.
 */
export function createWeaponMesh(id: WeaponId | 'blueprint'): THREE.Group {
  const group = new THREE.Group();

  const gunMetal = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.3,
    metalness: 0.82,
  });
  const darkGrip = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.75,
    metalness: 0.2,
  });
  const accentBlue = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9,
    roughness: 0.25,
    metalness: 0.5,
    emissive: 0x0284c7,
    emissiveIntensity: 0.4,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.25,
    metalness: 0.88,
  });

  if (id === 'blueprint') {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.03, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4, emissive: 0x0369a1, emissiveIntensity: 0.35 }),
    );
    pad.position.set(0, 0.05, 0.2);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.27), darkGrip);
    frame.position.set(0, 0.035, 0.2);
    group.add(frame, pad);
    return group;
  }

  if (id === 'pickaxe') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.95, 8), darkGrip);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 0.04, 0.25);

    const headCore = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.12), gunMetal);
    headCore.position.set(0, 0.04, 0.68);

    const bladeL = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 4), accentBlue);
    bladeL.rotation.z = Math.PI / 2;
    bladeL.position.set(-0.2, 0.04, 0.68);

    const bladeR = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 4), accentBlue);
    bladeR.rotation.z = -Math.PI / 2;
    bladeR.position.set(0.2, 0.04, 0.68);

    group.add(handle, headCore, bladeL, bladeR);
    return group;
  }

  if (id === 'ar') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.46), gunMetal);
    body.position.set(0, 0.06, 0.22);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.38, 8), gunMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.08, 0.58);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.08), darkGrip);
    mag.position.set(0, -0.07, 0.28);
    mag.rotation.x = 0.2;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.22), darkGrip);
    stock.position.set(0, 0.05, -0.08);
    const optic = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.12), accentBlue);
    optic.position.set(0, 0.15, 0.2);
    group.add(body, barrel, mag, stock, optic);
    return group;
  }

  if (id === 'shotgun') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42), gunMetal);
    body.position.set(0, 0.06, 0.2);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.45, 8), gunMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.09, 0.56);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.38, 8), darkGrip);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.04, 0.52);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.22), darkGrip);
    stock.position.set(0, 0.04, -0.08);
    group.add(body, barrel, tube, stock);
    return group;
  }

  if (id === 'smg') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.13, 0.32), gunMetal);
    body.position.set(0, 0.06, 0.16);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 8), darkGrip);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.07, 0.38);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.22, 0.06), accentBlue);
    mag.position.set(0, -0.08, 0.18);
    group.add(body, barrel, mag);
    return group;
  }

  // Sniper
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.5), goldMat);
  body.position.set(0, 0.06, 0.22);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.65, 8), gunMetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.08, 0.72);
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.28, 10), darkGrip);
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.17, 0.26);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.25), darkGrip);
  stock.position.set(0, 0.04, -0.1);
  group.add(body, barrel, scope, stock);
  return group;
}

/**
 * Fortnite-style 4m x 3m x 4m grid Building Pieces (Wall, Floor, Ramp, Roof).
 */
export function createBuildPieceMesh(
  type: BuildPieceType,
  material: BuildMaterial,
  textures: ProceduralTextureSet,
  isPreview = false,
  isValid = true,
): THREE.Group {
  const group = new THREE.Group();

  let mat: THREE.Material;
  if (isPreview) {
    mat = new THREE.MeshStandardMaterial({
      color: isValid ? 0x38bdf8 : 0xef4444,
      map: textures.blueprint,
      transparent: true,
      opacity: 0.48,
      roughness: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  } else {
    const map = textures[material];
    mat = new THREE.MeshStandardMaterial({
      map,
      roughness: material === 'metal' ? 0.32 : material === 'brick' ? 0.85 : 0.72,
      metalness: material === 'metal' ? 0.78 : 0.06,
    });
  }

  const trimMat = isPreview
    ? mat
    : new THREE.MeshStandardMaterial({
        color: material === 'metal' ? 0x334155 : material === 'brick' ? 0x7c2d12 : 0x5c3a21,
        roughness: material === 'metal' ? 0.4 : 0.85,
        metalness: material === 'metal' ? 0.7 : 0.05,
      });

  if (type === 'wall') {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, 0.22), mat);
    panel.position.y = WALL_HEIGHT / 2;
    if (!isPreview) {
      panel.castShadow = true;
      panel.receiveShadow = true;
    }
    const topCap = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE + 0.06, 0.14, 0.28), trimMat);
    topCap.position.y = WALL_HEIGHT - 0.07;
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.18, WALL_HEIGHT, 0.28), trimMat);
    postL.position.set(-CELL_SIZE / 2 + 0.09, WALL_HEIGHT / 2, 0);
    const postR = new THREE.Mesh(new THREE.BoxGeometry(0.18, WALL_HEIGHT, 0.28), trimMat);
    postR.position.set(CELL_SIZE / 2 - 0.09, WALL_HEIGHT / 2, 0);
    group.add(panel, topCap, postL, postR);
  } else if (type === 'floor') {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, 0.22, CELL_SIZE), mat);
    slab.position.y = 0;
    if (!isPreview) {
      slab.castShadow = true;
      slab.receiveShadow = true;
    }
    const rim = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE + 0.04, 0.12, 0.18), trimMat);
    rim.position.set(0, 0.06, CELL_SIZE / 2 - 0.09);
    group.add(slab, rim);
  } else if (type === 'ramp') {
    const length = Math.hypot(CELL_SIZE, WALL_HEIGHT);
    const angle = Math.atan2(WALL_HEIGHT, CELL_SIZE);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, 0.2, length), mat);
    deck.position.set(0, WALL_HEIGHT / 2, 0);
    deck.rotation.x = -angle;
    if (!isPreview) {
      deck.castShadow = true;
      deck.receiveShadow = true;
    }

    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, length), trimMat);
    railL.position.set(-CELL_SIZE / 2 + 0.08, WALL_HEIGHT / 2 + 0.1, 0);
    railL.rotation.x = -angle;

    const railR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, length), trimMat);
    railR.position.set(CELL_SIZE / 2 - 0.08, WALL_HEIGHT / 2 + 0.1, 0);
    railR.rotation.x = -angle;

    group.add(deck, railL, railR);
  } else {
    // Roof / Pyramid Cone
    const coneGeo = new THREE.ConeGeometry(CELL_SIZE * 0.707, WALL_HEIGHT * 0.75, 4);
    coneGeo.rotateY(Math.PI / 4);
    const cone = new THREE.Mesh(coneGeo, mat);
    cone.position.y = (WALL_HEIGHT * 0.75) / 2;
    if (!isPreview) {
      cone.castShadow = true;
      cone.receiveShadow = true;
    }
    const baseRim = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, 0.16, CELL_SIZE), trimMat);
    baseRim.position.y = 0.08;
    group.add(cone, baseRim);
  }

  return group;
}

/**
 * Composite multi-part Tree (Wood harvestable).
 */
export function createTreeGroup(scale: number): THREE.Group {
  const g = new THREE.Group();

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6f4528, roughness: 0.9, metalness: 0.02 });
  const leafMat1 = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.75, metalness: 0.02 });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.72, metalness: 0.02 });

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 2.8, 8), trunkMat);
  trunk.position.y = 1.4;
  trunk.castShadow = true;
  trunk.receiveShadow = true;

  const crown1 = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.4, 7), leafMat1);
  crown1.position.y = 3.2;
  crown1.castShadow = true;

  const crown2 = new THREE.Mesh(new THREE.ConeGeometry(1.45, 2.1, 7), leafMat2);
  crown2.position.y = 4.4;
  crown2.castShadow = true;

  const crown3 = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.5, 7), leafMat2);
  crown3.position.y = 5.5;
  crown3.castShadow = true;

  g.add(trunk, crown1, crown2, crown3);
  g.scale.setScalar(scale);
  return g;
}

/**
 * Composite multi-part Rock outcrop (Brick harvestable).
 */
export function createRockGroup(scale: number): THREE.Group {
  const g = new THREE.Group();
  const mat1 = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.88, metalness: 0.08, flatShading: true });
  const mat2 = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.92, metalness: 0.05, flatShading: true });

  const main = new THREE.Mesh(new THREE.DodecahedronGeometry(1.25, 0), mat1);
  main.position.y = 0.85;
  main.scale.set(1.15, 0.85, 1.0);
  main.castShadow = true;
  main.receiveShadow = true;

  const side = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), mat2);
  side.position.set(0.95, 0.45, 0.4);
  side.castShadow = true;

  const top = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 0), mat2);
  top.position.set(-0.6, 0.55, -0.45);
  top.castShadow = true;

  g.add(main, side, top);
  g.scale.setScalar(scale);
  return g;
}

/**
 * Composite Metal Supply Crate (Metal harvestable).
 */
export function createCrateGroup(textures: ProceduralTextureSet): THREE.Group {
  const g = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({
    map: textures.metal,
    color: 0x3b82f6,
    roughness: 0.35,
    metalness: 0.78,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.4,
    metalness: 0.85,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.7, 1.6), steelMat);
  body.position.y = 0.85;
  body.castShadow = true;
  body.receiveShadow = true;

  const rib1 = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.14, 1.68), frameMat);
  rib1.position.y = 0.1;
  const rib2 = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.14, 1.68), frameMat);
  rib2.position.y = 1.65;

  g.add(body, rib1, rib2);
  return g;
}

/**
 * Floating Weapon / Consumable Pickup with rarity ring.
 */
export function createLootMesh(
  kind: 'weapon' | 'consumable' | 'mats',
  weaponId?: WeaponId,
  consumableId?: ConsumableId,
): THREE.Group {
  const g = new THREE.Group();

  let color = RARITY_COLORS.rare;
  if (kind === 'weapon' && weaponId) {
    const rarityMap: Record<WeaponId, Rarity> = {
      pickaxe: 'common',
      smg: 'uncommon',
      ar: 'rare',
      shotgun: 'epic',
      sniper: 'legendary',
    };
    color = RARITY_COLORS[rarityMap[weaponId]];
  } else if (kind === 'consumable') {
    color = consumableId === 'medkit' ? 0x10b981 : 0x0ea5e9;
  }

  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.35;
  g.add(ring);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.42, 1.1, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 0.18;
  g.add(beam);

  if (kind === 'weapon' && weaponId) {
    const wMesh = createWeaponMesh(weaponId);
    wMesh.scale.setScalar(1.35);
    wMesh.position.set(0, 0.1, -0.25);
    g.add(wMesh);
  } else {
    const jar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.24, 0.42, 12),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.2,
        metalness: 0.1,
        emissive: color,
        emissiveIntensity: 0.35,
      }),
    );
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 }),
    );
    cap.position.y = 0.25;
    g.add(jar, cap);
  }

  return g;
}

/**
 * Hovering Practice Target Drone (for shooting practice & ballistic feedback).
 */
export function createTargetDroneGroup(): THREE.Group {
  const g = new THREE.Group();

  const shellMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.75 });
  const bullseyeMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.4,
    emissive: 0x991b1b,
    emissiveIntensity: 0.4,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.7,
    roughness: 0.2,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.22, 16), shellMat);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;

  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.26, 16), bullseyeMat);
  core.rotation.x = Math.PI / 2;

  const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.3, 10), glowMat);
  thruster.position.y = -0.65;

  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), shellMat);
  stand.position.y = -0.35;

  g.add(body, core, thruster, stand);
  return g;
}
