import CryptoJS from 'crypto-js'

export type WordArray = CryptoJS.lib.WordArray

export type SymmetricAlg = 'AES' | 'DES' | 'TripleDES' | 'Rabbit' | 'RC4' | 'RC4Drop'
export type HashAlg =
  | 'MD5'
  | 'SHA1'
  | 'SHA224'
  | 'SHA256'
  | 'SHA384'
  | 'SHA512'
  | 'RIPEMD160'

export type Encoder = 'Utf8' | 'Hex' | 'Base64' | 'Latin1' | 'Utf16' | 'Utf16LE' | 'Utf16BE'
export type CipherMode = 'CBC' | 'CFB' | 'CTR' | 'OFB' | 'ECB'
export type CipherPadding =
  | 'Pkcs7'
  | 'Iso97971'
  | 'AnsiX923'
  | 'Iso10126'
  | 'ZeroPadding'
  | 'NoPadding'

export type KeyType = 'passphrase' | 'raw'
export type EncryptOutput = 'openssl' | 'json'

export interface CryptoPackV1 {
  v: 1
  alg: SymmetricAlg
  kt: KeyType
  ct: string
  iv?: string
  s?: string
  m?: CipherMode
  p?: CipherPadding
}

export interface CryptoSuiteOptions {
  alg?: SymmetricAlg
  key?: string | WordArray
  keyType?: KeyType
  keyEncoding?: Encoder
  iv?: string | WordArray
  ivEncoding?: Encoder
  mode?: CipherMode
  padding?: CipherPadding
  output?: EncryptOutput
  ivBytes?: number
}

export interface KdfOptions {
  keySize?: number
  iterations?: number
  hasher?: HashAlg
  outputEncoding?: Encoder
}

export class CryptoSuite {
  private defaults: Required<Omit<CryptoSuiteOptions, 'key' | 'iv'>> & {
    key?: string | WordArray
    iv?: string | WordArray
  }

  constructor(options: CryptoSuiteOptions = {}) {
    this.defaults = {
      alg: options.alg ?? 'AES',
      key: options.key,
      keyType: options.keyType ?? (typeof options.key === 'string' ? 'passphrase' : 'raw'),
      keyEncoding: options.keyEncoding ?? 'Utf8',
      iv: options.iv,
      ivEncoding: options.ivEncoding ?? 'Hex',
      mode: options.mode ?? 'CBC',
      padding: options.padding ?? 'Pkcs7',
      output: options.output ?? 'openssl',
      ivBytes: options.ivBytes ?? 16,
    }
  }

  public setDefaults(patch: CryptoSuiteOptions): this {
    this.defaults = {
      ...this.defaults,
      ...patch,
      keyType: patch.keyType ?? (typeof (patch.key ?? this.defaults.key) === 'string' ? 'passphrase' : 'raw'),
      keyEncoding: patch.keyEncoding ?? this.defaults.keyEncoding,
      ivEncoding: patch.ivEncoding ?? this.defaults.ivEncoding,
    }
    return this
  }

  public encrypt(plainText: string, options: CryptoSuiteOptions = {}): string {
    const resolved = this.resolveOptions(options)
    const cipher = CryptoSuite.getCipher(resolved.alg)
    const mode = CryptoSuite.getMode(resolved.mode)
    const padding = CryptoSuite.getPadding(resolved.padding)

    if (resolved.keyType === 'passphrase') {
      const passphrase = this.requirePassphrase(resolved.key)
      const encrypted = cipher.encrypt(plainText, passphrase, { mode, padding })
      if (resolved.output === 'openssl') return encrypted.toString()
      return CryptoSuite.pack(encrypted, {
        alg: resolved.alg,
        keyType: 'passphrase',
        mode: resolved.mode,
        padding: resolved.padding,
      })
    }

    const key = CryptoSuite.asWordArray(resolved.key, resolved.keyEncoding)
    const ivProvided = resolved.iv != null
    const iv = ivProvided
      ? CryptoSuite.asWordArray(resolved.iv, resolved.ivEncoding)
      : resolved.output === 'json'
        ? CryptoJS.lib.WordArray.random(resolved.ivBytes)
        : null

    if (!iv) {
      throw new Error('[CryptoSuite] iv is required when keyType=raw and output=openssl')
    }

    const encrypted = cipher.encrypt(plainText, key, { iv, mode, padding })
    if (resolved.output === 'openssl') return encrypted.toString()
    return CryptoSuite.pack(encrypted, {
      alg: resolved.alg,
      keyType: 'raw',
      mode: resolved.mode,
      padding: resolved.padding,
    })
  }

