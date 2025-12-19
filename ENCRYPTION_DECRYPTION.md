# Encryption & Decryption System - Documentation

## Overview

The Secret Guardian encryption system protects sensitive secrets when sharing or storing them. This document explains how it works and how to make it production-ready and more advanced.

## Current Implementation

### Architecture

The system uses **AES-256-CBC encryption** with:
- **Algorithm:** AES-256-CBC (Advanced Encryption Standard, 256-bit key, CBC mode)
- **Key Derivation:** SHA-256 hash of a fixed string
- **IV (Initialization Vector):** Random 16 bytes per encryption
- **Format:** `SG_ENCRYPTED:base64(iv:encrypted)`

### 1. Encryption for Sharing

**Location:** `src/utils.ts` - `encryptForSharing()`

**Current Implementation:**
```typescript
export function encryptForSharing(text: string): string {
  const algorithm = "aes-256-cbc";
  // Fixed key derived from app name
  const key = crypto
    .createHash("sha256")
    .update("SecretGuardian-Shared-Key-v1")
    .digest("hex");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, "hex"), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const combined = iv.toString("hex") + ":" + encrypted;
  return "SG_ENCRYPTED:" + Buffer.from(combined).toString("base64");
}
```

**How it works:**
1. Derives a 256-bit key from a fixed string using SHA-256
2. Generates a random 16-byte IV
3. Encrypts the text using AES-256-CBC
4. Combines IV and encrypted data
5. Base64 encodes the result
6. Prefixes with "SG_ENCRYPTED:"

**Strengths:**
- Uses industry-standard AES-256
- Random IV for each encryption (no pattern reuse)
- Simple format for sharing

**Critical Limitations:**
- **Fixed key** - same key for all users (security risk!)
- **No key management** - key is hardcoded
- **No authentication** - can't verify integrity
- **No key derivation** - uses simple hash
- **No key rotation** - can't update keys
- **No user-specific keys** - all users share same key

### 2. Decryption

**Location:** `src/utils.ts` - `decryptShared()`

**Current Implementation:**
```typescript
export function decryptShared(encryptedText: string): string | null {
  if (!encryptedText.startsWith("SG_ENCRYPTED:")) {
    return null;
  }
  
  try {
    const algorithm = "aes-256-cbc";
    const key = crypto
      .createHash("sha256")
      .update("SecretGuardian-Shared-Key-v1")
      .digest("hex");
    const base64Data = encryptedText.replace("SG_ENCRYPTED:", "");
    const combined = Buffer.from(base64Data, "base64").toString("utf8");
    const parts = combined.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, "hex"), iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Error decrypting shared secret:", error);
    return null;
  }
}
```

**How it works:**
1. Validates the "SG_ENCRYPTED:" prefix
2. Decodes base64 data
3. Extracts IV and encrypted data
4. Derives the same key
5. Decrypts using AES-256-CBC
6. Returns plaintext

**Limitations:**
- Same security issues as encryption
- No error recovery
- No integrity verification

## Security Issues in Current Implementation

### 1. Fixed Key Problem

**Issue:** All users share the same encryption key
```typescript
const key = crypto.createHash("sha256")
  .update("SecretGuardian-Shared-Key-v1")  // Same for everyone!
  .digest("hex");
```

**Risk:**
- If one user's encrypted data is compromised, all users' data is at risk
- No user-specific security
- Key is in source code (can be extracted)

**Impact:** **CRITICAL** - This is a major security vulnerability

### 2. No Key Management

**Issue:** No proper key storage or rotation

**Risk:**
- Can't revoke compromised keys
- Can't update encryption without breaking existing data
- No key versioning

### 3. No Authentication/Integrity

**Issue:** No way to verify data hasn't been tampered with

**Risk:**
- Encrypted data can be modified without detection
- No protection against tampering
- Can't verify authenticity

### 4. Weak Key Derivation

**Issue:** Uses simple SHA-256 hash instead of proper KDF

**Risk:**
- Vulnerable to rainbow table attacks
- No salt or iteration count
- Fast to compute (vulnerable to brute force)

