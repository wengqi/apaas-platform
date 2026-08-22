/**
 * AES-256-GCM 加解密工具 — 用于连接器凭证的加密存储。
 *
 * 密钥从环境变量 CONNECTOR_ENCRYPTION_KEY 读取（32 字节 hex）。
 * 加密结果格式：base64(iv) : base64(authTag) : base64(ciphertext)
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey(): Buffer {
  const hex = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('CONNECTOR_ENCRYPTION_KEY 必须是 32 字节 hex 字符串（64 字符）');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * 加密 JSON 对象，返回 base64 编码的字符串。
 */
export function encryptJson(data: unknown): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * 解密 base64 字符串，返回原始 JSON 对象。
 */
export function decryptJson<T = unknown>(encrypted: string): T {
  const key = getKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('加密数据格式无效');
  }
  const iv = Buffer.from(parts[0]!, 'base64');
  const authTag = Buffer.from(parts[1]!, 'base64');
  const ciphertext = Buffer.from(parts[2]!, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}
