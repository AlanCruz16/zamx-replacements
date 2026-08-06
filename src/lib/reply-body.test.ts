import { describe, expect, test } from 'vitest';
import { replyBodyForInterpretation } from './reply-body';

/**
 * Qué llega al modelo de un correo del Approver. Cortar de más es perder la
 * decisión, así que cada caso dice también qué se conserva.
 */

describe('la cadena citada no llega al modelo', () => {
  test('corta en la primera línea citada con «>»', () => {
    const body = ['Aprobado', '', 'El 5 ago 2026 ZIEHL-ABEGG escribió:', '> Hola equipo'].join(
      '\n'
    );

    expect(replyBodyForInterpretation(body)).toBe('Aprobado');
  });

  test('corta en el encabezado «… escribió:» aunque la cita venga sin «>»', () => {
    const body = [
      'Descontinuado',
      '',
      'El mar, 5 ago 2026 a las 10:14, ZIEHL-ABEGG <no-reply@zamx.mx> escribió:',
      'Hola equipo de ventas,',
      'Responde: «Aprobado».',
    ].join('\n');

    expect(replyBodyForInterpretation(body)).toBe('Descontinuado');
  });

  test('corta en el encabezado en inglés de Gmail y Apple Mail', () => {
    const body = ['OEM', '', 'On Aug 5, 2026, at 10:14, ZIEHL-ABEGG wrote:', 'Hola equipo'].join(
      '\n'
    );

    expect(replyBodyForInterpretation(body)).toBe('OEM');
  });

  test('corta en el separador de mensaje original', () => {
    const body = ['Obsoleto', '', '-----Mensaje original-----', 'De: ZIEHL-ABEGG'].join('\n');

    expect(replyBodyForInterpretation(body)).toBe('Obsoleto');
  });

  test('corta en el bloque de cabeceras reenviadas de Outlook', () => {
    const body = [
      'Falta info: mándame la foto de la placa',
      '',
      'De: ZIEHL-ABEGG <no-reply@zamx.mx>',
      'Enviado: martes, 5 de agosto de 2026 10:14',
      'Para: ventas@zamx.mx',
    ].join('\n');

    expect(replyBodyForInterpretation(body)).toBe('Falta info: mándame la foto de la placa');
  });

  test('un «De:» escrito a mano no es una cabecera y no corta nada', () => {
    // Sin la línea de fecha o destinatario debajo no es un bloque reenviado, y
    // cortar ahí se llevaría por delante la respuesta del Approver.
    const body = [
      'De: nuestro proveedor me confirman 20 semanas',
      'Mismos precios, Entrega: 20 semanas',
    ].join('\n');

    expect(replyBodyForInterpretation(body)).toContain('Entrega: 20 semanas');
  });

  test('corta en la firma canónica', () => {
    const body = ['Aprobado', '', '-- ', 'Juan Pérez', 'ZIEHL-ABEGG México'].join('\n');

    expect(replyBodyForInterpretation(body)).toBe('Aprobado');
  });

  test('conserva varias líneas de precios del Approver', () => {
    const body = [
      '162562: $3,100.50 USD',
      '999999: $1,200.00 USD',
      '',
      'El 5 ago 2026 ZIEHL-ABEGG escribió:',
      '> Hola equipo',
    ].join('\n');

    expect(replyBodyForInterpretation(body)).toBe('162562: $3,100.50 USD\n999999: $1,200.00 USD');
  });
});

describe('el relleno invisible', () => {
  test('los caracteres de ancho cero del preheader desaparecen', () => {
    // 955 de los 3117 caracteres de `REQ-BVR06L` eran esto, diluyendo la única
    // frase que llevaba la decisión.
    const padding = '​‌‍﻿⁠'.repeat(50);
    const body = `Aprobado${padding}`;

    expect(replyBodyForInterpretation(body)).toBe('Aprobado');
  });

  test('el guion suave dentro de una palabra no la parte', () => {
    expect(replyBodyForInterpretation('Descon­tinuado')).toBe('Descontinuado');
  });
});

describe('cuando el recorte se quedaría sin nada', () => {
  test('un cuerpo que es sólo cita se devuelve entero antes que vacío', () => {
    // Perder la decisión en silencio es el fallo que este ticket arregla:
    // clasificar de más es preferible a mandarle al modelo una cadena vacía.
    const body = ['> Hola equipo de ventas,', '> Responde: «Aprobado».'].join('\n');

    expect(replyBodyForInterpretation(body)).toContain('Aprobado');
  });

  test('un cuerpo vacío sigue siendo vacío', () => {
    expect(replyBodyForInterpretation('')).toBe('');
    expect(replyBodyForInterpretation('   \n  ')).toBe('');
  });
});