  public decrypt(cipherText: string, options: CryptoSuiteOptions = {}): string {
    const pack = CryptoSuite.maybeUnpack(cipherText)
    const resolved = this.resolveOptions({ ...options, alg: pack?.alg ?? options.alg })
    const cipher = CryptoSuite.getCipher(resolved.alg)
    const mode = CryptoSuite.getMode(pack?.m ?? resolved.mode)
    const padding = CryptoSuite.getPadding(pack?.p ?? resolved.padding)

    if (!pack) {
      if (resolved.keyType === 'passphrase') {
        const passphrase = this.requirePassphrase(resolved.key)
        return cipher.decrypt(cipherText, passphrase, { mode, padding }).toString(CryptoJS.enc.Utf8)
      }

      const key = CryptoSuite.asWordArray(resolved.key, resolved.keyEncoding)
      const iv = CryptoSuite.asWordArray(resolved.iv, resolved.ivEncoding)
      if (!iv) throw new Error('[CryptoSuite] Missing iv for raw-key decrypt')
      return cipher.decrypt(cipherText, key, { iv, mode, padding }).toString(CryptoJS.enc.Utf8)
    }

    if (pack.kt === 'passphrase') {
      const passphrase = this.requirePassphrase(resolved.key)
      const params = CryptoSuite.cipherParamsFromPack(pack)
      return cipher.decrypt(params, passphrase, { mode, padding }).toString(CryptoJS.enc.Utf8)
    }

    const key = CryptoSuite.asWordArray(resolved.key, resolved.keyEncoding)
    const params = CryptoSuite.cipherParamsFromPack(pack)
    return cipher.decrypt(params, key, { mode, padding }).toString(CryptoJS.enc.Utf8)
  }

  public encryptJson<T>(value: T, options: CryptoSuiteOptions = {}): string {
    return this.encrypt(JSON.stringify(value), options)
  }

  public decryptJson<T>(cipherText: string, options: CryptoSuiteOptions = {}): T {
    return JSON.parse(this.decrypt(cipherText, options)) as T
  }

  public hash(text: string, alg: HashAlg = 'SHA256', outputEncoding: Encoder = 'Hex'): string {
    const hasher = CryptoSuite.getHasher(alg)
    return hasher(text).toString(CryptoSuite.getEncoder(outputEncoding))
  }

  public hmac(
    text: string,
    secret: string | WordArray,
    alg: HashAlg = 'SHA256',
    outputEncoding: Encoder = 'Hex',
    secretEncoding: Encoder = 'Utf8',
  ): string {
    const key = CryptoSuite.asWordArray(secret, secretEncoding)
    const hmacFn = CryptoSuite.getHmac(alg)
    return hmacFn(text, key).toString(CryptoSuite.getEncoder(outputEncoding))
  }

  public pbkdf2(
    password: string,
    salt: string | WordArray,
    options: KdfOptions = {},
  ): string {
    const keySize = options.keySize ?? 256 / 32
    const iterations = options.iterations ?? 10000
    const hasher = CryptoSuite.getHasher(options.hasher ?? 'SHA256')
    const saltWA = CryptoSuite.asWordArray(salt, 'Hex')
    const derived = CryptoJS.PBKDF2(password, saltWA, { keySize, iterations, hasher: hasher as any })
    return derived.toString(CryptoSuite.getEncoder(options.outputEncoding ?? 'Hex'))
  }

  public evpKdf(
    password: string,
    salt: string | WordArray,
    options: KdfOptions = {},
  ): string {
    const keySize = options.keySize ?? 256 / 32
    const iterations = options.iterations ?? 1
    const hasher = CryptoSuite.getHasher(options.hasher ?? 'MD5')
    const saltWA = CryptoSuite.asWordArray(salt, 'Hex')
    const derived = CryptoJS.EvpKDF(password, saltWA, { keySize, iterations, hasher: hasher as any })
    return derived.toString(CryptoSuite.getEncoder(options.outputEncoding ?? 'Hex'))
  }

  public random(bytes = 16): WordArray {
    return CryptoJS.lib.WordArray.random(bytes)
  }

  public randomHex(bytes = 16): string {
    return CryptoJS.lib.WordArray.random(bytes).toString(CryptoJS.enc.Hex)
  }

  public randomBase64(bytes = 16): string {
    return CryptoJS.lib.WordArray.random(bytes).toString(CryptoJS.enc.Base64)
  }

  public base64UrlEncode(input: string | WordArray, inputEncoding: Encoder = 'Utf8'): string {
    const wa = CryptoSuite.asWordArray(input, inputEncoding)
    return CryptoSuite.toBase64Url(wa.toString(CryptoJS.enc.Base64))
  }

  public base64UrlDecode(base64Url: string, outputEncoding: Encoder = 'Utf8'): string {
    const b64 = CryptoSuite.fromBase64Url(base64Url)
    const wa = CryptoJS.enc.Base64.parse(b64)
    return wa.toString(CryptoSuite.getEncoder(outputEncoding))
  }

  public static asWordArray(value: string | WordArray | undefined, encoding: Encoder = 'Utf8'): WordArray {
    if (value == null) throw new Error('[CryptoSuite] Missing required value')
    if (typeof value !== 'string') return value
    return CryptoSuite.getEncoder(encoding).parse(value)
  }

