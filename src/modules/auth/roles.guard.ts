import { ROLES_KEY } from '@decorators/roles.decorator'
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { QueryBus } from '@nestjs/cqrs'
import { GetRolesAuthQuery } from './cqrs/queries/impl/get-roles-auth.query'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly queryBus: QueryBus,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const requiredRoles = this.reflector.get<string[]>(ROLES_KEY, context.getHandler())

    if (!requiredRoles) return true

    const request = context.switchToHttp().getRequest()
    const user = request.user
    const groups = await this.queryBus.execute(new GetRolesAuthQuery(user.id))
    const roles = groups ? groups.map((group) => group?.roles.map((x) => x.name)).flat() : []
    if (!requiredRoles.some((role) => roles.includes(role))) throw new UnauthorizedException()
    return true
  }
}