### 5. No Encryption Metadata

**Issue:** No version, algorithm, or key ID in encrypted data

**Risk:**
- Can't upgrade encryption without breaking compatibility
- Can't support multiple algorithms
- Can't identify which key was used

## Advanced Improvements for Production

### 1. User-Specific Key Management

**Problem:** Fixed key for all users

**Solution:** Per-user or per-device keys

```typescript
import { generateKeyPair, createSign, createVerify } from 'crypto';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

interface KeyStore {
  userId: string;
  deviceId: string;
  masterKey: Buffer;
  keyVersion: number;
  createdAt: Date;
  lastRotated: Date;
}

class KeyManager {
  private keyStore: Map<string, KeyStore> = new Map();
  
  /**
   * Generate user-specific master key
   */
  async generateUserKey(userId: string, deviceId: string, password?: string): Promise<Buffer> {
    const keyId = `${userId}:${deviceId}`;
    
    if (password) {
      // Derive key from user password using scrypt (proper KDF)
      const salt = randomBytes(32);
      const key = await scryptAsync(password, salt, 32) as Buffer;
      
      // Store salt with key
      this.keyStore.set(keyId, {
        userId,
        deviceId,
        masterKey: key,
        keyVersion: 1,
        createdAt: new Date(),
        lastRotated: new Date(),
      });
      
      return key;
    } else {
      // Generate random key (stored securely)
      const key = randomBytes(32);
      
      this.keyStore.set(keyId, {
        userId,
        deviceId,
        masterKey: key,
        keyVersion: 1,
        createdAt: new Date(),
        lastRotated: new Date(),
      });
      
      // In production: Store encrypted in secure storage (Keychain, Credential Manager)
      await this.storeKeySecurely(keyId, key);
      
      return key;
    }
  }
  
  /**
   * Get user's encryption key
   */
  async getUserKey(userId: string, deviceId: string): Promise<Buffer> {
    const keyId = `${userId}:${deviceId}`;
    
    // Try memory cache first
    if (this.keyStore.has(keyId)) {
      return this.keyStore.get(keyId)!.masterKey;
    }
    
    // Load from secure storage
    const key = await this.loadKeySecurely(keyId);
    if (key) {
      this.keyStore.set(keyId, {
        userId,
        deviceId,
        masterKey: key,
        keyVersion: 1,
        createdAt: new Date(),
        lastRotated: new Date(),
      });
      return key;
    }
    
    // Generate new key if not found
    return await this.generateUserKey(userId, deviceId);
  }
  
  /**
   * Store key in secure system storage
   */
  private async storeKeySecurely(keyId: string, key: Buffer): Promise<void> {
    // macOS: Use Keychain
    if (process.platform === 'darwin') {
      const { exec } = require('child_process');
      const keyBase64 = key.toString('base64');
      exec(`security add-generic-password -a "${keyId}" -s "SecretGuardian" -w "${keyBase64}" -U`);
    }
    
    // Windows: Use Credential Manager
    // Linux: Use libsecret or encrypted file
    // ...
  }
  
  /**
   * Load key from secure system storage
   */
  private async loadKeySecurely(keyId: string): Promise<Buffer | null> {
    // macOS: Read from Keychain
    if (process.platform === 'darwin') {
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        exec(`security find-generic-password -a "${keyId}" -s "SecretGuardian" -w`, (error, stdout) => {
          if (error) {
            resolve(null);
          } else {
            resolve(Buffer.from(stdout.trim(), 'base64'));
          }
        });
      });
    }
    
    return null;
  }
}

const keyManager = new KeyManager();
```

### 2. Proper Key Derivation (PBKDF2/Argon2)

**Problem:** Simple SHA-256 hash

**Solution:** Use proper Key Derivation Functions

