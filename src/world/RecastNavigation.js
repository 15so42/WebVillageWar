import * as THREE from 'three';
import { NavMeshQuery } from 'recast-navigation';
import { threeToSoloNavMesh } from '@recast-navigation/three';

const DEFAULT_QUERY_HALF_EXTENTS = { x: 2.5, y: 3, z: 2.5 };
const DEBUG_SAMPLE_STEP = 1.35;
const LINE_SAMPLE_STEP = 0.24;
const LINE_SAMPLE_TOLERANCE = 0.08;

export class RecastNavigation {
  constructor({
    meshes,
    bounds,
    config = {},
    debugSampleStep = DEBUG_SAMPLE_STEP
  }) {
    if (!Array.isArray(meshes) || meshes.length === 0) {
      throw new Error('RecastNavigation requires at least one navigation mesh.');
    }

    const result = threeToSoloNavMesh(meshes, {
      cs: 0.18,
      ch: 0.12,
      walkableSlopeAngle: 45,
      walkableHeight: 2,
      walkableClimb: 0.35,
      walkableRadius: 1,
      maxEdgeLen: 24,
      maxSimplificationError: 0.45,
      minRegionArea: 2,
      mergeRegionArea: 6,
      maxVertsPerPoly: 6,
      detailSampleDist: 3,
      detailSampleMaxError: 0.45,
      ...config
    });

    if (!result.success) {
      throw new Error(`Failed to build Recast navmesh: ${result.error ?? 'unknown error'}`);
    }

    this.navMesh = result.navMesh;
    this.query = new NavMeshQuery(this.navMesh, { maxNodes: 4096 });
    this.query.defaultQueryHalfExtents = { ...DEFAULT_QUERY_HALF_EXTENTS };
    this.bounds = bounds ?? boundsFromMeshes(meshes);
    this.debugPoints = buildDebugPoints(this, this.bounds, debugSampleStep);
  }

  findPath(start, end) {
    if (!start || !end) return [];
    const startPoint = this.closestPoint(start);
    const endPoint = this.closestPoint(end);
    if (!startPoint || !endPoint) return [];

    const result = this.query.computePath(
      toRecastVector(startPoint),
      toRecastVector(endPoint),
      {
        halfExtents: DEFAULT_QUERY_HALF_EXTENTS,
        maxPathPolys: 512,
        maxStraightPathPoints: 512
      }
    );

    if (!result.success || !Array.isArray(result.path) || result.path.length === 0) {
      return [];
    }

    return result.path.map((point) => new THREE.Vector3(point.x, 0, point.z));
  }

  hasLine(start, end) {
    if (!start || !end) return true;
    const distance = Math.hypot(end.x - start.x, end.z - start.z);
    const sampleCount = Math.max(2, Math.ceil(distance / LINE_SAMPLE_STEP));
    for (let i = 0; i <= sampleCount; i += 1) {
      const t = i / sampleCount;
      const point = new THREE.Vector3(
        start.x + (end.x - start.x) * t,
        0,
        start.z + (end.z - start.z) * t
      );
      if (!this.isPointOnNavMesh(point, LINE_SAMPLE_TOLERANCE)) {
        return false;
      }
    }
    return true;
  }

  pathDistance(start, end) {
    const path = this.findPath(start, end);
    if (!path.length) return Infinity;
    let distance = 0;
    for (let i = 1; i < path.length; i += 1) {
      distance += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    }
    return distance;
  }

  isPointOnNavMesh(point, tolerance = 0.42) {
    const closest = this.closestPoint(point);
    if (!closest) return false;
    return Math.hypot(closest.x - point.x, closest.z - point.z) <= tolerance;
  }

  closestPoint(point) {
    const result = this.query.findClosestPoint(toRecastVector(point), {
      halfExtents: DEFAULT_QUERY_HALF_EXTENTS
    });
    if (!result.success) return null;
    return new THREE.Vector3(result.point.x, 0, result.point.z);
  }

  dispose() {
    this.query?.destroy?.();
    this.navMesh?.destroy?.();
    this.query = null;
    this.navMesh = null;
  }
}

function toRecastVector(point) {
  return {
    x: point.x,
    y: Number.isFinite(point.y) ? point.y : 0,
    z: point.z
  };
}

function buildDebugPoints(navigation, bounds, step) {
  const points = [];
  if (!bounds) return points;
  for (let z = bounds.minZ; z <= bounds.maxZ; z += step) {
    for (let x = bounds.minX; x <= bounds.maxX; x += step) {
      const point = new THREE.Vector3(x, 0, z);
      if (!navigation.isPointOnNavMesh(point, step * 0.34)) continue;
      points.push(navigation.closestPoint(point));
    }
  }
  return points.filter(Boolean);
}

function boundsFromMeshes(meshes) {
  const box = new THREE.Box3();
  meshes.forEach((mesh) => {
    mesh.updateMatrixWorld(true);
    box.expandByObject(mesh);
  });
  return {
    minX: box.min.x,
    maxX: box.max.x,
    minZ: box.min.z,
    maxZ: box.max.z
  };
}
