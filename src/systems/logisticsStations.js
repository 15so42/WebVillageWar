// 泛用逻辑门（纯数据）。
//
// 门不认某一种专用材料。每路输入是一只箱子：
// 不指定种类时，箱子里有任何货物就算真；指定了种类，就只数那一种。
// 与门要每一路都为真，或门有一路为真即可，非门把第一路取反。
// 运输线绑到门上之后，只在「通」或「不通」那一支放行。

export const GATE_KIND = Object.freeze({
  and: 'andGate',
  or: 'orGate',
  not: 'notGate'
});

const GATE_KINDS = new Set([GATE_KIND.and, GATE_KIND.or, GATE_KIND.not, 'logicGate']);

export function isLogicGate(station) {
  return GATE_KINDS.has(station?.kind);
}

export function gateOp(gate) {
  if (gate?.op === 'and' || gate?.op === 'or' || gate?.op === 'not') return gate.op;
  if (gate?.kind === GATE_KIND.or) return 'or';
  if (gate?.kind === GATE_KIND.not) return 'not';
  return 'and';
}

function inventoryCount(inventory, itemId) {
  if (!inventory?.slots && !inventory?.countOf) return 0;
  if (!itemId) {
    return (inventory.slots ?? []).reduce((sum, slot) => sum + (slot?.count ?? 0), 0);
  }
  return inventory.countOf?.(itemId) ?? 0;
}

export function gateInputs(gate) {
  if (Array.isArray(gate?.inputs) && gate.inputs.length) return gate.inputs;
  if (gate?.watchStationId) {
    return [{ stationId: gate.watchStationId, itemId: gate.watchItemId || null }];
  }
  return [];
}

/** 这一路输入是否为真。threshold 默认 0，表示件数必须大于 0。 */
export function inputIsHigh(input, stationsById) {
  const station = stationsById?.get?.(input?.stationId) ?? null;
  if (!station?.inventory) return false;
  const threshold = Math.max(0, Math.floor(Number(input?.threshold) || 0));
  return inventoryCount(station.inventory, input?.itemId || null) > threshold;
}

export function gateIsActive(gate, stationsById) {
  const inputs = gateInputs(gate);
  const op = gateOp(gate);
  if (!inputs.length) return false;
  if (op === 'not') return !inputIsHigh(inputs[0], stationsById);
  if (op === 'or') return inputs.some((input) => inputIsHigh(input, stationsById));
  return inputs.every((input) => inputIsHigh(input, stationsById));
}

export function refreshLogicGates(stationsById) {
  if (!stationsById?.forEach) return;
  stationsById.forEach((station) => {
    if (!isLogicGate(station)) return;
    station.active = gateIsActive(station, stationsById);
  });
}

/** 运输线若绑了门，只在对应的通 / 不通支路放行。没绑门的线不受影响。 */
export function linkAllowedByGate(link, stationsById) {
  if (!link?.gateStationId) return true;
  const gate = stationsById?.get?.(link.gateStationId) ?? null;
  if (!isLogicGate(gate)) return false;
  const active = gate.active === true;
  const branch = link.gateBranch === 'else' ? 'else' : 'then';
  return branch === 'then' ? active : !active;
}

export function tickLogicDevices(stationsById) {
  refreshLogicGates(stationsById);
  return [];
}
