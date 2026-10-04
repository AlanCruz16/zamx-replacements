/**
 * Que ninguna pantalla del panel del Supervisor se salte la puerta.
 *
 * El layout no basta: Next lo renderiza en paralelo con la página, y una página
 * que no pregunte por sí misma viaja dentro del 404 que recibe un Customer (ver
 * `supervisor-access.ts`). Una pantalla nueva que olvide llamar a la puerta se
 * cae aquí en vez de filtrarse.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { ROOT, sourceFiles } from '@/test/source-files';

const SCREENS = sourceFiles(join('src', 'app', 'supervisor')).filter((path) =>
  /(^|[\\/])(page|layout)\.tsx$/.test(path)
);

describe('las pantallas del panel del Supervisor', () => {
  test('hay pantallas que comprobar', () => {
    expect(SCREENS.length).toBeGreaterThan(0);
  });

  test.each(SCREENS)('%s pregunta por sí misma si quien llama es Supervisor', (path) => {
    const source = readFileSync(join(ROOT, path), 'utf8');

    expect(source).toMatch(/await requireSupervisorPage\(\)/);
  });
});
