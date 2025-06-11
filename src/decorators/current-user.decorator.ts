import { User } from '@models/user.entity'
import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export const CurrentUser = createParamDecorator((data: (keyof User)[], ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest()
  return request.user
})
