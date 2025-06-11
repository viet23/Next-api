import * as NodeRSA from 'node-rsa'
import { privateDecrypt, constants } from 'crypto'

export const decryptData = (encryptedData: string) => {
  const key = new NodeRSA(atob(process.env.PRIVATE_KEY))
  const decrypted = key.decrypt(encryptedData, 'utf8')
  return JSON.parse(decrypted)
}
export const decryptDataCrypto = (encryptedData: string): any => {
  try {
    const privateKeyPem = atob(process.env.PRIVATE_KEY) || ''
    const encryptedBuffer = Buffer.from(encryptedData, 'base64')
    const decryptedBuffer = privateDecrypt(
      {
        key: privateKeyPem,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
      },
      encryptedBuffer,
    )
    const decryptedString = decryptedBuffer.toString('utf8')
    return JSON.parse(decryptedString)
  } catch (error) {
    throw new Error('Decryption failed')
  }
}
