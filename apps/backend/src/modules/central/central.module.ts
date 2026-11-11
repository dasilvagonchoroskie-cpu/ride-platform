import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { RidesModule } from '../rides/rides.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { AuthModule } from '../auth/auth.module';
import { AdminCentralController, DriverPayoutsController, SafetyController } from './central.controller';
import { CorridaDoMotoristaController } from './corrida-do-motorista.controller';
import { CentralService } from './central.service';
import { DadosPessoaisCentralController, MeusDadosMotoristaController } from './dados-pessoais.controller';
import { DadosPessoaisService } from './dados-pessoais.service';
import { PedidosExclusaoService } from './pedidos-exclusao.service';
import { RecuperacaoAssistidaController, RecuperacaoAssistidaService } from './recuperacao-assistida';

@Module({
  imports: [PrismaModule, RidesModule, VehiclesModule, AuthModule],
  controllers: [AdminCentralController, SafetyController, DriverPayoutsController, CorridaDoMotoristaController, MeusDadosMotoristaController, DadosPessoaisCentralController, RecuperacaoAssistidaController],
  providers: [CentralService, DadosPessoaisService, PedidosExclusaoService, RecuperacaoAssistidaService],
  exports: [CentralService, PedidosExclusaoService],
})
export class CentralModule {}
