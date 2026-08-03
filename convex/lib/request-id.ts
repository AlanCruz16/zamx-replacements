/**
 * El identificador que el Customer ve y que el Approver cita en el asunto de su
 * respuesta. Es lo único que enlaza un correo entrante con una Replacement
 * Request, así que dos requests no pueden compartirlo: `by_request_id` resuelve
 * con `.first()`, y una colisión encaminaría en silencio la respuesta de un
 * Approver a la Replacement Request equivocada.
 *
 * El código no confiere autoridad — conocerlo no basta para mover nada. La
 * autorización vive en la lista de Approvers configurada.
 */

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CODE_LENGTH = 6;

/**
 * Cuántos códigos se intentan antes de rendirse. 36^6 son dos mil millones de
 * valores: agotar ocho intentos significa que algo va mal en el sorteo, no que
 * haya mala suerte, y rendirse es mejor que girar para siempre.
 */
const MAX_ATTEMPTS = 8;

/** Un código `REQ-XXXXXX`, sin comprobar unicidad. */
function generateRequestId(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `REQ-${code}`;
}

/**
 * Un código libre. `isTaken` consulta el índice `by_request_id`: quién sabe si
 * un código está tomado es la base de datos, pero cuántas veces se reintenta es
 * política de este módulo, y las dos cosas cambian juntas.
 */
export async function allocateRequestId(
  isTaken: (requestId: string) => Promise<boolean>
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const requestId = generateRequestId();
    if (!(await isTaken(requestId))) return requestId;
  }

  throw new Error('No se pudo generar un identificador de Replacement Request libre');
}
