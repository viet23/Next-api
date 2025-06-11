import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export const Authen = createParamDecorator(async (data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest()
  return request.user // Lấy thông tin user đã được gán bởi JwtAuthGuard
})
