import { describe, expect, test } from 'vitest';
import { DEFAULT_PERIOD, PERIOD_PRESETS, periodBounds } from './supervisor-period';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 4, 12);

describe('el periodo del panel del Supervisor', () => {
  test('por defecto son los últimos 30 días', () => {
    expect(DEFAULT_PERIOD).toBe('last30');
    expect(periodBounds(DEFAULT_PERIOD, NOW)).toEqual({ start: NOW - 30 * DAY });
  });

  test('«todo» no acota nada', () => {
    expect(periodBounds('all', NOW)).toEqual({});
  });

  test('cada preajuste acaba en «ahora», sin cota superior', () => {
    for (const preset of PERIOD_PRESETS) {
      expect(periodBounds(preset, NOW)).not.toHaveProperty('end');
    }
  });
});
