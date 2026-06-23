import * as THREE from 'three';
import { BALANCE } from '../data/gameData.js';
import {
  createBaseModel,
  createEnemyCampModel,
  createRock,
  createTree,
  mat
} from '../art/lowpoly.js';
import { seededRandom } from '../utils/math.js';

export function createWorld(scene) {
  scene.background = new THREE.Color('#9ed4ec');
  scene.fog = new THREE.Fog('#9ed4ec', 34, 68);

  const sun = new THREE.DirectionalLight('#fff1c3', 3.2);
  sun.position.set(-8, 18, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight('#cdefff', '#4c6b46', 1.8));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 44, 8, 8),
    mat('#6ea75b')
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  createPath(scene);

  const base = createBaseModel();
  base.position.set(
    BALANCE.playerBase.position.x,
    0,
    BALANCE.playerBase.position.z
  );
  scene.add(base);

  const enemyCamp = createEnemyCampModel();
  enemyCamp.position.set(
    BALANCE.enemyCamp.position.x,
    0,
    BALANCE.enemyCamp.position.z
  );
  scene.add(enemyCamp);

  decorate(scene);

  return {
    ground,
    playerBaseModel: base,
    enemyCampModel: enemyCamp,
    recoveryAura: base.userData.aura
  };
}

function createPath(scene) {
  const material = mat('#c6aa73');
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.012, 14),
    new THREE.Vector3(-2.5, 0.012, 7),
    new THREE.Vector3(1.8, 0.012, 0),
    new THREE.Vector3(-1.2, 0.012, -7),
    new THREE.Vector3(0, 0.012, -15)
  ]);
  const points = curve.getPoints(28);
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const mid = a.clone().lerp(b, 0.5);
    const length = a.distanceTo(b) + 0.24;
    const segment = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 0.035, length),
      material
    );
    segment.position.copy(mid);
    segment.lookAt(b.x, b.y, b.z);
    segment.receiveShadow = true;
    scene.add(segment);
  }
}

function decorate(scene) {
  const random = seededRandom(42);
  for (let i = 0; i < 52; i += 1) {
    const side = random() > 0.5 ? 1 : -1;
    const x = side * (12 + random() * 10);
    const z = -18 + random() * 36;
    const tree = createTree(0.78 + random() * 0.65);
    tree.position.set(x, 0, z);
    tree.rotation.y = random() * Math.PI * 2;
    scene.add(tree);
  }

  for (let i = 0; i < 26; i += 1) {
    const x = -19 + random() * 38;
    const z = -19 + random() * 38;
    if (Math.abs(x) < 7 && z > 8) continue;
    if (Math.abs(x) < 5 && z < -11) continue;
    const rock = createRock(0.45 + random() * 0.8);
    rock.position.set(x, 0, z);
    rock.rotation.y = random() * Math.PI * 2;
    scene.add(rock);
  }

  const stream = new THREE.Mesh(
    new THREE.BoxGeometry(44, 0.025, 1.4),
    mat('#5ba6b7', { roughness: 0.45 })
  );
  stream.position.set(0, 0.02, -4.5);
  stream.rotation.y = -0.12;
  stream.receiveShadow = true;
  scene.add(stream);
}
