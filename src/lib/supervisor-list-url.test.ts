import { describe, expect, test } from 'vitest';
import { listViewHref, readListView, type ListView } from './supervisor-list-url';

/** Lo que la lista lee de una dirección, como la vería al abrirla. */
function read(search: string): ListView {
  return readListView(new URLSearchParams(search));
}

describe('la vista de la lista en la URL', () => {
  test('sin nada en la URL: los últimos 30 días, sin filtros', () => {
    expect(read('')).toEqual({ preset: 'last30', filters: {} });
  });

  test('lee el periodo y cada filtro', () => {
    expect(read('period=all&outcome=discontinued&customer=abc123&req=REQ-7K2F9A')).toEqual({
      preset: 'all',
      filters: { outcome: 'discontinued', customerId: 'abc123', requestId: 'REQ-7K2F9A' },
    });
  });

  test('«en revisión» y blocked_pending_info son valores distintos', () => {
    expect(read('outcome=awaiting_review').filters).toEqual({ outcome: 'awaiting_review' });
    expect(read('outcome=blocked_pending_info').filters).toEqual({
      outcome: 'blocked_pending_info',
    });
  });

  test('un valor desconocido o vacío se ignora en vez de romper la página', () => {
    expect(read('period=ayer&outcome=quien-sabe&customer=&req=%20%20')).toEqual({
      preset: 'last30',
      filters: {},
    });
  });

  test('la dirección omite lo que ya es por defecto', () => {
    expect(listViewHref({ preset: 'last30', filters: {} })).toBe('/supervisor/requests');
    expect(listViewHref({ filters: { outcome: 'discontinued' } })).toBe(
      '/supervisor/requests?outcome=discontinued'
    );
  });

  test('ida y vuelta: lo que se escribe es lo que se lee', () => {
    const views: ListView[] = [
      { preset: 'last7', filters: { outcome: 'awaiting_review' } },
      { preset: 'all', filters: { customerId: 'k57abc', outcome: 'priced_differently' } },
      { preset: 'last90', filters: { requestId: 'REQ-7K2F9A' } },
    ];
    for (const view of views) {
      const href = listViewHref(view);
      expect(read(href.split('?')[1] ?? '')).toEqual(view);
    }
  });
});
