// 运输连线纯规则：容器端点、有向连线、流向。

//

// 容器（基地 / 箱子 / 工作台）可互相直连；

// 第一次点击 = 来源，第二次 = 目标，物品从来源抽到目标。

// 每条线有自己的白/黑名单；目标容器自身的存放过滤仍然生效。

import { PLAYER_BASE_STATION_ID } from './StationSystem.js';
import { importPortLabel, stationNeedsImportPortPicker } from './transportPorts.js';



export const TRANSPORT_ENDPOINT = {

  station: 'station'

};

export {
  FURNACE_IMPORT_PORT,
  STATION_IMPORT_PORT,
  importPortLabel,
  importPortSortKey,
  normalizeStationImportPort,
  stationImportPortCount,
  stationImportPortIds,
  stationNeedsImportPortPicker
} from './transportPorts.js';



/** @typedef {{ kind: 'station', stationId: string }} TransportStationEndpoint */

/** @typedef {TransportStationEndpoint} TransportEndpoint */



export function transportEndpointKey(endpoint) {

  if (!endpoint?.kind) return '';

  if (endpoint.kind === TRANSPORT_ENDPOINT.station) return `station:${endpoint.stationId}`;

  return '';

}



export function playerBaseTransportEndpoint() {

  return { kind: TRANSPORT_ENDPOINT.station, stationId: PLAYER_BASE_STATION_ID };

}



export function transportEndpointFromStation(station) {

  if (!station?.id) return null;

  return { kind: TRANSPORT_ENDPOINT.station, stationId: station.id };

}



export function transportEndpointFromUnit(unit, stations) {

  if (!unit?.id || !stations?.stationFor) return null;

  const station = stations.stationFor(unit);

  if (!station) return null;

  return transportEndpointFromStation(station);

}



function isStation(endpoint) {

  return endpoint?.kind === TRANSPORT_ENDPOINT.station && Boolean(endpoint.stationId);

}



/**

 * 连接 A → B：从 A 的仓库往 B 搬（受连线过滤 + B 的存放过滤）。

 */

export function resolveTransportLink(origin, target) {

  if (!origin || !target) return { ok: false, reason: 'missing_endpoint' };

  const aKey = transportEndpointKey(origin);

  const bKey = transportEndpointKey(target);

  if (!aKey || !bKey || aKey === bKey) return { ok: false, reason: 'same_endpoint' };

  if (!isStation(origin) || !isStation(target)) {

    return { ok: false, reason: 'invalid' };

  }

  return { ok: true, from: origin, to: target };

}



export function transportLinkEndpoints(link) {

  if (!link) return { from: null, to: null };

  return {

    from: { kind: TRANSPORT_ENDPOINT.station, stationId: link.fromStationId },

    to: { kind: TRANSPORT_ENDPOINT.station, stationId: link.toStationId }

  };

}



export const TRANSPORT_LINK_ERROR_LABELS = Object.freeze({

  same_endpoint: '不能连自己',

  missing_endpoint: '无效的端点',

  invalid: '无法建立这条运输线',

  duplicate: '该入料口已经接上线',
  import_ports_full: '该容器的入料口都已接满，不能再连'

});



export function furnaceImportPortLabel(port) {
  return importPortLabel({ kind: 'furnace' }, port);
}

export function transportStationLabel(stationId, stations, { importPort = null } = {}) {

  if (stationId === PLAYER_BASE_STATION_ID) return '基地';

  const station = stations?.stationById?.(stationId);

  if (station && importPort && stationNeedsImportPortPicker(station)) {
    const base = station.kind === 'furnace' ? '熔炉' : (station.kind === 'chest' ? '箱子' : '容器');
    return `${base}·${importPortLabel(station, importPort)}`;
  }
  if (station?.kind === 'furnace') return '熔炉';
  if (station?.kind === 'manaFurnace') return '魔力炉';
  if (station?.kind === 'chest') return '箱子';

  if (station?.kind === 'manualWorkbench') return '工作台';

  return stationId ?? '容器';

}


