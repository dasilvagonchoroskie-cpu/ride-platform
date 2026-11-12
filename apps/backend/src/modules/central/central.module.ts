import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { RidesModule } from '../rides/rides.module';
import { ComercioModule } from '../comercio/comercio.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { AuthModule } from '../auth/auth.module';
import { AdminCentralController, DriverPayoutsController, SafetyController } from './central.controller';
import { CorridaDoMotoristaController } from './corrida-do-motorista.controller';
import { EntregaManualController } from './entrega-manual.controller';
import { EntregaManualService } from './entrega-manual.service';
import { CentralService } from './central.service';
import { DadosPessoaisCentralController, MeusDadosMotoristaController } from './dados-pessoais.controller';
import { DadosPessoaisService } from './dados-pessoais.service';
import { PedidosExclusaoService } from './pedidos-exclusao.service';
import { RecuperacaoAssistidaService } from './recuperacao-assistida';
import { RecuperacaoAssistidaController } from './recuperacao-assistida.controller';

@Module({
  imports: [PrismaModule, RidesModule, VehiclesModule, AuthModule, ComercioModule],
  controllers: [AdminCentralController, SafetyController, DriverPayoutsController, CorridaDoMotoristaController, EntregaManualController, MeusDadosMotoristaController, DadosPessoaisCentralController, RecuperacaoAssistidaController],
  providers: [CentralService, EntregaManualService, DadosPessoaisService, PedidosExclusaoService, RecuperacaoAssistidaService],
  exports: [CentralService, PedidosExclusaoService],
})
export class CentralModule {}
