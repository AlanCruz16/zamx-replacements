import { describe, expect, test } from 'vitest';
import { marksMessageSeen, type ReplyDisposition } from './inbox_seen';

/**
 * La propiedad que hizo recuperable el apagón del 5 de agosto de 2026: lo que no
 * se procesó sigue sin leer. Se pincha aquí para que un cambio futuro en el
 * manejo de la bandera `\Seen` no la quite en silencio —con el buzón cerrado no
 * hay prueba de integración posible, y el coste de perderla es una respuesta de
 * un Approver que nadie vuelve a ver.
 */

describe('marksMessageSeen', () => {
  test('sólo se marca leído lo que el sondeo llegó a resolver', () => {
    expect(marksMessageSeen('applied')).toBe(true);
    expect(marksMessageSeen('superseded')).toBe(true);
    expect(marksMessageSeen('already_settled')).toBe(true);
  });

  test('un procesamiento que falló deja el mensaje sin leer', () => {
    // El caso del apagón visto desde dentro: si el intérprete o la mutación
    // revientan, el siguiente sondeo tiene que volver a ver la respuesta.
    expect(marksMessageSeen('apply_failed')).toBe(false);
  });

  test('un remitente no autorizado deja el mensaje sin leer', () => {
    // Añadir al Approver que faltaba y esperar cinco minutos lo recupera.
    expect(marksMessageSeen('sender_refused')).toBe(false);
  });

  test('un folio inexistente y un correo ajeno se quedan sin leer', () => {
    expect(marksMessageSeen('request_not_found')).toBe(false);
    expect(marksMessageSeen('not_ours')).toBe(false);
  });

  test('ninguna situación que no sea una decisión sobre el mensaje lo marca leído', () => {
    // El contraste completo, para que añadir un caso nuevo obligue a decidir de
    // qué lado cae en vez de heredar el `true`.
    const seen: ReplyDisposition[] = ['applied', 'superseded', 'already_settled'];
    const dispositions: ReplyDisposition[] = [
      ...seen,
      'request_not_found',
      'apply_failed',
      'sender_refused',
      'not_ours',
    ];

    expect(dispositions.filter(marksMessageSeen)).toEqual(seen);
  });
});
