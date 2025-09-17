import { IsString, IsInt, Min } from 'class-validator';

export class BuyPlanDto {
  @IsString()
  name: string;   // Free | Starter | Pro | Enterprise

  @IsInt()
  @Min(1)
  months: number; // số tháng mua
}
