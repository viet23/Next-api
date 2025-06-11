import { PassportStrategy } from '@nestjs/passport'
import { Strategy } from '@node-saml/passport-saml'
export class SamlStrategy extends PassportStrategy(Strategy, 'saml') {
  constructor() {
    super({
      entryPoint: 'https://adfs.vpa.com.vn/adfs/ls/',
      issuer: process.env.SAML_ISSUER,
      callbackUrl: process.env.SAML_CALLBACK_URL,
      cert: Buffer.from(process.env.SAML_CERT, 'base64').toString('utf-8'),
      idpCert: Buffer.from(process.env.SAML_CERT, 'base64').toString('utf-8'),
      validateInResponseTo: 'never',
      signatureAlgorithm: 'rsa-sha256',
      wantAssertionsSigned: false,
      wantAuthnResponseSigned: false,
      identifierFormat: null,
      acceptedClockSkewMs: -1,
    })
  }
  validate(profile: any, done: Function) {
    return done(null, profile)
  }
}
