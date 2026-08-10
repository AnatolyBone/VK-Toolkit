const MAGIC = new TextEncoder().encode('VKTENC01');
const ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const HEADER_BYTES = MAGIC.length + 4 + SALT_BYTES + IV_BYTES;

export async function encryptBytes(data, password) {
  if (!password) throw new Error('Пароль не задан');
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  const output = new Uint8Array(HEADER_BYTES + cipher.length);
  output.set(MAGIC, 0);
  new DataView(output.buffer).setUint32(MAGIC.length, ITERATIONS, true);
  output.set(salt, MAGIC.length + 4);
  output.set(iv, MAGIC.length + 4 + SALT_BYTES);
  output.set(cipher, HEADER_BYTES);
  return output;
}

export async function decryptBytes(data, password) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!isEncryptedArchive(bytes)) throw new Error('Это не зашифрованный архив VK Toolkit');
  const iterations = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(MAGIC.length, true);
  if (iterations !== ITERATIONS) throw new Error('Неподдерживаемая версия шифрования');
  const salt = bytes.slice(MAGIC.length + 4, MAGIC.length + 4 + SALT_BYTES);
  const iv = bytes.slice(MAGIC.length + 4 + SALT_BYTES, HEADER_BYTES);
  const key = await deriveKey(password, salt, ['decrypt']);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes.slice(HEADER_BYTES)));
  } catch { throw new Error('Неверный пароль или архив повреждён'); }
}

export function isEncryptedArchive(bytes) {
  return bytes?.length > HEADER_BYTES && MAGIC.every((byte, index) => bytes[index] === byte);
}

async function deriveKey(password, salt, usages) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, material, { name: 'AES-GCM', length: 256 }, false, usages);
}