```typescript
import { pbkdf2, scrypt } from 'crypto';
import { promisify } from 'util';
import argon2 from 'argon2'; // npm install argon2

const pbkdf2Async = promisify(pbkdf2);
const scryptAsync = promisify(scrypt);

/**
 * Derive encryption key using PBKDF2 (Password-Based Key Derivation Function 2)
 */
async function deriveKeyPBKDF2(
  password: string,
  salt: Buffer,
  iterations: number = 100000
): Promise<Buffer> {
  return await pbkdf2Async(
    password,
    salt,
    iterations,
    32, // 32 bytes = 256 bits
    'sha256'
  ) as Buffer;
}

/**
 * Derive encryption key using Argon2 (modern, memory-hard KDF)
 * Recommended for new implementations
 */
async function deriveKeyArgon2(
  password: string,
  salt: Buffer
): Promise<Buffer> {
  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    salt: salt,
    hashLength: 32, // 32 bytes = 256 bits
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
  
  return Buffer.from(hash, 'hex');
}

/**
 * Derive encryption key using scrypt
 */
async function deriveKeyScrypt(
  password: string,
  salt: Buffer,
  cost: number = 16384
): Promise<Buffer> {
  return await scryptAsync(
    password,
    salt,
    32, // 32 bytes = 256 bits
    { N: cost, r: 8, p: 1 }
  ) as Buffer;
}

// Usage
async function encryptWithProperKDF(text: string, userPassword: string): Promise<string> {
  // 1. Generate random salt
  const salt = randomBytes(32);
  
  // 2. Derive key using Argon2 (best choice)
  const key = await deriveKeyArgon2(userPassword, salt);
  
  // 3. Generate IV
  const iv = randomBytes(16);
  
  // 4. Encrypt
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  // 5. Get authentication tag
  const authTag = cipher.getAuthTag();
  
  // 6. Format: version:salt:iv:authTag:encrypted (all base64)
  const version = 'v2';
  const combined = [
    version,
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
  
  return `SG_ENCRYPTED:${combined}`;
}
```

### 3. Authenticated Encryption (AEAD)

**Problem:** No integrity verification

**Solution:** Use AES-GCM (Galois/Counter Mode) instead of CBC

```typescript
/**
 * Encrypt with authenticated encryption (AES-256-GCM)
 */
async function encryptAuthenticated(text: string, key: Buffer): Promise<string> {
  const algorithm = 'aes-256-gcm';
  const iv = randomBytes(12); // GCM uses 12-byte IV (96 bits)
  
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  // Get authentication tag (integrity check)
  const authTag = cipher.getAuthTag();
  
  // Format: version:iv:authTag:encrypted
  const version = 'v2-gcm';
  const combined = [
    version,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
  
  return `SG_ENCRYPTED:${combined}`;
}

/**
 * Decrypt with authentication verification
 */
async function decryptAuthenticated(encryptedText: string, key: Buffer): Promise<string | null> {
  if (!encryptedText.startsWith('SG_ENCRYPTED:')) {
    return null;
  }
  
  try {
    const data = encryptedText.replace('SG_ENCRYPTED:', '');
    const parts = data.split(':');
    
    if (parts.length !== 4) {
      throw new Error('Invalid format');
    }
    
    const [version, ivBase64, authTagBase64, encryptedBase64] = parts;
    
    if (version !== 'v2-gcm') {
      throw new Error('Unsupported version');
    }
    
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    const encrypted = Buffer.from(encryptedBase64, 'base64');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    // Authentication failed - data was tampered with
    console.error('Decryption failed - possible tampering:', error);
    return null;
  }
}
```

**Benefits of AES-GCM:**
- **Authentication:** Detects tampering automatically
- **Performance:** Faster than CBC + HMAC
- **Security:** Recommended by NIST
- **Simplicity:** Single operation (encrypt + authenticate)

### 4. Key Rotation & Versioning

**Problem:** Can't update keys without breaking existing data

**Solution:** Support multiple key versions

