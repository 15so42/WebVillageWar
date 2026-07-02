export class PathfindingSystem {
  constructor(game) {
    this.game = game;
  }

  clear(unit) {
    this.game.clearUnitRoute?.(unit);
  }

  requestRepath(unit, delay) {
    this.game.requestUnitRouteRepath?.(unit, delay);
  }

  steeringToward(unit, targetPosition, desiredDistance = 0.22) {
    if (!unit || !targetPosition) return null;
    return this.game.navGridSteeringToward?.(unit.position, targetPosition, unit, desiredDistance) ?? null;
  }
}
