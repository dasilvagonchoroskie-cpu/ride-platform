import { UsersController } from '../users/users.controller';
import { AuthController } from './auth.controller';

/** Rotas expostas por um controlador. */
function caminhos(controller: { prototype: object }): string[] {
  return Object.getOwnPropertyNames(controller.prototype)
    .map((nome) => (controller.prototype as Record<string, unknown>)[nome])
    .filter((m): m is (...a: unknown[]) => unknown => typeof m === 'function')
    .filter((m) => Reflect.getMetadata('path', m) !== undefined)
    .map((m) => `${Reflect.getMetadata('method', m)} ${Reflect.getMetadata('path', m)}`);
}

// Numeros do RequestMethod do Nest: POST = 1, PATCH = 4.
describe('Rotas da conta', () => {
  it('entrada por senha: so o login', () => {
    expect(caminhos(AuthController)).toContain('1 password/login');
    expect(caminhos(AuthController)).not.toContain('1 password/register');
  });

  it('rotas do proprio perfil', () => {
    expect(caminhos(UsersController)).toContain('1 me/addresses');
    expect(caminhos(UsersController)).not.toContain('4 me');
  });
});
