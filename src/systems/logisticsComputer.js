// 寄存器机的纯数字参考实现。
//
// 玩家能放下的机器是与门、或门、非门，不读这里的铁矿或木头。
// 这里只保留「加一 / 遇零跳转」的抽象证明，方便对照图灵完备，不创建建筑。

export const TALLY = Object.freeze({
  goods: 'iron',
  fuel: 'wood'
});

export function createRegisters(initial = {}) {
  const registers = {};
  Object.entries(initial).forEach(([id, value]) => {
    registers[id] = Math.max(0, Math.floor(Number(value) || 0));
  });
  return registers;
}

/**
 * 执行一条指令。
 * inc: { op:'inc', reg, next }
 * dec: { op:'dec', reg, ifZero, ifContinue }  为零则跳 ifZero，否则减一后跳 ifContinue
 * halt: { op:'halt' }
 */
export function stepRegisterMachine(program, state) {
  const instructions = Array.isArray(program) ? program : [];
  const pc = Math.floor(Number(state?.pc) || 0);
  const registers = state?.registers ?? {};
  const instruction = instructions[pc];
  if (!instruction || instruction.op === 'halt') {
    return { pc, registers, halted: true, op: 'halt' };
  }
  if (instruction.op === 'inc') {
    const reg = instruction.reg;
    registers[reg] = Math.max(0, Math.floor(Number(registers[reg]) || 0)) + 1;
    return {
      pc: Math.floor(Number(instruction.next) || 0),
      registers,
      halted: false,
      op: 'inc',
      reg
    };
  }
  if (instruction.op === 'dec') {
    const reg = instruction.reg;
    const current = Math.max(0, Math.floor(Number(registers[reg]) || 0));
    if (current <= 0) {
      return {
        pc: Math.floor(Number(instruction.ifZero) || 0),
        registers,
        halted: false,
        op: 'dec',
        branch: 'zero',
        reg
      };
    }
    registers[reg] = current - 1;
    return {
      pc: Math.floor(Number(instruction.ifContinue) || 0),
      registers,
      halted: false,
      op: 'dec',
      branch: 'continue',
      reg
    };
  }
  return { pc, registers, halted: true, op: 'halt', error: 'unknown-op' };
}

export function runRegisterMachine(program, registers, { maxSteps = 10000, pc = 0 } = {}) {
  let state = { pc, registers: createRegisters(registers), halted: false };
  let steps = 0;
  while (!state.halted && steps < maxSteps) {
    state = stepRegisterMachine(program, state);
    steps += 1;
  }
  return { ...state, steps, exhausted: !state.halted };
}

/** r0 = r0 + r1，用完 r1。两寄存器循环，用来验收「存储 + 分支 + 回跳」。 */
export function additionProgram() {
  return [
    { op: 'dec', reg: 'r1', ifZero: 2, ifContinue: 1 },
    { op: 'inc', reg: 'r0', next: 0 },
    { op: 'halt' }
  ];
}

/**
 * 库存上的一次「拿走一块」：铁矿箱减 1。
 * 已经是 0 时不动铁矿，把这块木头放到「没货了」；否则木头放到「还有货」。
 * 要求燃料时，没有木头就拒绝，铁矿也不动。
 */
export function stepInventoryDec({
  register,
  zeroOut = null,
  continueOut = null,
  pulse = null,
  requirePulse = false,
  tokenId = TALLY.goods,
  fuelId = TALLY.fuel
} = {}) {
  if (!register?.countOf || !register.remove || !register.add) {
    return { ok: false, branch: null, error: 'bad-register' };
  }
  if (requirePulse) {
    if (!pulse?.countOf || pulse.countOf(fuelId) < 1) {
      return { ok: false, branch: null, error: 'no-pulse' };
    }
    const spent = pulse.remove(fuelId, 1);
    if (!spent?.ok) return { ok: false, branch: null, error: 'no-pulse' };
  }
  if (register.countOf(tokenId) <= 0) {
    zeroOut?.add?.(fuelId, 1);
    return { ok: true, branch: 'zero' };
  }
  const taken = register.remove(tokenId, 1);
  if (!taken?.ok) return { ok: false, branch: null, error: 'remove-failed' };
  continueOut?.add?.(fuelId, 1);
  return { ok: true, branch: 'continue' };
}

export function stepInventoryInc(register, count = 1, tokenId = TALLY.goods) {
  const added = register?.add?.(tokenId, count);
  return { ok: Number(added) === count || added?.ok === true || added === count, added };
}