```typescript
interface EncryptionMetadata {
  version: string;
  keyVersion: number;
  algorithm: string;
  timestamp: number;
}

class EncryptionManager {
  private keyVersions: Map<number, Buffer> = new Map();
  private currentKeyVersion: number = 1;
  
  /**
   * Encrypt with versioning
   */
  async encrypt(text: string, userId: string): Promise<string> {
    const key = await this.getCurrentKey(userId);
    const iv = randomBytes(12);
    
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    // Include metadata
    const metadata: EncryptionMetadata = {
      version: 'v3',
      keyVersion: this.currentKeyVersion,
      algorithm: 'aes-256-gcm',
      timestamp: Date.now(),
    };
    
    const combined = [
      JSON.stringify(metadata),
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
    
    return `SG_ENCRYPTED:${combined}`;
  }
  
  /**
   * Decrypt with version support
   */
  async decrypt(encryptedText: string, userId: string): Promise<string | null> {
    if (!encryptedText.startsWith('SG_ENCRYPTED:')) {
      return null;
    }
    
    try {
      const data = encryptedText.replace('SG_ENCRYPTED:', '');
      const parts = data.split(':');
      
      const metadata: EncryptionMetadata = JSON.parse(parts[0]);
      const iv = Buffer.from(parts[1], 'base64');
      const authTag = Buffer.from(parts[2], 'base64');
      const encrypted = Buffer.from(parts[3], 'base64');
      
      // Get key for the version used
      const key = await this.getKeyForVersion(userId, metadata.keyVersion);
      
      const decipher = crypto.createDecipheriv(metadata.algorithm, key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Decryption failed:', error);
      return null;
    }
  }
  
  /**
   * Rotate to new key version
   */
  async rotateKey(userId: string): Promise<void> {
    const oldVersion = this.currentKeyVersion;
    const newVersion = oldVersion + 1;
    
    // Generate new key
    const newKey = await this.generateUserKey(userId, newVersion);
    this.keyVersions.set(newVersion, newKey);
    
    // Keep old key for decryption
    // In production: Re-encrypt all data with new key in background
    
    this.currentKeyVersion = newVersion;
    
    console.log(`Key rotated: v${oldVersion} -> v${newVersion}`);
  }
  
  private async getKeyForVersion(userId: string, version: number): Promise<Buffer> {
    if (this.keyVersions.has(version)) {
      return this.keyVersions.get(version)!;
    }
    
    // Load from secure storage
    return await this.loadKeySecurely(userId, version);
  }
}
```

### 5. Hybrid Encryption (RSA + AES)

**Problem:** Sharing encrypted data requires shared keys

**Solution:** Use RSA for key exchange, AES for data

```typescript
import { generateKeyPair, publicEncrypt, privateDecrypt } from 'crypto';
import { promisify } from 'util';

const generateKeyPairAsync = promisify(generateKeyPair);

/**
 * Hybrid encryption: RSA for key exchange, AES for data
 */
class HybridEncryption {
  /**
   * Generate RSA key pair for user
   */
  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    
    return { publicKey, privateKey };
  }
  
  /**
   * Encrypt for specific recipient (using their public key)
   */
  async encryptForRecipient(text: string, recipientPublicKey: string): Promise<string> {
    // 1. Generate random AES key for this encryption
    const aesKey = randomBytes(32);
    const iv = randomBytes(12);
    
    // 2. Encrypt data with AES
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    // 3. Encrypt AES key with recipient's RSA public key
    const encryptedKey = publicEncrypt(
      {
        key: recipientPublicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      aesKey
    );
    
    // 4. Format: version:encryptedKey:iv:authTag:encrypted
    const combined = [
      'v4-hybrid',
      encryptedKey.toString('base64'),
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
    
    return `SG_ENCRYPTED:${combined}`;
  }
  
  /**
   * Decrypt using private key
   */
  async decryptWithPrivateKey(encryptedText: string, privateKey: string): Promise<string | null> {
    if (!encryptedText.startsWith('SG_ENCRYPTED:')) {
      return null;
    }
    
    try {
      const data = encryptedText.replace('SG_ENCRYPTED:', '');
      const parts = data.split(':');
      
      if (parts[0] !== 'v4-hybrid') {
        throw new Error('Unsupported version');
      }
      
      const encryptedKey = Buffer.from(parts[1], 'base64');
      const iv = Buffer.from(parts[2], 'base64');
      const authTag = Buffer.from(parts[3], 'base64');
      const encrypted = Buffer.from(parts[4], 'base64');
      
      // 1. Decrypt AES key with private key
      const aesKey = privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        encryptedKey
      );
      
      // 2. Decrypt data with AES
      const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Decryption failed:', error);
      return null;
    }
  }
}
```

