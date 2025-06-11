import { PassportStrategy } from '@nestjs/passport'
import { Strategy } from '@node-saml/passport-saml'

export class SamlGtelpayStrategy extends PassportStrategy(Strategy, 'saml-gtelpay') {
  constructor() {
    super({
      entryPoint: 'https://adfs.gtelpay.vn/adfs/ls/',
      issuer: process.env.SAML_ISSUER,
      callbackUrl: process.env.SAML_CALLBACK_URL_GTELPAY,
      cert: Buffer.from(process.env.SAML_CERT_GTELPAY, 'base64').toString('utf-8'),
      idpCert: Buffer.from(process.env.SAML_CERT_GTELPAY, 'base64').toString('utf-8'),
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
