/**
 * La regla que decide si una identidad es Supervisor, sin entorno, para poder
 * probarse. Quién lee la lista es `supervisors.ts`; aquí sólo se compara.
 *
 * Cuenta únicamente un correo **verificado**: cualquiera puede registrarse en
 * Clerk con una dirección ajena, y sólo la verificación dice que es suya. Sin
 * claim de correo —la plantilla de Clerk que dejara de mandarlo— no hay a quién
 * comparar y la respuesta es no. Falla cerrado, nunca abierto.
 */

/** Lo único que hace falta de la identidad que firma Clerk. */
export type SupervisorCandidate = {
  email?: string;
  emailVerified?: boolean;
};

function normalize(address: string): string {
  return address.trim().toLowerCase();
}

export function isSupervisorIdentity(
  identity: SupervisorCandidate | null,
  supervisorAddresses: readonly string[]
): boolean {
  if (!identity || identity.emailVerified !== true || !identity.email) return false;

  const email = normalize(identity.email);
  if (email.length === 0) return false;

  return supervisorAddresses.some((address) => normalize(address) === email);
}
