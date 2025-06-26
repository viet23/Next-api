import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

export enum AdsGoal {
    MESSAGE = 'message',
    ENGAGEMENT = 'engagement',
    LEADS = 'leads',
    TRAFFIC = 'traffic',
}


class LocationDto {
    @IsNumber()
    lat: number;

    @IsNumber()
    lng: number;
}

export class CreateFacebookAdDto {
    @IsEnum(AdsGoal)
    goal: AdsGoal;

    @IsString()
    campaignName: string;

    @IsString()
    caption: string;

    @IsOptional()
    @IsString()
    urlWebsite: string;

    @IsOptional()
    @IsString()
    language: string;

    @IsBoolean()
    aiTargeting: boolean;

    @IsOptional()
    @IsString()
    gender?: 'all' | 'male' | 'female';

    @IsOptional()
    @IsArray()
    ageRange?: [number, number];

    @IsOptional()
    @ValidateNested()
    @Type(() => LocationDto)
    location?: LocationDto;

    @IsOptional()
    @IsNumber()
    radius?: number; // tính theo đơn vị miles

    @IsOptional()
    @IsArray()
    detailedTargeting?: [string, string];

    @IsDateString()
    startTime: string;

    @IsDateString()
    endTime: string;

    @IsNumber()
    @Min(1)
    dailyBudget: number;

    @IsString()
    postId: string;
}
