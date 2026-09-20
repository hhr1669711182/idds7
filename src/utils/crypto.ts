import type { CryptoSuiteOptions, Encoder, HashAlg, KdfOptions, SymmetricAlg, WordArray } from '@/plugins/crypto'
import { CryptoSuite } from '@/plugins/crypto'

type SuiteKey = string

const suiteCache = new Map<SuiteKey, CryptoSuite>()

const stableStringify = (obj: any) => {
  if (!obj || typeof obj !== 'object') return String(obj)
  const keys = Object.keys(obj).sort()
  const out: Record<string, any> = {}
  for (const k of keys) out[k] = obj[k]
  return JSON.stringify(out)
}

const getSuite = (secretKey: string, options: Omit<CryptoSuiteOptions, 'key' | 'keyType'> = {}) => {
  const k = `${secretKey}::${stableStringify(options)}`
  const cached = suiteCache.get(k)
  if (cached) return cached
  const suite = new CryptoSuite({
    alg: 'AES',
    output: 'openssl',
    ...options,
    key: secretKey,
    keyType: 'passphrase',
  })
  suiteCache.set(k, suite)
  return suite
}

export const encryptText = (plainText: string, secretKey: string, options?: Omit<CryptoSuiteOptions, 'key' | 'keyType'>) =>
  getSuite(secretKey, options).encrypt(plainText)

export const decryptText = (cipherText: string, secretKey: string, options?: Omit<CryptoSuiteOptions, 'key' | 'keyType'>) =>
  getSuite(secretKey, options).decrypt(cipherText)

export const encryptJson = <T>(value: T, secretKey: string, options?: Omit<CryptoSuiteOptions, 'key' | 'keyType'>) =>
  getSuite(secretKey, options).encryptJson(value)

export const decryptJson = <T>(cipherText: string, secretKey: string, options?: Omit<CryptoSuiteOptions, 'key' | 'keyType'>) =>
  getSuite(secretKey, options).decryptJson<T>(cipherText)

export const hash = (text: string, alg: HashAlg = 'SHA256', outputEncoding: Encoder = 'Hex') =>
  new CryptoSuite().hash(text, alg, outputEncoding)

export const hmac = (
  text: string,
  secret: string | WordArray,
  alg: HashAlg = 'SHA256',
  outputEncoding: Encoder = 'Hex',
  secretEncoding: Encoder = 'Utf8',
) => new CryptoSuite().hmac(text, secret, alg, outputEncoding, secretEncoding)

export const md5 = (text: string) => hash(text, 'MD5')
export const sha1 = (text: string) => hash(text, 'SHA1')
export const sha256 = (text: string) => hash(text, 'SHA256')

export const pbkdf2 = (password: string, salt: string | WordArray, options?: KdfOptions) =>
  new CryptoSuite().pbkdf2(password, salt, options)

export const evpKdf = (password: string, salt: string | WordArray, options?: KdfOptions) =>
  new CryptoSuite().evpKdf(password, salt, options)

export const randomHex = (bytes = 16) => new CryptoSuite().randomHex(bytes)
export const randomBase64 = (bytes = 16) => new CryptoSuite().randomBase64(bytes)

export const base64UrlEncode = (input: string | WordArray, inputEncoding: Encoder = 'Utf8') =>
  new CryptoSuite().base64UrlEncode(input, inputEncoding)

export const base64UrlDecode = (base64Url: string, outputEncoding: Encoder = 'Utf8') =>
  new CryptoSuite().base64UrlDecode(base64Url, outputEncoding)

export const createCrypto = (options: CryptoSuiteOptions = {}) => new CryptoSuite(options)

export const createPassphraseCrypto = (
  secretKey: string,
  options: Omit<CryptoSuiteOptions, 'key' | 'keyType'> & { alg?: SymmetricAlg } = {},
) =>
  new CryptoSuite({
    alg: options.alg ?? 'AES',
    output: options.output ?? 'openssl',
    ...options,
    key: secretKey,
    keyType: 'passphrase',
  })
