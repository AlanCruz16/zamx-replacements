import { DEFAULT_LANGUAGE, resolveLanguage, type Language } from '@/lib/messages';

/**
 * El último idioma que se le conoció al Customer, guardado en el navegador.
 *
 * Existe por un caso concreto: la frontera de error de la pantalla de chat
 * (ticket 02) redacta su mensaje *después* de que algo se haya caído, y lo que
 * se cae puede ser el primer render —justo el arranque en frío del teléfono—.
 * En ese instante la consulta que sabe el idioma del Customer no ha contestado
 * todavía, así que preguntárselo daría siempre el español.
 *
 * Recordarlo aquí no es una segunda fuente de verdad: la de verdad sigue siendo
 * la fila del Customer, y esto es sólo lo último que dijo, para poder hablarle
 * en su idioma cuando no queda nadie a quien preguntárselo.
 */
const KEY = 'zamx.language';

/**
 * Todo acceso va envuelto: el almacenamiento del navegador lanza —modo privado
 * de Safari, cookies bloqueadas— y una preferencia de idioma no vale una
 * pantalla caída. Sin ella se habla en el idioma por defecto, que es lo mismo
 * que pasaba antes de recordarla.
 */
export function rememberLanguage(language: Language): void {
  try {
    window.localStorage.setItem(KEY, language);
  } catch {
    // Nada que hacer: se seguirá usando el idioma por defecto.
  }
}

export function lastKnownLanguage(): Language {
  try {
    return resolveLanguage(window.localStorage.getItem(KEY));
  } catch {
    return DEFAULT_LANGUAGE;
  }
}
