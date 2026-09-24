import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfiguration } from './configuration';

/** Acesso tipado a configuracao. Evita strings soltas espalhadas pelo codigo. */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  private get root(): AppConfiguration {
    return {
      env: this.config.get('env') as AppConfiguration['env'],
      isProduction: this.config.get<boolean>('isProduction') as boolean,
      isDevelopment: this.config.get<boolean>('isDevelopment') as boolean,
      port: this.config.get<number>('port') as number,
      host: this.config.get<string>('host') as string,
      apiPrefix: this.config.get<string>('apiPrefix') as string,
      apiUrl: this.config.get<string>('apiUrl') as string,
      corsOrigins: this.config.get<string[]>('corsOrigins') as string[],
      database: this.config.get('database') as AppConfiguration['database'],
      redis: this.config.get('redis') as AppConfiguration['redis'],
      jwt: this.config.get('jwt') as AppConfiguration['jwt'],
      otp: this.config.get('otp') as AppConfiguration['otp'],
      s3: this.config.get('s3') as AppConfiguration['s3'],
      mail: this.config.get('mail') as AppConfiguration['mail'],
      fcm: this.config.get('fcm') as AppConfiguration['fcm'],
      maps: this.config.get('maps') as AppConfiguration['maps'],
      payments: this.config.get('payments') as AppConfiguration['payments'],
      business: this.config.get('business') as AppConfiguration['business'],
    };
  }

  get all(): AppConfiguration {
    return this.root;
  }

  get env(): AppConfiguration['env'] {
    return this.root.env;
  }

  get isProduction(): boolean {
    return this.root.isProduction;
  }

  get isDevelopment(): boolean {
    return this.root.isDevelopment;
  }

  get port(): number {
    return this.root.port;
  }

  get host(): string {
    return this.root.host;
  }

  get apiPrefix(): string {
    return this.root.apiPrefix;
  }

  get apiUrl(): string {
    return this.root.apiUrl;
  }

  get corsOrigins(): string[] {
    return this.root.corsOrigins;
  }

  get databaseUrl(): string {
    return this.root.database.url;
  }

  get redis(): AppConfiguration['redis'] {
    return this.root.redis;
  }

  get jwt(): AppConfiguration['jwt'] {
    return this.root.jwt;
  }

  get otp(): AppConfiguration['otp'] {
    return this.root.otp;
  }

  get s3(): AppConfiguration['s3'] {
    return this.root.s3;
  }

  get mail(): AppConfiguration['mail'] {
    return this.root.mail;
  }

  get fcm(): AppConfiguration['fcm'] {
    return this.root.fcm;
  }

  get maps(): AppConfiguration['maps'] {
    return this.root.maps;
  }

  get payments(): AppConfiguration['payments'] {
    return this.root.payments;
  }

  get business(): AppConfiguration['business'] {
    return this.root.business;
  }
}
