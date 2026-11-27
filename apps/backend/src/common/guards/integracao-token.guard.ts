import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { BusinessException } from '../errors/business.exception';
import { safeCompare } from '../utils/crypto.util';

/**
 * Chave de integracao maquina-a-maquina (CRM Fortaleza Move -> Central).
 * Protege APENAS o endpoint de integracao: confere o cabecalho
 * "x-integracao-token" contra CRM_INTEGRACAO_TOKEN (variavel de ambiente).
 * Nao concede acesso de admin nem toca no login normal da plataforma.
 */
@Injectable()
export class IntegracaoTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const esperado = process.env.CRM_INTEGRACAO_TOKEN;
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const recebido = req.headers['x-integracao-token'];
    const valor = Array.isArray(recebido) ? recebido[0] : recebido;
    if (!esperado || !valor || !safeCompare(valor, esperado)) {
      throw BusinessException.unauthorized('Chave de integracao ausente ou invalida.');
    }
    return true;
  }
}
