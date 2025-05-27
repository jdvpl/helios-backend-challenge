import { IsString, IsDate, IsOptional, IsObject } from 'class-validator';

interface NotificationProps {
  targetId: string;
  type: string;
  message: string;
  createdAt?: Date;
  details?: Record<string, any> | any;
  id?: string;
}

export class NotificationEntity {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  targetId: string;

  @IsString()
  type: string;

  @IsString()
  message: string;

  @IsDate()
  createdAt: Date;

  @IsOptional()
  @IsObject()
  details?: Record<string, any>;

  constructor(props: NotificationProps) {
    this.id = props.id;
    this.targetId = props.targetId;
    this.type = props.type;
    this.message = props.message;
    this.createdAt = props.createdAt ?? new Date();
    this.details = props.details;
  }
}
