import * as THREE from 'three';

const MATERIALS = new Map();

export function mat(color, options = {}) {
  const key = `${color}:${JSON.stringify(options)}`;
  if (MATERIALS.has(key)) {
    return MATERIALS.get(key);
  }
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0.05,
    flatShading: true,
    ...options
  });
  MATERIALS.set(key, material);
  return material;
}

export function basicMat(color, options = {}) {
  const key = `basic:${color}:${JSON.stringify(options)}`;
  if (MATERIALS.has(key)) {
    return MATERIALS.get(key);
  }
  const material = new THREE.MeshBasicMaterial({
    color,
    ...options
  });
  MATERIALS.set(key, material);
  return material;
}

export function enableShadows(root) {
  root.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  return root;
}

function mesh(geometry, material, position, scale) {
  const object = new THREE.Mesh(geometry, material);
  object.position.copy(position);
  object.scale.copy(scale);
  return object;
}

function limb(start, end, radius, material) {
  const center = start.clone().lerp(end, 0.5);
  const direction = end.clone().sub(start);
  const object = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), 5),
    material
  );
  object.position.copy(center);
  object.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize()
  );
  return object;
}

function boxBetween(start, end, width, depth, material) {
  const center = start.clone().lerp(end, 0.5);
  const direction = end.clone().sub(start);
  const object = new THREE.Mesh(
    new THREE.BoxGeometry(width, direction.length(), depth),
    material
  );
  object.position.copy(center);
  object.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize()
  );
  return object;
}

function cylinderBetween(start, end, radiusStart, radiusEnd, material) {
  const center = start.clone().lerp(end, 0.5);
  const direction = end.clone().sub(start);
  const object = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusEnd, radiusStart, direction.length(), 6),
    material
  );
  object.position.copy(center);
  object.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize()
  );
  return object;
}

function createPivot(name, position, children) {
  const pivot = new THREE.Group();
  pivot.name = name;
  pivot.position.copy(position);
  children.forEach((child) => {
    child.position.sub(position);
    pivot.add(child);
  });
  return pivot;
}

export function createHealthBar({ hpColor = '#62d56f', tickColor = '#120f0d' } = {}) {
  const group = new THREE.Group();
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(1.045, 0.2, 0.048),
    basicMat('#211b19')
  );
  const hp = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.105, 0.058),
    basicMat(hpColor)
  );
  const weapon = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.052, 0.056),
    basicMat('#f2d06b')
  );
  const ticks = new THREE.Group();
  for (let i = 1; i < 5; i += 1) {
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.122, 0.068),
      basicMat(tickColor)
    );
    tick.position.set(-0.5 + i * 0.2, 0.043, 0.014);
    ticks.add(tick);
  }
  hp.position.set(0, 0.043, 0.008);
  weapon.position.set(0, -0.065, 0.009);
  group.add(back, hp, weapon, ticks);
  group.userData.hp = hp;
  group.userData.weapon = weapon;
  group.userData.ticks = ticks;
  group.position.y = 2.28;
  return group;
}

export function createKnightModel(team) {
  return createSwordsmanModel(team, { hasShield: true });
}

