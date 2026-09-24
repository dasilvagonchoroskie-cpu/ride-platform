import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { AdminDocumentsController } from './admin-documents.controller';
import { DocumentsService } from './documents.service';
import { DriversModule } from '../drivers/drivers.module';

@Module({
  imports: [DriversModule],
  controllers: [DocumentsController, AdminDocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
