'use client';

import { useId } from 'react';
import { PERIOD_PRESETS, type PeriodPreset } from '@/lib/supervisor-period';
import { SUPERVISOR_MESSAGES as t } from '@/lib/messages';

export function PeriodPicker({
  value,
  onChange,
}: {
  value: PeriodPreset;
  onChange: (preset: PeriodPreset) => void;
}) {
  const id = useId();

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={id} className="text-gray-500">
        {t.period.label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as PeriodPreset)}
        className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0a0a0a] px-2 py-1.5"
      >
        {PERIOD_PRESETS.map((preset) => (
          <option key={preset} value={preset}>
            {t.period.presets[preset]}
          </option>
        ))}
      </select>
    </div>
  );
}