**Benefits:**
- **Secure sharing:** Each recipient needs their own private key
- **Forward secrecy:** Each encryption uses unique AES key
- **Scalability:** Can encrypt for multiple recipients

### 6. Secure Key Storage

**Problem:** Keys stored in memory or plain files

**Solution:** Use system keychains

```typescript
import * as keytar from 'keytar'; // npm install keytar

class SecureKeyStorage {
  private serviceName = 'SecretGuardian';
  
  /**
   * Store key securely in system keychain
   */
  async storeKey(keyId: string, key: Buffer): Promise<void> {
    // macOS: Keychain
    // Windows: Credential Manager
    // Linux: libsecret
    await keytar.setPassword(this.serviceName, keyId, key.toString('base64'));
  }
  
  /**
   * Retrieve key from system keychain
   */
  async getKey(keyId: string): Promise<Buffer | null> {
    const keyBase64 = await keytar.getPassword(this.serviceName, keyId);
    if (!keyBase64) return null;
    return Buffer.from(keyBase64, 'base64');
  }
  
  /**
   * Delete key from keychain
   */
  async deleteKey(keyId: string): Promise<void> {
    await keytar.deletePassword(this.serviceName, keyId);
  }
  
  /**
   * List all stored keys
   */
  async listKeys(): Promise<string[]> {
    return await keytar.findCredentials(this.serviceName);
  }
}
```

### 7. Encryption Format with Metadata

**Current:** Basic format

**Improved:** Rich metadata format

```typescript
interface EncryptionFormat {
  version: string;           // Format version
  algorithm: string;         // Encryption algorithm
  keyVersion: number;        // Key version used
  timestamp: number;         // Encryption time
  userId?: string;           // User ID (optional)
  deviceId?: string;         // Device ID (optional)
  metadata?: Record<string, any>; // Additional metadata
}

function createEncryptionFormat(
  algorithm: string,
  keyVersion: number,
  userId?: string
): EncryptionFormat {
  return {
    version: 'v3',
    algorithm,
    keyVersion,
    timestamp: Date.now(),
    userId,
    deviceId: getDeviceId(),
    metadata: {
      appVersion: getAppVersion(),
      platform: process.platform,
    },
  };
}

function serializeEncryption(data: {
  format: EncryptionFormat;
  iv: Buffer;
  authTag: Buffer;
  encrypted: Buffer;
}): string {
  const parts = [
    JSON.stringify(data.format),
    data.iv.toString('base64'),
    data.authTag.toString('base64'),
    data.encrypted.toString('base64'),
  ];
  
  return `SG_ENCRYPTED:${parts.join(':')}`;
}

function deserializeEncryption(encryptedText: string): {
  format: EncryptionFormat;
  iv: Buffer;
  authTag: Buffer;
  encrypted: Buffer;
} | null {
  if (!encryptedText.startsWith('SG_ENCRYPTED:')) {
    return null;
  }
  
  try {
    const data = encryptedText.replace('SG_ENCRYPTED:', '');
    const parts = data.split(':');
    
    if (parts.length < 4) {
      throw new Error('Invalid format');
    }
    
    const format: EncryptionFormat = JSON.parse(parts[0]);
    const iv = Buffer.from(parts[1], 'base64');
    const authTag = Buffer.from(parts[2], 'base64');
    const encrypted = Buffer.from(parts[3], 'base64');
    
    return { format, iv, authTag, encrypted };
  } catch (error) {
    console.error('Deserialization failed:', error);
    return null;
  }
}
```

### 8. Performance Optimization

**Current:** Synchronous operations

**Improved:** Async/optimized operations

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { promisify } from 'util';

// Use worker threads for heavy encryption
import { Worker } from 'worker_threads';

class OptimizedEncryption {
  private workerPool: Worker[] = [];
  private maxWorkers = 4;
  
