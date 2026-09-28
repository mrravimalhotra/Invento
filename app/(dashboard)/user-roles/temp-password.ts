// Browser-side temporary password generator for the Add user / Reset password
// forms. Uses crypto.getRandomValues (not Math.random) and skips look-alike
// characters (0/O, 1/l/I) so the password is easy to read out or type.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function generateTemporaryPassword(length = 12): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
