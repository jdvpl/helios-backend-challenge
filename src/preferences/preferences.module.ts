import { Module } from '@nestjs/common';
import { PrismaPreferencesRepository } from './infrastructure/prisma-preferences.repository';
import { PreferencesRepository } from './domain/preferences.repository';

@Module({
  providers: [
    { provide: PreferencesRepository, useClass: PrismaPreferencesRepository },
  ],
  exports: [PreferencesRepository],
})
export class PreferencesModule {}