  /**
   * Encrypt in worker thread (non-blocking)
   */
  async encryptAsync(text: string, key: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const worker = this.getWorker();
      
      worker.once('message', (result) => {
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result.encrypted);
        }
        this.returnWorker(worker);
      });
      
      worker.postMessage({ type: 'encrypt', text, key: key.toString('base64') });
    });
  }
  
  /**
   * Batch encryption for multiple texts
   */
  async encryptBatch(texts: string[], key: Buffer): Promise<string[]> {
    return Promise.all(texts.map(text => this.encryptAsync(text, key)));
  }
  
  /**
   * Stream encryption for large files
   */
  createEncryptionStream(key: Buffer): NodeJS.ReadWriteStream {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    
    // Create transform stream
    const { Transform } = require('stream');
    
    return new Transform({
      transform(chunk, encoding, callback) {
        const encrypted = cipher.update(chunk);
        callback(null, encrypted);
      },
      flush(callback) {
        const final = cipher.final();
        const authTag = cipher.getAuthTag();
        // Append IV, authTag, and final chunk
        callback(null, Buffer.concat([iv, authTag, final]));
      },
    });
  }
}
```

## Production-Ready Implementation

### Complete Example

```typescript
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import * as keytar from 'keytar';
import argon2 from 'argon2';

const scryptAsync = promisify(scrypt);

interface EncryptionConfig {
  algorithm: 'aes-256-gcm';
  keyDerivation: 'argon2' | 'scrypt' | 'pbkdf2';
  keyRotationDays: number;
  maxKeyVersions: number;
}

class ProductionEncryption {
  private config: EncryptionConfig = {
    algorithm: 'aes-256-gcm',
    keyDerivation: 'argon2',
    keyRotationDays: 90,
    maxKeyVersions: 3,
  };
  
  /**
   * Initialize encryption for user
   */
  async initialize(userId: string, password?: string): Promise<void> {
    const keyId = `encryption_key:${userId}`;
    
    // Check if key exists
    let key = await keytar.getPassword('SecretGuardian', keyId);
    
    if (!key) {
      // Generate new key
      if (password) {
        // Derive from password
        const salt = randomBytes(32);
        key = (await argon2.hash(password, {
          type: argon2.argon2id,
          salt,
          hashLength: 32,
        })).toString('base64');
        
        // Store salt separately
        await keytar.setPassword('SecretGuardian', `${keyId}:salt`, salt.toString('base64'));
      } else {
        // Generate random key
        key = randomBytes(32).toString('base64');
      }
      
      await keytar.setPassword('SecretGuardian', keyId, key);
      await keytar.setPassword('SecretGuardian', `${keyId}:version`, '1');
      await keytar.setPassword('SecretGuardian', `${keyId}:created`, Date.now().toString());
    }
  }
  
