import { UserRole } from '../../common/constants/roles';

export class User {
  id: string;
  email: string;
  password: string;
  roles: UserRole[] = [UserRole.USER];
  isEmailVerified: boolean = false;
  isActive: boolean = true;
  twoFactorSecret: string | null = null;
  twoFactorEnabled: boolean = false;
  deletedAt: Date | null = null;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial?: Partial<User>) {
    Object.assign(this, partial);
    if (!this.roles) {
      this.roles = [UserRole.USER];
    }
    if (this.isEmailVerified === undefined) {
      this.isEmailVerified = false;
    }
    if (this.isActive === undefined) {
      this.isActive = true;
    }
    if (this.twoFactorSecret === undefined) {
      this.twoFactorSecret = null;
    }
    if (this.twoFactorEnabled === undefined) {
      this.twoFactorEnabled = false;
    }
    if (this.deletedAt === undefined) {
      this.deletedAt = null;
    }
  }
}
