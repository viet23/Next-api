import {
    Entity, PrimaryGeneratedColumn, Column, OneToMany,
    ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn
} from 'typeorm';
import { User } from './user.entity';
import { FacebookAd } from './facebook-ad.entity';


@Entity({ name: 'facebook_campaigns' })
export class FacebookCampaign {
    @PrimaryGeneratedColumn()
    id: number;

    // ID chiến dịch từ Meta Graph (bắt buộc để join/trace ngược)
    @Column({ name: 'campaign_id', unique: true })
    campaignId: string;

    @Column({ name: 'name' })
    name: string;

    @Column({ name: 'objective', nullable: true })
    objective?: string;

    @Column({ name: 'status', default: 'ACTIVE' })
    status: string;

    @Column({ name: 'daily_budget', type: 'int', nullable: true })
    dailyBudget?: number;

    @Column({ name: 'start_time', type: 'timestamptz', nullable: true })
    startTime?: Date;

    @Column({ name: 'end_time', type: 'timestamptz', nullable: true })
    endTime?: Date;

    @ManyToOne(() => User, (user) => user.facebookCampaigns, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'created_by' })
    createdBy: User;

    @OneToMany(() => FacebookAd, (ad) => ad.campaign)
    ads: FacebookAd[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