export function createSwordsmanModel(team, { hasShield = false } = {}) {
  const group = new THREE.Group();
  const tunic = team === 'player' ? '#3e7cb1' : '#9e413a';
  const trim = team === 'player' ? '#f2d06b' : '#2f2520';
  const skin = '#d9a16f';

  const body = mesh(
    new THREE.DodecahedronGeometry(0.52, 0),
    mat(tunic),
    new THREE.Vector3(0, 0.92, 0),
    new THREE.Vector3(0.86, 1.25, 0.64)
  );
  const head = mesh(
    new THREE.DodecahedronGeometry(0.28, 0),
    mat(skin),
    new THREE.Vector3(0, 1.6, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const eyeLeft = mesh(
    new THREE.BoxGeometry(0.045, 0.035, 0.02),
    mat('#24201c'),
    new THREE.Vector3(-0.08, 1.64, 0.25),
    new THREE.Vector3(1, 1, 1)
  );
  const eyeRight = eyeLeft.clone();
  eyeRight.position.x = 0.08;
  const helm = mesh(
    new THREE.ConeGeometry(0.3, 0.32, 6),
    mat(trim),
    new THREE.Vector3(0, 1.86, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const leftLeg = mesh(
    new THREE.BoxGeometry(0.18, 0.54, 0.18),
    mat('#2d2e34'),
    new THREE.Vector3(-0.17, 0.28, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.17;
  const rightArm = limb(
    new THREE.Vector3(-0.31, 1.18, 0.06),
    new THREE.Vector3(-0.24, 0.68, 0.4),
    0.06,
    mat(skin)
  );
  const rightHand = mesh(
    new THREE.DodecahedronGeometry(0.09, 0),
    mat(skin),
    new THREE.Vector3(-0.24, 0.68, 0.4),
    new THREE.Vector3(1, 1, 1)
  );
  const leftHandPosition = hasShield
    ? new THREE.Vector3(0.24, 1.03, 0.48)
    : new THREE.Vector3(0.36, 0.72, 0.25);
  const leftArm = limb(
    new THREE.Vector3(0.31, 1.16, 0.06),
    leftHandPosition,
    0.06,
    mat(skin)
  );
  const leftHand = mesh(
    new THREE.DodecahedronGeometry(0.085, 0),
    mat(skin),
    leftHandPosition,
    new THREE.Vector3(1, 1, 1)
  );
  const blade = boxBetween(
    new THREE.Vector3(-0.24, 0.64, 0.44),
    new THREE.Vector3(-0.14, 1.24, 0.82),
    0.07,
    0.08,
    mat('#d8dce2', { metalness: 0.2 })
  );
  const hilt = boxBetween(
    new THREE.Vector3(-0.4, 0.68, 0.34),
    new THREE.Vector3(-0.11, 0.68, 0.45),
    0.08,
    0.1,
    mat('#7b4e2d')
  );
  const weaponSwingPivot = createPivot(
    'swordsmanWeaponSwingPivot',
    new THREE.Vector3(-0.24, 0.68, 0.4),
    [blade, hilt]
  );
  const shield = hasShield
    ? mesh(
      new THREE.CylinderGeometry(0.28, 0.33, 0.08, 6),
      mat(trim),
      new THREE.Vector3(0.18, 1.04, 0.54),
      new THREE.Vector3(1, 1.2, 1)
    )
    : null;
  if (shield) shield.rotation.x = Math.PI / 2;
  const weaponPivot = createPivot(
    'swordsmanWeaponPivot',
    new THREE.Vector3(-0.31, 1.18, 0.06),
    [rightArm, rightHand, weaponSwingPivot]
  );
  const offhandPivot = createPivot(
    'swordsmanOffhandPivot',
    new THREE.Vector3(0.31, 1.16, 0.06),
    shield ? [leftArm, leftHand, shield] : [leftArm, leftHand]
  );

  group.add(
    body,
    head,
    eyeLeft,
    eyeRight,
    helm,
    leftLeg,
    rightLeg,
    weaponPivot,
    offhandPivot
  );
  group.userData.parts = {
    weaponPivot,
    weaponSwingPivot,
    offhandPivot
  };
  return enableShadows(group);
}

export function createArcherModel(team, options = {}) {
  const group = new THREE.Group();
  const tunic = options.tunicColor ?? (team === 'player' ? '#3f8f68' : '#9e413a');
  const skin = options.skinColor ?? '#d9a16f';
  const skinMat = mat(skin);
  const leather = mat(options.leatherColor ?? '#7b4e2d');

  const body = mesh(
    new THREE.DodecahedronGeometry(0.48, 0),
    mat(tunic),
    new THREE.Vector3(0, 0.9, 0),
    new THREE.Vector3(0.76, 1.18, 0.58)
  );
  const head = mesh(
    new THREE.DodecahedronGeometry(0.26, 0),
    mat(skin),
    new THREE.Vector3(0, 1.55, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const eyeLeft = mesh(
    new THREE.BoxGeometry(0.04, 0.032, 0.02),
    mat('#24201c'),
    new THREE.Vector3(-0.075, 1.59, 0.235),
    new THREE.Vector3(1, 1, 1)
  );
  const eyeRight = eyeLeft.clone();
  eyeRight.position.x = 0.075;
  const hood = mesh(
    new THREE.ConeGeometry(0.31, 0.42, 6),
    mat(options.hoodColor ?? '#324c37'),
    new THREE.Vector3(0, 1.78, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const bowCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.1, -0.58, 0),
    new THREE.Vector3(0.12, -0.22, 0),
    new THREE.Vector3(0.14, 0.24, 0),
    new THREE.Vector3(-0.1, 0.62, 0)
  ]);
  const bow = new THREE.Mesh(
    new THREE.TubeGeometry(bowCurve, 6, 0.025, 5, false),
    leather
  );
  bow.position.set(0.04, 1.03, 0.59);
  bow.rotation.x = -Math.PI / 2;
  bow.rotation.y = -Math.PI / 2;
  bow.rotation.z = -Math.PI / 2;
  const string = mesh(
    new THREE.BoxGeometry(1.08, 0.014, 0.014),
    mat('#e7ddc0'),
    new THREE.Vector3(0.02, 1.05, 0.59),
    new THREE.Vector3(1, 1, 1)
  );
  string.rotation.x = -Math.PI / 2;
  string.rotation.y = -Math.PI / 2;
  const leftArm = limb(
    new THREE.Vector3(0.3, 1.2, 0.08),
    new THREE.Vector3(0.04, 1.04, 0.57),
    0.055,
    skinMat
  );
  const rightShoulder = new THREE.Vector3(-0.3, 1.18, 0.08);
  const rightElbow = new THREE.Vector3(-0.331, 1.143, 0.406);
  const rightHandPosition = new THREE.Vector3(-0.22, 1.09, 0.62);
  const rightUpperArm = limb(
    rightShoulder,
    rightElbow,
    0.055,
    skinMat
  );
  const rightForearm = limb(
    rightElbow,
    rightHandPosition,
    0.055,
    skinMat
  );
  const leftHand = mesh(
    new THREE.DodecahedronGeometry(0.09, 0),
    skinMat,
    new THREE.Vector3(0.04, 1.04, 0.57),
    new THREE.Vector3(1, 1, 1)
  );
  const rightHand = mesh(
    new THREE.DodecahedronGeometry(0.09, 0),
    skinMat,
    rightHandPosition,
    new THREE.Vector3(1, 1, 1)
  );
  const heldArrow = new THREE.Group();
  const heldShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.64, 5),
    mat('#e7ddc0')
  );
  heldShaft.rotation.x = Math.PI / 2;
  const heldHead = new THREE.Mesh(
    new THREE.ConeGeometry(0.045, 0.12, 5),
    mat('#d8dce2', { metalness: 0.2 })
  );
  heldHead.position.z = 0.38;
  heldHead.rotation.x = Math.PI / 2;
  heldArrow.position.set(-0.21, 1.09, 0.64);
  heldArrow.add(heldShaft, heldHead);
  const quiver = mesh(
    new THREE.CylinderGeometry(0.11, 0.13, 0.72, 6),
    mat('#5b3d2b'),
    new THREE.Vector3(-0.34, 1.05, -0.18),
    new THREE.Vector3(1, 1, 1)
  );
  quiver.rotation.z = 0.4;
  const leg = mesh(
    new THREE.BoxGeometry(0.16, 0.52, 0.16),
    mat(options.legColor ?? '#2d2e34'),
    new THREE.Vector3(-0.14, 0.27, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const leg2 = leg.clone();
  leg2.position.x = 0.14;
  const bowPivot = createPivot(
    'archerBowPivot',
    new THREE.Vector3(0.3, 1.2, 0.08),
    [leftArm, leftHand, bow, string]
  );
  const drawForearmPivot = createPivot(
    'archerDrawForearmPivot',
    rightElbow,
    [rightForearm, rightHand, heldArrow]
  );
  const drawPivot = createPivot(
    'archerDrawPivot',
    rightShoulder,
    [rightUpperArm, drawForearmPivot]
  );
  drawPivot.rotation.y = THREE.MathUtils.degToRad(10);
  const upperBodyPivot = createPivot(
    'archerUpperBodyPivot',
    new THREE.Vector3(0, 0.84, 0),
    [body, head, eyeLeft, eyeRight, hood, quiver]
  );

  group.add(
    upperBodyPivot,
    bowPivot,
    drawPivot,
    leg,
    leg2
  );
  group.userData.parts = {
    upperBodyPivot,
    bowPivot,
    drawPivot,
    drawForearmPivot,
    string,
    heldArrow,
    rightHand
  };
  if (Number.isFinite(options.scale)) {
    group.scale.setScalar(options.scale);
  }
  return enableShadows(group);
}

export function createGoblinArcherModel() {
  return createArcherModel('enemy', {
    skinColor: '#7fb65c',
    tunicColor: '#5d6e3d',
    hoodColor: '#395431',
    leatherColor: '#5b3c28',
    legColor: '#243024',
    scale: 0.86
  });
}

export function createRaiderModel(options = {}) {
  const group = new THREE.Group();
  const skinMat = mat(options.skinColor ?? '#b97a56');
  const body = mesh(
    new THREE.DodecahedronGeometry(0.5, 0),
    mat(options.bodyColor ?? '#8f3b34'),
    new THREE.Vector3(0, 0.86, 0),
    new THREE.Vector3(0.84, 1.16, 0.66)
  );
  const head = mesh(
    new THREE.DodecahedronGeometry(0.27, 0),
    skinMat,
    new THREE.Vector3(0, 1.5, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const eyeLeft = mesh(
    new THREE.BoxGeometry(0.045, 0.035, 0.02),
    mat(options.eyeColor ?? '#241817'),
    new THREE.Vector3(-0.08, 1.54, 0.245),
    new THREE.Vector3(1, 1, 1)
  );
  const eyeRight = eyeLeft.clone();
  eyeRight.position.x = 0.08;
  const rightArm = limb(
    new THREE.Vector3(-0.32, 1.14, 0.04),
    new THREE.Vector3(-0.25, 0.7, 0.38),
    0.065,
    skinMat
  );
  const rightHand = mesh(
    new THREE.DodecahedronGeometry(0.095, 0),
    skinMat,
    new THREE.Vector3(-0.25, 0.7, 0.38),
    new THREE.Vector3(1, 1, 1)
  );
  const leftArm = limb(
    new THREE.Vector3(0.32, 1.12, 0.04),
    new THREE.Vector3(0.43, 0.82, 0.12),
    0.058,
    skinMat
  );
  const leftHand = mesh(
    new THREE.DodecahedronGeometry(0.085, 0),
    skinMat,
    new THREE.Vector3(0.43, 0.82, 0.12),
    new THREE.Vector3(1, 1, 1)
  );
  const club = cylinderBetween(
    new THREE.Vector3(-0.25, 0.68, 0.43),
    new THREE.Vector3(-0.13, 1.28, 0.86),
    0.07,
    0.13,
    mat(options.weaponColor ?? '#6d4a2c')
  );
  const weaponSwingPivot = createPivot(
    'raiderWeaponSwingPivot',
    new THREE.Vector3(-0.25, 0.7, 0.38),
    [club]
  );
  const leg = mesh(
    new THREE.BoxGeometry(0.18, 0.5, 0.18),
    mat(options.legColor ?? '#312923'),
    new THREE.Vector3(-0.15, 0.25, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const leg2 = leg.clone();
  leg2.position.x = 0.15;
  const weaponPivot = createPivot(
    'raiderWeaponPivot',
    new THREE.Vector3(-0.32, 1.14, 0.04),
    [rightArm, rightHand, weaponSwingPivot]
  );
  const offhandPivot = createPivot(
    'raiderOffhandPivot',
    new THREE.Vector3(0.32, 1.12, 0.04),
    [leftArm, leftHand]
  );
  group.add(
    body,
    head,
    eyeLeft,
    eyeRight,
    weaponPivot,
    offhandPivot,
    leg,
    leg2
  );
  group.userData.parts = {
    weaponPivot,
    weaponSwingPivot,
    offhandPivot
  };
  if (Number.isFinite(options.scale)) {
    group.scale.setScalar(options.scale);
  }
  return enableShadows(group);
}

export function createGoblinSoldierModel() {
  return createRaiderModel({
    skinColor: '#7fb65c',
    bodyColor: '#6a5236',
    eyeColor: '#182015',
    weaponColor: '#5a3d2a',
    legColor: '#253024',
    scale: 0.88
  });
}

export function createArrowModel(color = '#e7ddc0') {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.78, 5),
    mat(color)
  );
  shaft.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.18, 5),
    mat('#d8dce2', { metalness: 0.2 })
  );
  head.position.z = 0.48;
  head.rotation.x = Math.PI / 2;
  const feather = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.16, 4),
    mat('#c75c51')
  );
  feather.position.z = -0.44;
  feather.rotation.x = -Math.PI / 2;
  group.add(shaft, head, feather);
  return enableShadows(group);
}

export function createBaseModel() {
  const group = new THREE.Group();
  const stone = mat('#8b8f86');
  const wood = mat('#7c5638');
  const roof = mat('#b64a3d');

  const keep = mesh(
    new THREE.CylinderGeometry(1.55, 1.8, 2.45, 6),
    stone,
    new THREE.Vector3(0, 1.22, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const keepRoof = mesh(
    new THREE.ConeGeometry(1.86, 1.15, 6),
    roof,
    new THREE.Vector3(0, 3.02, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const gate = mesh(
    new THREE.BoxGeometry(1.1, 1.3, 0.18),
    wood,
    new THREE.Vector3(0, 0.68, -1.58),
    new THREE.Vector3(1, 1, 1)
  );
  group.add(keep, keepRoof, gate);

  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI * 2 * i) / 6;
    const wall = mesh(
      new THREE.BoxGeometry(2.7, 0.72, 0.32),
      stone,
      new THREE.Vector3(Math.cos(angle) * 3.15, 0.45, Math.sin(angle) * 3.15),
      new THREE.Vector3(1, 1, 1)
    );
    wall.rotation.y = -angle;
    group.add(wall);
  }

  const aura = new THREE.Group();
  aura.userData.isAura = true;
  group.add(aura);
  group.userData.aura = aura;
  return enableShadows(group);
}

export function createEnemyCampModel() {
  const group = new THREE.Group();
  const hide = mat('#6c4631');
  const cloth = mat('#9e413a');
  const tent = mesh(
    new THREE.ConeGeometry(1.6, 1.6, 4),
    cloth,
    new THREE.Vector3(0, 0.8, 0),
    new THREE.Vector3(1, 1, 1)
  );
  tent.rotation.y = Math.PI / 4;
  const supplyCrate = mesh(
    new THREE.BoxGeometry(0.58, 0.38, 0.52),
    hide,
    new THREE.Vector3(-1.45, 0.2, -0.92),
    new THREE.Vector3(1, 1, 1)
  );
  const shortLogA = mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.92, 6),
    hide,
    new THREE.Vector3(-1.34, 0.26, -1.22),
    new THREE.Vector3(1, 1, 1)
  );
  const shortLogB = mesh(
    new THREE.CylinderGeometry(0.085, 0.085, 0.74, 6),
    hide,
    new THREE.Vector3(-1.48, 0.44, -1.1),
    new THREE.Vector3(1, 1, 1)
  );
  shortLogA.rotation.z = Math.PI / 2;
  shortLogA.rotation.y = 0.22;
  shortLogB.rotation.z = Math.PI / 2;
  shortLogB.rotation.y = -0.16;
  group.add(tent, supplyCrate, shortLogA, shortLogB);
  return enableShadows(group);
}

export function createCottageModel(options = {}) {
  const group = new THREE.Group();
  const wall = mat(options.wall ?? '#b88b5c');
  const roof = mat(options.roof ?? '#8f3f35');
  const wood = mat('#6d4a2c');
  const dark = mat('#2d2520');

  const cabin = mesh(
    new THREE.BoxGeometry(2.25, 1.25, 1.8),
    wall,
    new THREE.Vector3(0, 0.65, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const roofCap = mesh(
    new THREE.ConeGeometry(1.55, 1.15, 4),
    roof,
    new THREE.Vector3(0, 1.55, 0),
    new THREE.Vector3(1.18, 1, 0.88)
  );
  roofCap.rotation.y = Math.PI / 4;
  const door = mesh(
    new THREE.BoxGeometry(0.48, 0.74, 0.08),
    wood,
    new THREE.Vector3(0, 0.42, 0.94),
    new THREE.Vector3(1, 1, 1)
  );
  const windowLeft = mesh(
    new THREE.BoxGeometry(0.34, 0.28, 0.06),
    mat('#f2d88a', { emissive: '#5a3a18', emissiveIntensity: 0.2 }),
    new THREE.Vector3(-0.72, 0.76, 0.94),
    new THREE.Vector3(1, 1, 1)
  );
  const windowRight = windowLeft.clone();
  windowRight.position.x = 0.72;
  const chimney = mesh(
    new THREE.BoxGeometry(0.28, 0.72, 0.28),
    dark,
    new THREE.Vector3(0.58, 2.04, -0.18),
    new THREE.Vector3(1, 1, 1)
  );

  group.add(cabin, roofCap, door, windowLeft, windowRight, chimney);
  return enableShadows(group);
}

export function createBush(size = 1, options = {}) {
  const group = new THREE.Group();
  const leaf = mat(options.leafColor ?? '#397c45');
  const left = mesh(
    new THREE.DodecahedronGeometry(0.42, 0),
    leaf,
    new THREE.Vector3(-0.18 * size, 0.3 * size, 0),
    new THREE.Vector3(size, size * 0.72, size)
  );
  const right = left.clone();
  right.position.x = 0.22 * size;
  right.position.z = 0.16 * size;
  right.scale.set(size * 0.82, size * 0.58, size * 0.82);
  const berry = mesh(
    new THREE.DodecahedronGeometry(0.07, 0),
    mat(options.berryColor ?? '#c75c51'),
    new THREE.Vector3(0.03 * size, 0.6 * size, 0.18 * size),
    new THREE.Vector3(size, size, size)
  );
  group.add(left, right, berry);
  if (options.snowCap) {
    const snow = mat(options.snowColor ?? '#eef4ec', { roughness: 0.9 });
    const leftSnow = mesh(
      new THREE.DodecahedronGeometry(0.26, 0),
      snow,
      new THREE.Vector3(-0.18 * size, 0.58 * size, 0.02 * size),
      new THREE.Vector3(size * 0.96, size * 0.34, size * 0.78)
    );
    const rightSnow = mesh(
      new THREE.DodecahedronGeometry(0.22, 0),
      snow,
      new THREE.Vector3(0.22 * size, 0.5 * size, 0.17 * size),
      new THREE.Vector3(size * 0.78, size * 0.28, size * 0.68)
    );
    group.add(leftSnow, rightSnow);
  }
  return enableShadows(group);
}

export function createGrassTuft(size = 1, color = '#6fb34f') {
  const group = new THREE.Group();
  const bladeMat = mat(color, { roughness: 0.92 });
  for (let i = 0; i < 4; i += 1) {
    const blade = mesh(
      new THREE.ConeGeometry(0.055 * size, 0.48 * size, 3),
      bladeMat,
      new THREE.Vector3((i - 1.5) * 0.08 * size, 0.24 * size, (i % 2) * 0.08 * size),
      new THREE.Vector3(1, 1, 1)
    );
    blade.rotation.z = (i - 1.5) * 0.18;
    blade.rotation.y = (Math.PI * 2 * i) / 4;
    group.add(blade);
  }
  return enableShadows(group);
}

export function createTree(height = 1, options = {}) {
  const group = new THREE.Group();
  const trunkColor = options.trunkColor ?? '#765035';
  const leafColor = options.leafColor ?? '#2f7d55';
  const trunk = mesh(
    new THREE.CylinderGeometry(0.16, 0.22, 1.1 * height, 5),
    mat(trunkColor),
    new THREE.Vector3(0, 0.55 * height, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const top = mesh(
    new THREE.ConeGeometry(0.78 * height, 1.55 * height, 6),
    mat(leafColor),
    new THREE.Vector3(0, 1.45 * height, 0),
    new THREE.Vector3(1, 1, 1)
  );
  group.add(trunk, top);
  return enableShadows(group);
}

export function createSnowPine(height = 1) {
  const group = new THREE.Group();
  const trunk = mesh(
    new THREE.CylinderGeometry(0.14, 0.21, 1.05 * height, 5),
    mat('#5d4633'),
    new THREE.Vector3(0, 0.52 * height, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const lower = mesh(
    new THREE.ConeGeometry(0.88 * height, 1.22 * height, 7),
    mat('#2c6757'),
    new THREE.Vector3(0, 1.22 * height, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const upper = mesh(
    new THREE.ConeGeometry(0.58 * height, 1.05 * height, 7),
    mat('#347566'),
    new THREE.Vector3(0, 1.9 * height, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const snowCap = mesh(
    new THREE.ConeGeometry(0.5 * height, 0.28 * height, 7),
    mat('#edf3ef', { roughness: 0.82 }),
    new THREE.Vector3(0, 2.34 * height, 0),
    new THREE.Vector3(1, 1, 1)
  );
  group.add(trunk, lower, upper, snowCap);
  return enableShadows(group);
}

export function createMountainPeak(width = 1, height = 1, color = '#8c9ca2') {
  const group = new THREE.Group();
  const rock = mesh(
    new THREE.ConeGeometry(width, height, 7),
    mat(color, { roughness: 0.88 }),
    new THREE.Vector3(0, height * 0.5, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const snow = mesh(
    new THREE.ConeGeometry(width * 0.52, height * 0.32, 7),
    mat('#eef4f1', { roughness: 0.84 }),
    new THREE.Vector3(0, height * 0.86, 0),
    new THREE.Vector3(1, 1, 1)
  );
  group.add(rock, snow);
  return enableShadows(group);
}

export function createMonsterCampModel() {
  const group = new THREE.Group();
  const hide = mat('#5d3f2f');
  const cloth = mat('#88413c');
  const bone = mat('#d7d0b8');
  const wood = mat('#4f3325');

  [-1, 1].forEach((side) => {
    const tent = mesh(
      new THREE.ConeGeometry(0.9, 1.1, 4),
      cloth,
      new THREE.Vector3(side * 1.25, 0.55, 0.15),
      new THREE.Vector3(1, 1, 1)
    );
    tent.rotation.y = Math.PI / 4;
    group.add(tent);
  });

  for (let i = 0; i < 7; i += 1) {
    const angle = -0.85 + i * 0.28;
    const spike = mesh(
      new THREE.ConeGeometry(0.08, 1.05, 5),
      wood,
      new THREE.Vector3(Math.cos(angle) * 2.05, 0.52, -0.9 + Math.sin(angle) * 0.55),
      new THREE.Vector3(1, 1, 1)
    );
    spike.rotation.z = 0.12 * Math.sign(angle);
    group.add(spike);
  }

  const firePit = mesh(
    new THREE.CylinderGeometry(0.45, 0.55, 0.14, 7),
    mat('#38332c'),
    new THREE.Vector3(0, 0.07, 0.55),
    new THREE.Vector3(1, 1, 1)
  );
  const flame = mesh(
    new THREE.ConeGeometry(0.24, 0.7, 5),
    mat('#ff8c3a', { emissive: '#d74917', emissiveIntensity: 0.55 }),
    new THREE.Vector3(0, 0.48, 0.55),
    new THREE.Vector3(1, 1, 1)
  );
  const trophy = mesh(
    new THREE.ConeGeometry(0.16, 0.95, 5),
    bone,
    new THREE.Vector3(0, 0.72, -1.25),
    new THREE.Vector3(1, 1, 1)
  );
  trophy.rotation.z = Math.PI;
  group.add(firePit, flame, trophy);
  return enableShadows(group);
}

export function createCloudModel(scale = 1) {
  const group = new THREE.Group();
  const colors = ['#dac7b2', '#f0ddc7', '#c9ad97'];
  const lobes = [
    { x: -1.55, y: 0, z: 0.1, sx: 1.5, sy: 0.34, sz: 0.5 },
    { x: -0.52, y: 0.12, z: 0, sx: 1.7, sy: 0.44, sz: 0.58 },
    { x: 0.72, y: 0.05, z: 0.08, sx: 1.45, sy: 0.36, sz: 0.5 },
    { x: 1.55, y: -0.02, z: -0.02, sx: 1.05, sy: 0.26, sz: 0.42 }
  ];

  lobes.forEach((item, index) => {
    const lobe = mesh(
      new THREE.DodecahedronGeometry(0.62, 0),
      mat(colors[index % colors.length], { roughness: 0.82 }),
      new THREE.Vector3(item.x * scale, item.y * scale, item.z * scale),
      new THREE.Vector3(item.sx * scale, item.sy * scale, item.sz * scale)
    );
    lobe.castShadow = false;
    lobe.receiveShadow = false;
    group.add(lobe);
  });

  return group;
}

export function createRock(size = 1, options = {}) {
  const rock = mesh(
    new THREE.DodecahedronGeometry(0.55, 0),
    mat(options.color ?? '#7e857c'),
    new THREE.Vector3(0, 0.24 * size, 0),
    new THREE.Vector3(size, size * 0.62, size * 0.86)
  );
  if (!options.snowCap) return enableShadows(rock);

  const group = new THREE.Group();
  const snow = mesh(
    new THREE.DodecahedronGeometry(0.42, 0),
    mat(options.snowColor ?? '#eef4ec', { roughness: 0.9 }),
    new THREE.Vector3(0.02 * size, 0.56 * size, -0.02 * size),
    new THREE.Vector3(size * 0.86, size * 0.24, size * 0.64)
  );
  group.add(rock, snow);
  return enableShadows(group);
}

export function createWolfModel() {
  const group = new THREE.Group();
  const fur = mat('#59656b');
  const darkFur = mat('#343b40');
  const eyeMat = mat('#17191a');

  const body = mesh(
    new THREE.DodecahedronGeometry(0.5, 0),
    fur,
    new THREE.Vector3(0, 0.63, 0),
    new THREE.Vector3(0.82, 0.72, 1.34)
  );
  const chest = mesh(
    new THREE.DodecahedronGeometry(0.32, 0),
    mat('#6f7b80'),
    new THREE.Vector3(0, 0.68, 0.36),
    new THREE.Vector3(1.02, 0.9, 0.78)
  );
  const head = mesh(
    new THREE.DodecahedronGeometry(0.32, 0),
    fur,
    new THREE.Vector3(0, 0.94, 0.72),
    new THREE.Vector3(1, 0.82, 1.08)
  );
  const snout = mesh(
    new THREE.BoxGeometry(0.32, 0.18, 0.32),
    darkFur,
    new THREE.Vector3(0, 0.87, 1),
    new THREE.Vector3(1, 1, 1)
  );
  const nose = mesh(
    new THREE.DodecahedronGeometry(0.07, 0),
    eyeMat,
    new THREE.Vector3(0, 0.9, 1.18),
    new THREE.Vector3(1, 0.72, 0.72)
  );
  const eyeLeft = mesh(
    new THREE.BoxGeometry(0.035, 0.035, 0.018),
    eyeMat,
    new THREE.Vector3(-0.11, 0.99, 1.02),
    new THREE.Vector3(1, 1, 1)
  );
  const eyeRight = eyeLeft.clone();
  eyeRight.position.x = 0.11;
  const earLeft = mesh(
    new THREE.ConeGeometry(0.1, 0.24, 4),
    darkFur,
    new THREE.Vector3(-0.18, 1.2, 0.68),
    new THREE.Vector3(1, 1, 1)
  );
  earLeft.rotation.z = -0.24;
  const earRight = earLeft.clone();
  earRight.position.x = 0.18;
  earRight.rotation.z = 0.24;
  const headPivot = createPivot(
    'wolfHeadPivot',
    new THREE.Vector3(0, 0.86, 0.52),
    [head, snout, nose, eyeLeft, eyeRight, earLeft, earRight]
  );

  const legMat = mat('#3f484d');
  const frontLeft = mesh(
    new THREE.BoxGeometry(0.13, 0.58, 0.13),
    legMat,
    new THREE.Vector3(-0.28, 0.3, 0.35),
    new THREE.Vector3(1, 1, 1)
  );
  const frontRight = frontLeft.clone();
  frontRight.position.x = 0.28;
  const frontPivot = createPivot(
    'wolfFrontPivot',
    new THREE.Vector3(0, 0.62, 0.34),
    [frontLeft, frontRight]
  );
  const hindLeft = mesh(
    new THREE.BoxGeometry(0.14, 0.54, 0.14),
    legMat,
    new THREE.Vector3(-0.28, 0.29, -0.48),
    new THREE.Vector3(1, 1, 1)
  );
  const hindRight = hindLeft.clone();
  hindRight.position.x = 0.28;
  const tail = cylinderBetween(
    new THREE.Vector3(0, 0.75, -0.62),
    new THREE.Vector3(0, 1.02, -1.08),
    0.08,
    0.045,
    darkFur
  );
  const tailPivot = createPivot(
    'wolfTailPivot',
    new THREE.Vector3(0, 0.75, -0.62),
    [tail]
  );

  group.add(body, chest, headPivot, frontPivot, hindLeft, hindRight, tailPivot);
  group.userData.parts = {
    headPivot,
    frontPivot,
    tailPivot
  };
  return enableShadows(group);
}

export function createBearModel() {
  const group = new THREE.Group();
  const fur = mat('#6b4a34');
  const darkFur = mat('#3b2b22');
  const eyeMat = mat('#1b1612');

  const body = mesh(
    new THREE.DodecahedronGeometry(0.62, 0),
    fur,
    new THREE.Vector3(0, 0.74, 0),
    new THREE.Vector3(1.2, 0.9, 1.55)
  );
  const hump = mesh(
    new THREE.DodecahedronGeometry(0.42, 0),
    mat('#7a563d'),
    new THREE.Vector3(0, 1.02, -0.18),
    new THREE.Vector3(1.18, 0.72, 1.1)
  );
  const head = mesh(
    new THREE.DodecahedronGeometry(0.42, 0),
    fur,
    new THREE.Vector3(0, 1.02, 0.75),
    new THREE.Vector3(1.1, 0.88, 1)
  );
  const muzzle = mesh(
    new THREE.BoxGeometry(0.46, 0.24, 0.34),
    darkFur,
    new THREE.Vector3(0, 0.93, 1.08),
    new THREE.Vector3(1, 1, 1)
  );
  const nose = mesh(
    new THREE.DodecahedronGeometry(0.09, 0),
    eyeMat,
    new THREE.Vector3(0, 0.98, 1.3),
    new THREE.Vector3(1, 0.74, 0.74)
  );
  const eyeLeft = mesh(
    new THREE.BoxGeometry(0.04, 0.04, 0.02),
    eyeMat,
    new THREE.Vector3(-0.14, 1.1, 1.02),
    new THREE.Vector3(1, 1, 1)
  );
  const eyeRight = eyeLeft.clone();
  eyeRight.position.x = 0.14;
  const earLeft = mesh(
    new THREE.DodecahedronGeometry(0.12, 0),
    darkFur,
    new THREE.Vector3(-0.27, 1.32, 0.68),
    new THREE.Vector3(1, 0.85, 1)
  );
  const earRight = earLeft.clone();
  earRight.position.x = 0.27;
  const headPivot = createPivot(
    'bearHeadPivot',
    new THREE.Vector3(0, 0.96, 0.58),
    [head, muzzle, nose, eyeLeft, eyeRight, earLeft, earRight]
  );

  const legMat = mat('#4a3428');
  const frontLeft = mesh(
    new THREE.BoxGeometry(0.22, 0.7, 0.22),
    legMat,
    new THREE.Vector3(-0.4, 0.36, 0.38),
    new THREE.Vector3(1, 1, 1)
  );
  const frontRight = frontLeft.clone();
  frontRight.position.x = 0.4;
  const frontPivot = createPivot(
    'bearFrontPivot',
    new THREE.Vector3(0, 0.78, 0.38),
    [frontLeft, frontRight]
  );
  const hindLeft = mesh(
    new THREE.BoxGeometry(0.24, 0.66, 0.24),
    legMat,
    new THREE.Vector3(-0.42, 0.34, -0.52),
    new THREE.Vector3(1, 1, 1)
  );
  const hindRight = hindLeft.clone();
  hindRight.position.x = 0.42;
  const tail = mesh(
    new THREE.DodecahedronGeometry(0.12, 0),
    darkFur,
    new THREE.Vector3(0, 0.78, -0.95),
    new THREE.Vector3(1, 0.78, 0.78)
  );

  group.add(body, hump, headPivot, frontPivot, hindLeft, hindRight, tail);
  group.userData.parts = {
    headPivot,
    frontPivot
  };
  return enableShadows(group);
}

export function createReticle() {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    basicMat('#6cc7ff', {
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1, 48),
    basicMat('#c9f3ff', {
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  disc.rotation.x = -Math.PI / 2;
  ring.rotation.x = -Math.PI / 2;
  group.add(disc, ring);
  group.userData.disc = disc;
  group.userData.ring = ring;
  group.visible = false;
  return group;
}

export function createAltarModel(definition = {}) {
  const color = definition.color ?? '#6ef0c4';
  const group = new THREE.Group();
  const stone = mat('#87918e');
  const darkStone = mat('#5e6968');
  const snow = mat('#f5f5e7');
  const accent = mat(color, {
    emissive: color,
    emissiveIntensity: 0.58
  });

  const base = mesh(
    new THREE.CylinderGeometry(1.04, 1.24, 0.3, 8),
    darkStone,
    new THREE.Vector3(0, 0.15, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const snowCap = mesh(
    new THREE.CylinderGeometry(0.88, 1.02, 0.08, 8),
    snow,
    new THREE.Vector3(0, 0.34, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const plinth = mesh(
    new THREE.CylinderGeometry(0.5, 0.66, 0.42, 6),
    stone,
    new THREE.Vector3(0, 0.58, 0),
    new THREE.Vector3(1, 1, 1)
  );
  const crystal = mesh(
    new THREE.OctahedronGeometry(0.46, 0),
    accent,
    new THREE.Vector3(0, 1.06, 0),
    new THREE.Vector3(0.72, 1.28, 0.72)
  );
  crystal.rotation.y = Math.PI / 4;

  const shardMaterial = mat(color, {
    emissive: color,
    emissiveIntensity: 0.36
  });
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const shard = mesh(
      new THREE.ConeGeometry(0.12, 0.36, 5),
      shardMaterial,
      new THREE.Vector3(Math.cos(angle) * 0.58, 0.64, Math.sin(angle) * 0.58),
      new THREE.Vector3(0.75, 1, 0.75)
    );
    shard.rotation.y = angle;
    shard.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.12;
    group.add(shard);
  }

  const areaDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 56),
    basicMat(color, {
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false
    }).clone()
  );
  const areaRing = new THREE.Mesh(
    new THREE.RingGeometry(0.98, 1, 64),
    basicMat(color, {
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false
    }).clone()
  );
  const progressRing = new THREE.Mesh(
    new THREE.RingGeometry(1.04, 1.1, 64, 1, -Math.PI / 2, 0.001),
    basicMat(color, {
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false
    }).clone()
  );
  const ownerCrown = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 0.86, 48),
    basicMat('#d9e5e2', {
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone()
  );

  [areaDisc, areaRing, progressRing, ownerCrown].forEach((ring) => {
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.055;
  });
  areaDisc.renderOrder = 1180;
  areaDisc.visible = false;
  areaRing.renderOrder = 1181;
  progressRing.renderOrder = 1182;
  ownerCrown.position.y = 0.39;

  group.add(areaDisc, areaRing, progressRing, ownerCrown, base, snowCap, plinth, crystal);
  group.userData.parts = {
    areaDisc,
    areaRing,
    progressRing,
    ownerCrown,
    crystal
  };
  return enableShadows(group);
}

export function createSelectionRing() {
  const group = new THREE.Group();
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.92, 48),
    basicMat('#6ef0c4', {
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false
    })
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.66, 0.78, 48),
    basicMat('#fff2a8', {
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false
    })
  );
  glow.rotation.x = -Math.PI / 2;
  ring.rotation.x = -Math.PI / 2;
  glow.renderOrder = 2000;
  ring.renderOrder = 2001;
  group.add(glow, ring);
  group.position.y = 0.05;
  group.visible = false;
  group.userData.glow = glow;
  group.userData.ring = ring;
  return group;
}

export function createGuardFlag() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.58, 6),
    basicMat('#23333a', {
      depthTest: false,
      depthWrite: false
    }).clone()
  );
  pole.position.y = 0.29;
  pole.renderOrder = 2100;

  const flagGeometry = new THREE.BufferGeometry();
  flagGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      0.02, 0.52, 0,
      0.48, 0.43, 0,
      0.02, 0.32, 0
    ], 3)
  );
  flagGeometry.computeVertexNormals();
  const flag = new THREE.Mesh(
    flagGeometry,
    basicMat('#78e3ff', {
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    }).clone()
  );
  flag.renderOrder = 2101;
  group.add(pole, flag);
  group.visible = false;
  return group;
}

export function createAttackRangeRing() {
  const group = new THREE.Group();
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.96, 1, 80),
    basicMat('#78e3ff', {
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    }).clone()
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.985, 1, 80),
    basicMat('#fff2a8', {
      transparent: true,
      opacity: 0.74,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    }).clone()
  );
  glow.rotation.x = -Math.PI / 2;
  ring.rotation.x = -Math.PI / 2;
  glow.renderOrder = 1500;
  ring.renderOrder = 1501;
  group.add(glow, ring);
  group.visible = false;
  group.userData.glow = glow;
  group.userData.ring = ring;
  return group;
}

export function createMeteorModel() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.52, 0),
    mat('#4a3d39', { emissive: '#37160c', emissiveIntensity: 0.4 })
  );
  const glow = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.78, 0),
    basicMat('#ff8c3a', {
      transparent: true,
      opacity: 0.34,
      depthWrite: false
    })
  );
  group.add(glow, core);
  return enableShadows(group);
}
