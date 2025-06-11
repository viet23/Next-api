import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { AuthGuard } from '@nestjs/passport'
import { Request } from 'express'

@Injectable()
export class CookieAuthGuard extends AuthGuard('jwt') {
  constructor(private jwtService: JwtService) {
    super()
  }
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest()
    const token = this.extractTokenFromCookie(request)
    if (!token) {
      throw new UnauthorizedException('Unauthorize')
    }
    try {
      const payload = this.jwtService.verify(token)
      request.user = payload
    } catch (error) {
      throw new UnauthorizedException(error)
    }
    return true
  }
  private extractTokenFromCookie(req: Request): string | null {
    const cookie = req.cookies?.jwt
    if (cookie) {
      return cookie
    }
    return null
  }
}
