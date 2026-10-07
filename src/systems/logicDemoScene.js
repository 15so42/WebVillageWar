// 临时逻辑门演示。只在 logic-demo 场景里摆三组已经接好的门，不进入海岛。
import * as THREE from 'three';
import { transportEndpointFromStation } from './transport.js';

const AND_DELAY = 5;
const NOT_DELAY = 10;

export function setupLogicGateDemo(game) {
  if (game.worldConfig?.sceneKey !== 'logic-demo') return null;
  const and = placeColumn(game, {
    x: -7,
    title: '与门：等石头',
    gateType: 'andGate',
    gateName: '与门',
    left: { name: '木头箱', itemId: 'wood', count: 6 },
    right: { name: '石头箱', itemId: null, count: 0 },
    inputs: [
      { side: 'left', itemId: 'wood' },
      { side: 'right', itemId: 'stone' }
    ]
  });
  const or = placeColumn(game, {
    x: 0,
    title: '或门：有货就通',
    gateType: 'orGate',
    gateName: '或门',
    left: { name: '或门左箱', itemId: 'wood', count: 4 },
    right: { name: '或门右箱', itemId: null, count: 0 },
    inputs: [
      { side: 'left', itemId: null },
      { side: 'right', itemId: null }
    ]
  });
  const not = placeColumn(game, {
    x: 7,
    title: '非门：空箱才通',
    gateType: 'notGate',
    gateName: '非门',
    left: { name: '空箱', itemId: null, count: 0 },
    right: null,
    inputs: [{ side: 'left', itemId: null }]
  });
  game.selectUnit(null);
  game.setCameraFollowEnabled?.(false);
  game.cameraTarget?.set(0, 4, 13);
  game.logicDemo = {
    elapsed: 0,
    andArmed: false,
    notBlocked: false,
    andStone: and.right.station,
    notWatch: not.left.station,
    andTitle: and.title,
    notTitle: not.title
  };
  return game.logicDemo;
}

export function tickLogicGateDemo(game, dt) {
  const demo = game?.logicDemo;
  if (!demo || game.worldConfig?.sceneKey !== 'logic-demo') return;
  demo.elapsed += Math.max(0, dt);
  if (!demo.andArmed && demo.elapsed >= AND_DELAY) {
    demo.andArmed = true;
    demo.andStone.inventory.add('stone', 4);
    demo.andTitle.setText('与门：已通');
  }
  if (!demo.notBlocked && demo.elapsed >= NOT_DELAY) {
    demo.notBlocked = true;
    demo.notWatch.inventory.add('stone', 1);
    demo.notTitle.setText('非门：已停');
  }
}

function placeColumn(game, spec) {
  const left = placeStation(game, 'chest', spec.x - 2, 16, spec.left.name);
  if (spec.left.itemId && spec.left.count > 0) {
    left.station.inventory.add(spec.left.itemId, spec.left.count);
  }
  const right = spec.right
    ? placeStation(game, 'chest', spec.x + 2, 16, spec.right.name)
    : null;
  if (right && spec.right.itemId && spec.right.count > 0) {
    right.station.inventory.add(spec.right.itemId, spec.right.count);
  }
  const gate = placeStation(game, spec.gateType, spec.x, 13, spec.gateName);
  const bySide = { left: left.station, right: right?.station ?? null };
  spec.inputs.forEach((input) => {
    const station = bySide[input.side];
    if (!station) return;
    game.stations.configureLogicStation(gate.station.id, {
      toggleInput: { stationId: station.id, itemId: input.itemId }
    });
  });
  const supply = placeStation(game, 'chest', spec.x - 2, 10, '供货');
  const output = placeStation(game, 'chest', spec.x + 2, 10, '收货');
  supply.station.inventory.add('wood', 16);
  const linked = game.transport.tryAddLink(
    transportEndpointFromStation(supply.station),
    transportEndpointFromStation(output.station)
  );
  if (linked?.ok) {
    game.transport.setLinkGate(linked.link.id, {
      gateStationId: gate.station.id,
      gateBranch: 'then'
    });
  }
  const title = addTitle(game, spec.title, spec.x, 18.2);
  return { left, right, gate, supply, output, title };
}

function placeStation(game, type, x, z, name) {
  const unit = game.buildStructureUnit(type, new THREE.Vector3(x, 0, z), { buildSeconds: 0.1 });
  game.buildings.completeConstruction(unit);
  unit.name = name;
  const station = game.stations.registerBuilding(unit);
  addLabel(unit, name);
  return { unit, station };
}

function addTitle(game, text, x, z) {
  const label = createLabel(text, 512, 96);
  label.sprite.position.set(x, game.groundHeightAt?.({ x, z }) ?? 0, z);
  label.sprite.position.y += 2.6;
  label.sprite.scale.set(6.4, 1.2, 1);
  game.scene.add(label.sprite);
  return label;
}

function addLabel(unit, text) {
  const label = createLabel(text, 256, 64);
  label.sprite.position.set(0, 2.35, 0);
  label.sprite.scale.set(2.6, 0.65, 1);
  (unit.mesh ?? unit.visualRoot)?.add(label.sprite);
}

function createLabel(text, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true
  });
  const sprite = new THREE.Sprite(material);
  sprite.layers.set(0);
  sprite.renderOrder = 0;
  const label = {
    sprite,
    setText(next) {
      paintLabel(canvas, texture, next, width, height);
    }
  };
  label.setText(text);
  return label;
}

function paintLabel(canvas, texture, text, width, height) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(28, 22, 14, 0.78)';
  ctx.fillRect(8, 8, width - 16, height - 16);
  ctx.fillStyle = '#f3ecdc';
  ctx.font = `${Math.floor(height * 0.42)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + 1);
  texture.needsUpdate = true;
}