  public static pack(
    params: CryptoJS.lib.CipherParams,
    meta: { alg: SymmetricAlg; keyType: KeyType; mode?: CipherMode; padding?: CipherPadding },
  ): string {
    const ct = params.ciphertext.toString(CryptoJS.enc.Base64)
    const iv = params.iv?.toString(CryptoJS.enc.Hex)
    const s = params.salt?.toString(CryptoJS.enc.Hex)
    const pack: CryptoPackV1 = {
      v: 1,
      alg: meta.alg,
      kt: meta.keyType,
      ct,
      ...(iv ? { iv } : null),
      ...(s ? { s } : null),
      ...(meta.mode ? { m: meta.mode } : null),
      ...(meta.padding ? { p: meta.padding } : null),
    }
    return JSON.stringify(pack)
  }

  public static maybeUnpack(input: string): CryptoPackV1 | null {
    if (!input || input[0] !== '{') return null
    try {
      const data = JSON.parse(input) as Partial<CryptoPackV1>
      if (data?.v !== 1) return null
      if (!data.alg || !data.kt || !data.ct) return null
      return data as CryptoPackV1
    } catch {
      return null
    }
  }

  private resolveOptions(options: CryptoSuiteOptions): Required<Omit<CryptoSuiteOptions, 'key' | 'iv'>> & {
    key?: string | WordArray
    iv?: string | WordArray
  } {
    const key = options.key ?? this.defaults.key
    const keyType = options.keyType ?? (typeof key === 'string' ? 'passphrase' : this.defaults.keyType)
    return {
      ...this.defaults,
      ...options,
      key,
      keyType,
      keyEncoding: options.keyEncoding ?? this.defaults.keyEncoding,
      ivEncoding: options.ivEncoding ?? this.defaults.ivEncoding,
    }
  }

  private requirePassphrase(key: string | WordArray | undefined): string {
    if (typeof key !== 'string' || !key) {
      throw new Error('[CryptoSuite] key must be a non-empty string when keyType=passphrase')
    }
    return key
  }

  private static cipherParamsFromPack(pack: CryptoPackV1): CryptoJS.lib.CipherParams {
    const ciphertext = CryptoJS.enc.Base64.parse(pack.ct)
    const iv = pack.iv ? CryptoJS.enc.Hex.parse(pack.iv) : undefined
    const salt = pack.s ? CryptoJS.enc.Hex.parse(pack.s) : undefined
    return CryptoJS.lib.CipherParams.create({ ciphertext, iv, salt })
  }

  private static getCipher(alg: SymmetricAlg) {
    const cipher = (CryptoJS as any)[alg]
    if (!cipher?.encrypt || !cipher?.decrypt) throw new Error(`[CryptoSuite] Unsupported cipher: ${alg}`)
    return cipher as {
      encrypt: (message: string, key: any, options?: any) => CryptoJS.lib.CipherParams
      decrypt: (cipherText: any, key: any, options?: any) => WordArray
    }
  }

  private static getHasher(alg: HashAlg) {
    const hasher = (CryptoJS as any)[alg]
    if (typeof hasher !== 'function') throw new Error(`[CryptoSuite] Unsupported hash: ${alg}`)
    return hasher as (message: string) => WordArray
  }

  private static getHmac(alg: HashAlg) {
    const map: Record<HashAlg, (message: string, key: any) => WordArray> = {
      MD5: CryptoJS.HmacMD5,
      SHA1: CryptoJS.HmacSHA1,
      SHA224: CryptoJS.HmacSHA224,
      SHA256: CryptoJS.HmacSHA256,
      SHA384: CryptoJS.HmacSHA384,
      SHA512: CryptoJS.HmacSHA512,
      RIPEMD160: CryptoJS.HmacRIPEMD160,
    }
    const fn = map[alg]
    if (typeof fn !== 'function') throw new Error(`[CryptoSuite] Unsupported hmac: ${alg}`)
    return fn
  }

  private static getEncoder(name: Encoder) {
    const enc = (CryptoJS.enc as any)[name]
    if (!enc?.parse || !enc?.stringify) throw new Error(`[CryptoSuite] Unsupported encoder: ${name}`)
    return enc as { parse: (s: string) => WordArray; stringify: (w: WordArray) => string }
  }

  private static getMode(name: CipherMode) {
    const mode = (CryptoJS.mode as any)[name]
    if (!mode) throw new Error(`[CryptoSuite] Unsupported mode: ${name}`)
    return mode
  }

  private static getPadding(name: CipherPadding) {
    const pad = (CryptoJS.pad as any)[name]
    if (!pad) throw new Error(`[CryptoSuite] Unsupported padding: ${name}`)
    return pad
  }

  private static toBase64Url(base64: string): string {
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  }

  private static fromBase64Url(base64Url: string): string {
    const b64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4
    return pad ? b64 + '='.repeat(4 - pad) : b64
  }
}

export const createCryptoSuite = (options: CryptoSuiteOptions = {}) => new CryptoSuite(options)

export const crypto = new CryptoSuite()

export { CryptoJS }
