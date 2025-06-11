import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator'

@ValidatorConstraint({ async: false })
export class IsPasswordValidConstraint implements ValidatorConstraintInterface {
  validate(password: string): boolean {
    // Kiểm tra mật khẩu có ít nhất 8 ký tự, bao gồm cả chữ hoa và chữ thường
    return (
      typeof password === 'string' &&
      password.length >= 8 &&
      /[A-Z]/.test(password) && // Có ít nhất một chữ hoa
      /[a-z]/.test(password)
    ) // Có ít nhất một chữ thường
  }

  defaultMessage(): string {
    return 'Password must be at least 8 characters long and include both uppercase and lowercase letters.'
  }
}

export function IsPasswordValid(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsPasswordValidConstraint,
    })
  }
}
