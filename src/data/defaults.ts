import type { Settings } from './types';

export function defaultSettings(): Settings {
  return {
    id: 'main',
    updatedAt: new Date(0).toISOString(),
    displayName: '',
    course: 'Medicina',
    availability: [180, 120, 120, 120, 120, 120, 180],
    availabilityOverrides: {},
    defaultIntervals: [1, 7, 21],
    pomodoro: { focus: 25, short: 5, long: 15, cyclesBeforeLong: 4 },
    passing: {},
    defaultPassing: 7,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
  };
}
