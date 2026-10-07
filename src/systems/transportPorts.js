// 运输目标容器的入料口（多口容器共用同一套连线规则）。
import { STATION_KIND, stationUsesFuelSlots } from './StationSystem.js';

export const STATION_IMPORT_PORT = Object.freeze({
  default: 'default',
  input: 'input',
  fuel: 'fuel'
});

/** @deprecated 使用 STATION_IMPORT_PORT */
export const FURNACE_IMPORT_PORT = STATION_IMPORT_PORT;

export function stationImportPortIds(station) {
  if (stationUsesFuelSlots(station?.kind)) {
    return [STATION_IMPORT_PORT.input, STATION_IMPORT_PORT.fuel];
  }
  return [STATION_IMPORT_PORT.default];
}

export function stationImportPortCount(station) {
  return stationImportPortIds(station).length;
}

export function stationNeedsImportPortPicker(station) {
  return stationImportPortCount(station) > 1;
}

export function normalizeStationImportPort(station, port) {
  const ports = stationImportPortIds(station);
  if (ports.length === 1) return ports[0];
  if (port && ports.includes(port)) return port;
  return ports[0];
}

export function importPortLabel(station, port) {
  if (stationUsesFuelSlots(station?.kind)) {
    if (port === STATION_IMPORT_PORT.fuel) return '燃料口';
    if (port === STATION_IMPORT_PORT.input) return '进料口';
  }
  return '入料口';
}

export function importPortSortKey(port) {
  if (port === STATION_IMPORT_PORT.input) return 0;
  if (port === STATION_IMPORT_PORT.fuel) return 1;
  if (port === STATION_IMPORT_PORT.default) return 0;
  return 2;
}