  /**
   * Encrypt with production-grade security
   */
  async encrypt(text: string, userId: string): Promise<string> {
    const keyId = `encryption_key:${userId}`;
    const keyBase64 = await keytar.getPassword('SecretGuardian', keyId);
    
    if (!keyBase64) {
      throw new Error('Encryption key not found. Please initialize encryption.');
    }
    
    const key = Buffer.from(keyBase64, 'base64');
    const iv = randomBytes(12); // GCM uses 12-byte IV
    const cipher = createCipheriv(this.config.algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    const version = await keytar.getPassword('SecretGuardian', `${keyId}:version`) || '1';
    const timestamp = Date.now();
    
    const format = {
      version: 'v3',
      algorithm: this.config.algorithm,
      keyVersion: parseInt(version),
      timestamp,
      userId,
    };
    
    const combined = [
      JSON.stringify(format),
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
    
    return `SG_ENCRYPTED:${combined}`;
  }
  
  /**
   * Decrypt with authentication
   */
  async decrypt(encryptedText: string, userId: string): Promise<string | null> {
    if (!encryptedText.startsWith('SG_ENCRYPTED:')) {
      return null;
    }
    
    try {
      const data = encryptedText.replace('SG_ENCRYPTED:', '');
      const parts = data.split(':');
      
      if (parts.length < 4) {
        throw new Error('Invalid format');
      }
      
      const format = JSON.parse(parts[0]);
      const iv = Buffer.from(parts[1], 'base64');
      const authTag = Buffer.from(parts[2], 'base64');
      const encrypted = Buffer.from(parts[3], 'base64');
      
      // Get key for the version used
      const keyId = `encryption_key:${userId}`;
      const keyVersion = format.keyVersion.toString();
      const keyBase64 = await keytar.getPassword('SecretGuardian', `${keyId}:v${keyVersion}`) ||
                        await keytar.getPassword('SecretGuardian', keyId);
      
      if (!keyBase64) {
        throw new Error('Encryption key not found');
      }
      
      const key = Buffer.from(keyBase64, 'base64');
      const decipher = createDecipheriv(format.algorithm, key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      // Authentication failed or other error
      console.error('Decryption failed:', error);
      return null;
    }
  }
  
  /**
   * Rotate encryption key
   */
  async rotateKey(userId: string): Promise<void> {
    const keyId = `encryption_key:${userId}`;
    const currentVersion = await keytar.getPassword('SecretGuardian', `${keyId}:version`) || '1';
    const newVersion = (parseInt(currentVersion) + 1).toString();
    
    // Generate new key
    const newKey = randomBytes(32);
    
    // Store new key with version
    await keytar.setPassword('SecretGuardian', `${keyId}:v${newVersion}`, newKey.toString('base64'));
    await keytar.setPassword('SecretGuardian', `${keyId}:version`, newVersion);
    await keytar.setPassword('SecretGuardian', `${keyId}:rotated`, Date.now().toString());
    
    // Update default key
    await keytar.setPassword('SecretGuardian', keyId, newKey.toString('base64'));
    
    console.log(`Key rotated: v${currentVersion} -> v${newVersion}`);
  }
}

// Export singleton
export const encryption = new ProductionEncryption();
```

## Migration Strategy

### Phase 1: Fix Critical Issues (Week 1)
1. Replace fixed key with user-specific keys
2. Implement proper key storage (keytar)
3. Add authenticated encryption (AES-GCM)

### Phase 2: Enhance Security (Week 2-3)
1. Implement proper KDF (Argon2)
2. Add key versioning
3. Add encryption metadata

### Phase 3: Advanced Features (Month 2)
1. Key rotation
2. Hybrid encryption for sharing
3. Performance optimization

### Phase 4: Production Hardening (Month 3)
1. Audit logging
2. Key recovery mechanisms
3. Compliance features (GDPR, etc.)

## Security Best Practices

1. **Never store keys in code** - Use system keychains
2. **Use authenticated encryption** - Always use AES-GCM or similar
3. **Rotate keys regularly** - Implement key rotation policy
4. **Use proper KDF** - Argon2 or scrypt, not simple hash
5. **Validate all inputs** - Sanitize before encryption
6. **Log security events** - Audit encryption/decryption operations
7. **Handle errors securely** - Don't leak information in errors
8. **Use constant-time operations** - Prevent timing attacks
9. **Secure key transmission** - Use TLS for key exchange
10. **Regular security audits** - Review encryption implementation

## Recommended Libraries

1. **keytar** - Secure key storage (Keychain/Credential Manager)
2. **argon2** - Modern password hashing/KDF
3. **node-forge** - Additional crypto primitives
4. **tweetnacl** - High-level crypto library
5. **libsodium** - Modern crypto library

## Conclusion

The current encryption implementation has **critical security vulnerabilities** that must be fixed before production use:

1. **CRITICAL:** Replace fixed key with user-specific keys
2. **CRITICAL:** Use authenticated encryption (AES-GCM)
3. **HIGH:** Implement proper key derivation (Argon2)
4. **HIGH:** Secure key storage (system keychains)
5. **MEDIUM:** Add key versioning and rotation
6. **MEDIUM:** Add encryption metadata

Following these improvements will transform the basic encryption into a production-ready, enterprise-grade system.
