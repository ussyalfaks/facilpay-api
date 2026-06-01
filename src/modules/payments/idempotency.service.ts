import {
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { AppLogger } from '../logger/logger.service';
import { Logger } from 'pino';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class IdempotencyService {
  private readonly logger: Logger;
  private readonly ttlHours: number;

  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly idempotencyKeyRepository: Repository<IdempotencyKey>,
    appLogger: AppLogger,
    private readonly configService: ConfigService,
  ) {
    this.logger = appLogger.child({ module: IdempotencyService.name });
    this.ttlHours = this.configService.get<number>(
      'IDEMPOTENCY_KEY_TTL_HOURS',
      24,
    );
  }

  /**
   * Check if an idempotency key exists and return cached response if valid
   * @param key - The idempotency key from header
   * @param requestBody - The current request body
   * @returns Cached response if key exists and body matches, null otherwise
   * @throws UnprocessableEntityException if key exists but body doesn't match
   */
  async checkIdempotencyKey(
    key: string,
    requestBody: Record<string, unknown>,
  ): Promise<{ responseBody: Record<string, unknown>; responseStatus: number } | null> {
    const existingKey = await this.idempotencyKeyRepository.findOneBy({ key });

    if (!existingKey) {
      return null;
    }

    // Check if key has expired
    if (new Date() > existingKey.expiresAt) {
      this.logger.debug(`Idempotency key expired: ${key}`);
      await this.idempotencyKeyRepository.remove(existingKey);
      return null;
    }

    // Verify request body matches
    if (JSON.stringify(existingKey.requestBody) !== JSON.stringify(requestBody)) {
      this.logger.warn(
        `Idempotency key reused with different request body: ${key}`,
      );
      throw new UnprocessableEntityException(
        'Idempotency key reused with different request body',
      );
    }

    this.logger.debug(`Returning cached response for idempotency key: ${key}`);
    return {
      responseBody: existingKey.responseBody,
      responseStatus: existingKey.responseStatus,
    };
  }

  /**
   * Store idempotency key with response
   * @param key - The idempotency key
   * @param requestBody - The request body
   * @param responseBody - The response body to cache
   * @param responseStatus - The HTTP status code
   */
  async storeIdempotencyKey(
    key: string,
    requestBody: Record<string, unknown>,
    responseBody: Record<string, unknown>,
    responseStatus: number,
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.ttlHours);

    try {
      const idempotencyKey = this.idempotencyKeyRepository.create({
        key,
        requestBody,
        responseBody,
        responseStatus,
        expiresAt,
      });

      await this.idempotencyKeyRepository.save(idempotencyKey);
      this.logger.debug(
        `Stored idempotency key: ${key}, expires at: ${expiresAt.toISOString()}`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to store idempotency key: ${errorMessage}`,
      );
      throw error;
    }
  }

  /**
   * Clean up expired idempotency keys
   * Should be called periodically (e.g., via a scheduled task)
   */
  async cleanupExpiredKeys(): Promise<number> {
    const now = new Date();
    const result = await this.idempotencyKeyRepository.delete({
      expiresAt: LessThan(now),
    });

    this.logger.info(
      `Cleaned up ${result.affected} expired idempotency keys`,
    );
    return result.affected || 0;
  }
}
