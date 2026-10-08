import type { RequestFilters } from '../../convex/lib/request_filters';
import { isOutcomeFilter } from '../../convex/lib/outcome';
import { DEFAULT_PERIOD, PERIOD_PRESETS, type PeriodPreset } from './supervisor-period';

/**
 * Lo que la lista de Replacement Requests guarda en la URL: el periodo, como
 * preajuste, y los filtros. Vive ahí para que una vista filtrada se pueda
 * enlazar —el resumen enlaza a «descontinuadas, últimos 30 días» y el detalle
 * de un Customer a sus solicitudes— y para que volver atrás la restaure.
 *
 * La URL la escribe cualquiera, así que se lee con desconfianza: un valor que
 * no se reconoce se ignora, nunca rompe la página.
 */

export interface ListView {
  preset: PeriodPreset;
  filters: RequestFilters;
}

const PATH = '/supervisor/requests';

const KEYS = { preset: 'period', outcome: 'outcome', customerId: 'customer', requestId: 'req' };

function isPreset(value: string): value is PeriodPreset {
  return PERIOD_PRESETS.some((preset) => preset === value);
}

/** Un parámetro con texto, o `undefined` si falta o sólo trae espacios. */
function text(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

/**
 * El preajuste de periodo de la URL. Lo lee también el resumen, con la misma
 * clave, para que volver atrás desde una lista enlazada lo conserve.
 */
export function readPeriodPreset(params: URLSearchParams): PeriodPreset {
  const preset = text(params, KEYS.preset);
  return preset && isPreset(preset) ? preset : DEFAULT_PERIOD;
}

export function readListView(params: URLSearchParams): ListView {
  const outcome = text(params, KEYS.outcome);
  const customerId = text(params, KEYS.customerId);
  const requestId = text(params, KEYS.requestId);

  return {
    preset: readPeriodPreset(params),
    filters: {
      ...(outcome && isOutcomeFilter(outcome) ? { outcome } : {}),
      ...(customerId ? { customerId } : {}),
      ...(requestId ? { requestId } : {}),
    },
  };
}

/** La dirección del resumen con este periodo; el de por defecto no se escribe. */
export function dashboardHref(preset: PeriodPreset): string {
  return preset === DEFAULT_PERIOD ? '/supervisor' : `/supervisor?${KEYS.preset}=${preset}`;
}

/**
 * La dirección de una vista de la lista. Lo que falta, o es lo de por defecto,
 * no se escribe.
 */
export function listViewHref({ preset = DEFAULT_PERIOD, filters }: Partial<ListView>): string {
  const params = new URLSearchParams();
  if (preset !== DEFAULT_PERIOD) params.set(KEYS.preset, preset);
  if (filters?.outcome) params.set(KEYS.outcome, filters.outcome);
  if (filters?.customerId) params.set(KEYS.customerId, filters.customerId);
  if (filters?.requestId) params.set(KEYS.requestId, filters.requestId);

  const search = params.toString();
  return search ? `${PATH}?${search}` : PATH;
}
