import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

/**
 * Encrypt plaintext with AES-256-GCM.
 * @param plaintext - text to encrypt
 * @param keyHex - 64-char hex string (32 bytes)
 * @returns { encrypted, iv, authTag } all as hex strings
 */
export function encrypt(
  plaintext: string,
  keyHex: string
): { encrypted: string; iv: string; authTag: string } {
  const key = Buffer.from(keyHex, "hex");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  return {
    encrypted,
    iv: iv.toString("hex"),
    authTag,
  };
}

/**
 * Decrypt ciphertext with AES-256-GCM.
 * @param encrypted - hex-encoded ciphertext
 * @param ivHex - hex-encoded IV
 * @param authTagHex - hex-encoded auth tag
 * @param keyHex - 64-char hex string (32 bytes)
 * @returns decrypted plaintext
 */
export function decrypt(
  encrypted: string,
  ivHex: string,
  authTagHex: string,
  keyHex: string
): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
