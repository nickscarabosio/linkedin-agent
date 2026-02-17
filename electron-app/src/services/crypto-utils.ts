import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

/**
 * Decrypt AES-256-GCM encrypted credentials.
 * @param encrypted - hex-encoded ciphertext
 * @param ivHex - hex-encoded IV
 * @param authTagHex - hex-encoded auth tag
 * @param keyHex - 64-char hex string (32 bytes)
 * @returns parsed credentials object
 */
export function decryptCredentials(
  encrypted: string,
  ivHex: string,
  authTagHex: string,
  keyHex: string
): { username: string; password: string } {
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}
