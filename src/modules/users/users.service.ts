import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole } from '../../common/constants/roles';
import * as bcrypt from 'bcrypt';
import { AppLogger } from '../logger/logger.service';
import { Logger } from 'pino';

@Injectable()
export class UsersService {
  private users: User[] = [];
  private readonly logger: Logger;

  constructor(appLogger: AppLogger) {
    this.logger = appLogger.child({ module: UsersService.name });
  }

  async create(
    createUserDto: CreateUserDto,
  ): Promise<Omit<User, 'password' | 'twoFactorSecret'>> {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user: User = {
      id: Math.random().toString(36).substring(7),
      email: createUserDto.email,
      password: hashedPassword,
      roles: [UserRole.USER],
      isEmailVerified: false,
      isActive: true,
      twoFactorSecret: null,
      twoFactorEnabled: false,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.users.push(user);
    const result = this.sanitizeUser(user);
    this.logger.info(
      { userId: result.id, email: result.email },
      'User created',
    );
    return result;
  }

  async findAll(params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    search?: string;
  }): Promise<
    import('../../common/interfaces').PaginatedResult<
      Omit<User, 'password' | 'twoFactorSecret'>
    >
  > {
    // Filter out soft-deleted users
    let filtered = this.users.filter((u) => !u.deletedAt);

    // Filtering by email (partial match)
    if (params?.search) {
      const searchLower = params.search.toLowerCase();
      filtered = filtered.filter((u) =>
        u.email.toLowerCase().includes(searchLower),
      );
    }
    // Sorting
    if (
      params?.sortBy &&
      ['email', 'createdAt', 'updatedAt'].includes(params.sortBy)
    ) {
      const sortKey = params.sortBy as 'email' | 'createdAt' | 'updatedAt';
      filtered = filtered.slice().sort((a, b) => {
        if (sortKey === 'email') {
          return a.email.localeCompare(b.email);
        }
        return new Date(a[sortKey]).getTime() - new Date(b[sortKey]).getTime();
      });
    }
    // Pagination
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(Math.max(1, params?.limit ?? 20), 100);
    const total = filtered.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const data = filtered
      .slice(start, end)
      .map((user) => this.sanitizeUser(user));
    return { data, total, page, limit };
  }

  async findOne(
    id: string,
  ): Promise<Omit<User, 'password' | 'twoFactorSecret'>> {
    const user = this.users.find((user) => user.id === id && !user.deletedAt);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return this.sanitizeUser(user);
  }

  async findByEmail(email: string): Promise<User | undefined> {
    return this.users.find((user) => user.email === email && !user.deletedAt);
  }

  async findByIdWithSecrets(id: string): Promise<User> {
    const user = this.users.find((user) => user.id === id && !user.deletedAt);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<Omit<User, 'password' | 'twoFactorSecret'>> {
    const userIndex = this.users.findIndex(
      (user) => user.id === id && !user.deletedAt,
    );
    if (userIndex === -1) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const updates: Partial<User> = { ...updateUserDto };
    if (updateUserDto.password) {
      updates.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    const updatedUser = {
      ...this.users[userIndex],
      ...updates,
      updatedAt: new Date(),
    };

    this.users[userIndex] = updatedUser;

    const result = this.sanitizeUser(updatedUser);
    const updatedFields = Object.keys(updateUserDto).filter(
      (key) => key !== 'password',
    );
    if (updatedFields.length > 0) {
      this.logger.info({ userId: result.id, updatedFields }, 'User updated');
    }
    return result;
  }

  async softDelete(id: string): Promise<void> {
    const userIndex = this.users.findIndex(
      (user) => user.id === id && !user.deletedAt,
    );
    if (userIndex === -1) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    this.users[userIndex].deletedAt = new Date();
    this.users[userIndex].isActive = false;
    this.users[userIndex].updatedAt = new Date();
    this.logger.info({ userId: id }, 'User soft deleted');
  }

  async remove(id: string): Promise<void> {
    const userIndex = this.users.findIndex((user) => user.id === id);
    if (userIndex === -1) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    this.users.splice(userIndex, 1);
    this.logger.info({ userId: id }, 'User removed');
  }

  async restore(
    id: string,
  ): Promise<Omit<User, 'password' | 'twoFactorSecret'>> {
    const userIndex = this.users.findIndex(
      (user) => user.id === id && user.deletedAt,
    );
    if (userIndex === -1) {
      throw new NotFoundException(`Deleted user with ID ${id} not found`);
    }
    this.users[userIndex].deletedAt = null;
    this.users[userIndex].isActive = true;
    this.users[userIndex].updatedAt = new Date();
    const result = this.sanitizeUser(this.users[userIndex]);
    this.logger.info({ userId: id }, 'User restored');
    return result;
  }

  async verifyEmail(id: string): Promise<void> {
    const userIndex = this.users.findIndex(
      (user) => user.id === id && !user.deletedAt,
    );
    if (userIndex === -1) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    this.users[userIndex].isEmailVerified = true;
    this.users[userIndex].updatedAt = new Date();
    this.logger.info({ userId: id }, 'User email verified');
  }

  async updatePassword(id: string, hashedPassword: string): Promise<void> {
    const userIndex = this.users.findIndex((user) => user.id === id);
    if (userIndex === -1) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    this.users[userIndex].password = hashedPassword;
    this.users[userIndex].updatedAt = new Date();
    this.logger.info({ userId: id }, 'User password updated');
  }

  async setTwoFactorSecret(id: string, encryptedSecret: string): Promise<void> {
    const user = await this.findByIdWithSecrets(id);
    user.twoFactorSecret = encryptedSecret;
    user.twoFactorEnabled = false;
    user.updatedAt = new Date();
    this.logger.info({ userId: id }, 'Two-factor secret generated');
  }

  async enableTwoFactor(id: string): Promise<void> {
    const user = await this.findByIdWithSecrets(id);
    user.twoFactorEnabled = true;
    user.updatedAt = new Date();
    this.logger.info({ userId: id }, 'Two-factor authentication enabled');
  }

  async disableTwoFactor(id: string): Promise<void> {
    const user = await this.findByIdWithSecrets(id);
    user.twoFactorSecret = null;
    user.twoFactorEnabled = false;
    user.updatedAt = new Date();
    this.logger.info({ userId: id }, 'Two-factor authentication disabled');
  }

  private sanitizeUser(user: User): Omit<User, 'password' | 'twoFactorSecret'> {
    const { password, twoFactorSecret, ...result } = user;
    return result;
  }
}
