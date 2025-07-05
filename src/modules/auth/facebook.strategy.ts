import { PassportStrategy } from '@nestjs/passport'
import { Strategy, Profile } from 'passport-facebook'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get<string>('FACEBOOK_APP_ID'),
      clientSecret: configService.get<string>('FACEBOOK_APP_SECRET'),
      callbackURL: 'http://localhost:3000/auth/facebook/callback',
      profileFields: ['id', 'displayName', 'photos', 'email'],
      scope: ['email'],
    })
  }

  async validate(accessToken: string, refreshToken: string, profile: Profile, done: Function) {
    const { id, displayName, emails, photos } = profile
    const user = {
      facebookId: id,
      name: displayName,
      email: emails?.[0]?.value,
      photo: photos?.[0]?.value,
    }
    done(null, user)
  }
}
