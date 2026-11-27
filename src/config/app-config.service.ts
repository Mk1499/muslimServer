import { Injectable } from '@nestjs/common';

@Injectable()
export class AppConfigService {
  get<T = string>(key: string): T | undefined {
    const value = process.env[key];
    return value === undefined ? undefined : (value as T);
  }

  getOrThrow<T = string>(key: string): T {
    const value = this.get<T>(key);
    if (value === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }
}
