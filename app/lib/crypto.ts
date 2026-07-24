// The Family Phrase never leaves this module: it is fed into PBKDF2 to
// derive a non-extractable AES-GCM key (for encrypting sync mutations)
// and, separately, hashed into the Room ID used to address the blind
// relay Worker. Neither the phrase nor the derived key is ever sent
// over the network.

const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 minimum for PBKDF2-SHA256
const KEY_DERIVATION_SALT = new TextEncoder().encode("first-bank-of-dad:key:v1");
const ROOM_ID_DOMAIN = "first-bank-of-dad:room:v1:";
const NAMED_ROOM_ID_DOMAIN = "first-bank-of-dad:room:named:v1:";
const PARENT_PIN_DOMAIN = "first-bank-of-dad:parent-pin:v1:";
const KID_PIN_DOMAIN = "first-bank-of-dad:kid-pin:v1:";
const IV_BYTES = 12;

function normalizePhrase(phrase: string): string {
  return phrase.trim();
}

async function importPhraseAsKeyMaterial(phrase: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalizePhrase(phrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
}

/** Derives the AES-GCM key used to encrypt/decrypt sync mutations. */
export async function deriveEncryptionKey(phrase: string): Promise<CryptoKey> {
  const keyMaterial = await importPhraseAsKeyMaterial(phrase);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: KEY_DERIVATION_SALT,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable: key material can't be read back out via exportKey
    ["encrypt", "decrypt"],
  );
}

/** Derives the Room ID used to address the relay Worker (never the phrase itself). */
export async function deriveRoomId(phrase: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ROOM_ID_DOMAIN + normalizePhrase(phrase)),
  );
  return toHex(digest);
}

/** Case-insensitive, whitespace-collapsed form of a friendly room name, so "Smith Family" and
 *  "smith  family" address the same channel. */
export function normalizeRoomName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Derives the wire-level Room ID from BOTH the Family Phrase and a friendly, human-typed room
 * name. The relay only accepts a 64-hex SHA-256 id, so the friendly name is never sent as-is;
 * folding the phrase in as well keeps the channel unguessable (a friendly name alone would let an
 * outsider squat/DoS the room), so a joining device needs the exact phrase AND room name to even
 * find the channel — neither is enough on its own. The phrase is still never transmitted.
 */
export async function deriveRoomIdFromPhraseAndName(phrase: string, roomName: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(NAMED_ROOM_ID_DOMAIN + normalizePhrase(phrase) + "::" + normalizeRoomName(roomName)),
  );
  return toHex(digest);
}

/**
 * Hashes the parent PIN used to gate switching a device from Kid View into
 * the Parent Command Center. This is a UI speed bump, not a security
 * boundary — anyone holding the Family Phrase already has the plaintext
 * state — so a plain domain-separated SHA-256 is enough.
 */
export async function hashPin(pin: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(PARENT_PIN_DOMAIN + pin.trim()),
  );
  return toHex(digest);
}

/**
 * Hashes a kid's own PIN, entered after email login to open their Kid View. Same "speed bump,
 * not a security boundary" caveat as hashPin — domain-separated so it can never collide with a
 * parent's PIN hash.
 */
export async function hashKidPin(pin: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(KID_PIN_DOMAIN + pin.trim()),
  );
  return toHex(digest);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encrypts any JSON-serializable value; output is a self-contained base64 string (iv + ciphertext). */
export async function encryptPayload(key: CryptoKey, data: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return toBase64(combined);
}

/** Reverses encryptPayload. Throws if the payload wasn't encrypted with this key (wrong phrase). */
export async function decryptPayload<T = unknown>(key: CryptoKey, payload: string): Promise<T> {
  const combined = fromBase64(payload);
  const iv = combined.slice(0, IV_BYTES);
  const ciphertext = combined.slice(IV_BYTES);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
