import { MAX_COLUMNS_MOBILE, MIN_COLUMNS_MOBILE } from './constants';

export function clampColumnCount(value: number): number {
  return Math.max(MIN_COLUMNS_MOBILE, Math.min(MAX_COLUMNS_MOBILE, Math.round(value)));
}
