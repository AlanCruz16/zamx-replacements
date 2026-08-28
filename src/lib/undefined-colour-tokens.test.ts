/**
 * La guardia contra los tokens de color que no existen aquí.
 *
 * Dos pruebas con dos trabajos distintos: una recorre el código y falla si un
 * token indefinido ha vuelto a colarse, nombrando cuál y dónde; las otras
 * comprueban que el detector detecta, porque una guardia que no distingue nada
 * pasa siempre y no protege de nada.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, sourceFiles } from '@/test/source-files';
import { findUndefinedColourTokens } from './undefined-colour-tokens';

/**
 * El módulo de la lista se excluye: sus comentarios escriben las clases
 * prohibidas enteras porque es donde toca explicarlas, y no pinta nada —no
 * tiene JSX ni `className`, así que no hay dónde esconder una infracción.
 */
const WHERE_THE_LIST_LIVES = join('src', 'lib', 'undefined-colour-tokens.ts');

/**
 * Todo lo que puede nombrar una clase de Tailwind: los componentes y el CSS,
 * porque un `@apply` en una hoja de estilos falla igual de callado que un
 * `className`.
 */
const PAINTS_SOMETHING = /\.(tsx?|css)$/;

/** El código que se pinta, con el módulo de la lista fuera. */
function scanned(): string[] {
  const exclude = (path: string) => path === WHERE_THE_LIST_LIVES;
  return [
    ...sourceFiles('src', { extensions: PAINTS_SOMETHING, exclude }),
    ...sourceFiles('convex', { extensions: PAINTS_SOMETHING, exclude }),
  ];
}

describe('tokens de color indefinidos', () => {
  it('recorre de verdad el código, y no una lista vacía', () => {
    // Sin esto la comprobación de abajo pasa sola el día que un filtro se pase
    // de listo y descarte el árbol entero: cero ficheros, cero infracciones.
    const files = scanned();

    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain(join('src', 'components', 'ui', 'expandable-tabs.tsx'));
    expect(files).toContain(join('src', 'app', 'globals.css'));
  });

  it('no aparece ninguno en el código', () => {
    const offences = scanned().flatMap((path) =>
      findUndefinedColourTokens(readFileSync(join(ROOT, path), 'utf8')).map(
        ({ utility, line }) => `${path}:${line} — ${utility}`
      )
    );

    expect(
      offences,
      `clases que no compilan a ningún color (ver src/lib/undefined-colour-tokens.ts):\n${offences.join('\n')}`
    ).toEqual([]);
  });

  it('reconoce un token reintroducido, y dice cuál y en qué línea', () => {
    // Se arma por trozos a propósito: escrita entera, esta clase la cazaría la
    // prueba de arriba en cuanto alguien la mueva a un fichero de código.
    const source = ['<div', `  className="mx-1 bg-${'border'}"`, '/>'].join('\n');

    expect(findUndefinedColourTokens(source)).toEqual([
      { token: 'border', utility: 'bg-border', line: 2 },
    ]);
  });

  it('lee el token entero cuando uno es prefijo de otro', () => {
    const source = `hover:text-${'muted'}-foreground`;

    expect(findUndefinedColourTokens(source)).toEqual([
      { token: 'muted-foreground', utility: 'text-muted-foreground', line: 1 },
    ]);
  });

  it('deja en paz las clases que sí definen un color', () => {
    const source = [
      'border-b border-gray-200/50 dark:border-gray-800/50',
      'bg-[var(--background)] text-[var(--color-brand-blue)]',
      'ring-2 bg-white dark:bg-gray-800',
    ].join('\n');

    expect(findUndefinedColourTokens(source)).toEqual([]);
  });
});
