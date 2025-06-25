import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'facebook_ads' })
export class FacebookAd {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'ad_id', unique: true })
    adId: string;

    @Column({ name: 'campaign_name', nullable: true })
    campaignName?: string;

    @Column({ name: 'caption', type: 'text', nullable: true })
    caption?: string;

    @Column({ name: 'objective', nullable: true }) 
    objective?: string;

    @Column({ name: 'start_time', type: 'timestamptz', nullable: true })
    startTime?: Date;

    @Column({ name: 'end_time', type: 'timestamptz', nullable: true })
    endTime?: Date;

    @Column({ name: 'daily_budget', type: 'int', nullable: true })
    dailyBudget?: number;

    @Column({ name: 'status', default: 'ACTIVE', nullable: true })
    status?: string;

    @ManyToOne(() => User, (user) => user.facebookAds, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'created_by' })
    createdBy: User;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
