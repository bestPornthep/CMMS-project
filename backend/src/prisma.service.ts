import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL is not defined in environment variables.');
    }
    const config = PrismaService.parseConnectionString(dbUrl);
    const adapter = new PrismaMssql(config);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private static parseConnectionString(url: string) {
    if (!url.startsWith('sqlserver://')) {
      throw new Error('Invalid SQL Server connection URL format.');
    }

    const rest = url.substring('sqlserver://'.length);
    const semiIndex = rest.indexOf(';');
    const hostPart = semiIndex === -1 ? rest : rest.substring(0, semiIndex);
    const paramsPart = semiIndex === -1 ? '' : rest.substring(semiIndex + 1);

    let server = hostPart;
    let port: number | undefined;
    if (hostPart.includes(':')) {
      const parts = hostPart.split(':');
      server = parts[0];
      port = parseInt(parts[1], 10);
    }

    const params: Record<string, string> = {};
    if (paramsPart) {
      const kvs = paramsPart.split(';');
      for (const kv of kvs) {
        if (!kv) continue;
        const eqIndex = kv.indexOf('=');
        if (eqIndex !== -1) {
          const k = kv.substring(0, eqIndex).trim();
          const v = kv.substring(eqIndex + 1).trim();
          params[k] = v;
        }
      }
    }

    let instanceName: string | undefined;
    if (server.includes('\\')) {
      const parts = server.split('\\');
      server = parts[0];
      instanceName = parts[1];
    }

    return {
      server,
      port: port || (instanceName ? undefined : 1433),
      database: params.database || 'master',
      user: params.user || '',
      password: params.password || '',
      options: {
        instanceName,
        encrypt: params.encrypt === 'true',
        trustServerCertificate: params.trustServerCertificate === 'true',
      },
    };
  }
}
