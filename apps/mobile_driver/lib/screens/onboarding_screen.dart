import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../data/models/driver_models.dart';
import '../state/driver_state.dart';
import '../widgets/ui.dart';

/// Cadastro em 3 etapas: dados pessoais, veiculo e documentos.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  int _step = 0;

  final _nome = TextEditingController();
  final _email = TextEditingController();
  final _telefone = TextEditingController();
  final _cpf = TextEditingController();

  final _nascimento = TextEditingController();
  final _cnh = TextEditingController();
  final _cnhExpiry = TextEditingController();
  String _cnhCategory = 'B';

  // Sem exemplos preenchidos: antes vinha "Toyota Corolla ABC1D23" e um
  // motorista com pressa podia mandar o carro errado para a Central.
  final _brand = TextEditingController();
  final _model = TextEditingController();
  final _year = TextEditingController();
  final _color = TextEditingController();
  final _plate = TextEditingController();

  String? _error;

  /// Entrou pelo e-mail: ainda falta o telefone.
  bool _semTelefone = false;

  @override
  void initState() {
    super.initState();
    final driver = context.read<DriverState>();
    _semTelefone = (driver.profile?.phone ?? '').isEmpty;
    // Digitou o telefone antes (sem conta, entrou pelo e-mail): ja vem preenchido.
    final digitado = driver.telefoneParaCadastro;
    if (_semTelefone && digitado != null) _telefone.text = telefoneBonito(digitado);
    final nome = driver.profile?.name ?? '';
    // A conta nasce como "Motorista 1234" (ou "Passageiro 1234"): isso nao e nome.
    if (nome.isNotEmpty && !nome.startsWith('Motorista') && !nome.startsWith('Passageiro')) _nome.text = nome;
    _email.text = driver.email ?? '';
    // Conta de passageiro ja tem CPF: vem preenchido (os mesmos dados).
    final cpfConta = driver.cpfConta;
    if (cpfConta != null && cpfConta.length == 11) {
      _cpf.text = '${cpfConta.substring(0, 3)}.${cpfConta.substring(3, 6)}.${cpfConta.substring(6, 9)}-${cpfConta.substring(9)}';
    }
  }

  @override
  void dispose() {
    for (final controller in [
      _nome, _email, _telefone, _cpf, _nascimento, _cnh, _cnhExpiry, _brand, _model, _year, _color, _plate,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _submitPersonal() async {
    if (_nome.text.trim().split(RegExp(r'\s+')).where((p) => p.length >= 2).length < 2) {
      setState(() => _error = 'Informe o nome completo, igual ao da CNH.');
      return;
    }
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$').hasMatch(_email.text.trim())) {
      setState(() => _error = 'Digite um e-mail válido. Ele serve para entrar no aplicativo.');
      return;
    }
    if (_semTelefone) {
      final d = onlyDigits(_telefone.text);
      if (d.length < 10 || d.length > 11) {
        setState(() => _error = 'Informe o telefone com DDD.');
        return;
      }
    }
    if (onlyDigits(_cpf.text).length != 11) {
      setState(() => _error = 'Informe um CPF com 11 dígitos.');
      return;
    }
    if (onlyDigits(_cnh.text).length != 11) {
      setState(() => _error = 'O número da CNH tem 11 dígitos.');
      return;
    }

    setState(() {
      _error = null;
      _step = 1;
    });
  }

  Future<void> _submitVehicle() async {
    if (_brand.text.trim().isEmpty || _model.text.trim().isEmpty) {
      setState(() => _error = 'Informe marca e modelo do veículo.');
      return;
    }
    // BUG CORRIGIDO: a validacao anterior usava onlyDigits(), que remove as
    // LETRAS da placa — "ABC1D23" virava "123" e nunca passava no teste.
    // Agora normalizamos para alfanumerico e validamos os dois padroes:
    // antigo (ABC1234) e Mercosul (ABC1D23).
    final ano = int.tryParse(_year.text.trim());
    if (ano == null || ano < 1990 || ano > DateTime.now().year + 1) {
      setState(() => _error = 'Informe o ano do veículo com 4 números.');
      return;
    }
    if (_color.text.trim().length < 3) {
      setState(() => _error = 'Informe a cor do veículo.');
      return;
    }
    final plate = normalizePlate(_plate.text);
    if (!isValidPlate(plate)) {
      setState(() => _error = 'Placa inválida. Use ABC1234 ou ABC1D23.');
      return;
    }

    await context.read<DriverState>().registerVehicle(
          VehicleInfo(
            brand: _brand.text.trim(),
            model: _model.text.trim(),
            year: int.tryParse(_year.text.trim()) ?? DateTime.now().year,
            color: _color.text.trim(),
            plate: plate,
          ),
        );

    setState(() {
      _error = null;
      _step = 2;
    });
  }

  Future<void> _sair() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sair do cadastro?'),
        content: const Text(
          'Você volta para a tela de entrar e pode usar outro telefone. '
          'Se você já usa o app do passageiro, entre com o MESMO telefone: '
          'a mesma conta serve para os dois aplicativos.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Continuar o cadastro')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Sair')),
        ],
      ),
    );
    if (ok == true && mounted) await context.read<DriverState>().logout();
  }

  /// Enviando o cadastro: o botao trava. Dois toques seguidos mandavam o
  /// cadastro e o carro duas vezes ao mesmo tempo (o segundo dava erro).
  bool _enviando = false;

  Future<void> _finish() async {
    if (_enviando) return;
    final driver = context.read<DriverState>();
    setState(() => _enviando = true);

    final ResultadoCadastro resultado;
    try {
      resultado = await driver.completeOnboarding(
        nome: _nome.text.trim().replaceAll(RegExp(r'\s+'), ' '),
        emailConta: _email.text.trim(),
        telefone: _semTelefone ? '+55${onlyDigits(_telefone.text)}' : null,
        birthDate: _nascimento.text,
        cpf: onlyDigits(_cpf.text),
        cnhNumber: onlyDigits(_cnh.text),
        cnhCategory: _cnhCategory,
        cnhExpiresAt: _cnhExpiry.text,
      );
    } finally {
      if (mounted) setState(() => _enviando = false);
    }

    // Cadastro enviado: o aplicativo segue sozinho para a tela de
    // conferencia na Central (antes abria um envio de documentos simulado).
    if (resultado == ResultadoCadastro.contaExistente && mounted) {
      if (await _usarContaExistente(driver.error ?? '') && mounted) await _finish();
    }
  }

  /// "Voce ja tem conta": manda o codigo para essa conta e entra nela.
  /// Devolve true se entrou (o cadastro e reenviado na conta certa).
  Future<bool> _usarContaExistente(String motivo) async {
    final driver = context.read<DriverState>();
    final querUsar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Você já tem conta'),
        content: Text(
          '$motivo\n\nÉ a mesma pessoa: pode usar os mesmos dados do app do passageiro. '
          'Vamos mandar um código para essa conta e o cadastro de motorista continua nela.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Agora não')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Mandar código')),
        ],
      ),
    );
    if (querUsar != true || !mounted) return false;

    final ({String destino, String? codigoDeTeste}) envio;
    try {
      envio = await driver.pedirCodigoVinculo();
    } on ApiException catch (e) {
      avisar(e.message);
      return false;
    } catch (_) {
      avisar('Sem conexão com o servidor. Tente de novo.');
      return false;
    }
    if (!mounted) return false;

    final campo = TextEditingController(text: envio.codigoDeTeste ?? '');
    final codigo = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Digite o código'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Enviamos um código para o ${envio.destino}.'),
            if (envio.codigoDeTeste != null)
              Padding(
                padding: const EdgeInsets.only(top: Spacing.sm),
                child: Text(
                  'Ambiente de teste (o código ainda não vai por SMS): ${envio.codigoDeTeste}',
                  style: AppText.caption.copyWith(color: AppColors.textMuted),
                ),
              ),
            const SizedBox(height: Spacing.md),
            TextField(
              controller: campo,
              keyboardType: TextInputType.number,
              maxLength: 6,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Código', counterText: ''),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(campo.text), child: const Text('Confirmar')),
        ],
      ),
    );
    if (codigo == null || codigo.trim().isEmpty || !mounted) return false;
    try {
      await driver.entrarNaContaVinculada(codigo);
      avisar('Pronto: você está na sua conta. Continuando o cadastro de motorista...');
      return true;
    } on ApiException catch (e) {
      avisar(e.message);
      return false;
    } catch (_) {
      avisar('Sem conexão com o servidor. Tente de novo.');
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Cadastro do motorista'),
        // Sair durante o cadastro: para entrar com o telefone da conta de
        // passageiro (a mesma conta serve para os dois apps). Antes nao havia
        // como sair daqui sem apagar os dados do aplicativo.
        actions: [
          TextButton(
            onPressed: _sair,
            child: const Text('Sair'),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(4),
          child: Row(
            children: [
              for (var i = 0; i < 3; i++)
                Expanded(
                  child: Container(
                    height: 4,
                    color: i <= _step ? AppColors.primary : AppColors.border,
                  ),
                ),
            ],
          ),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.lg),
          child: switch (_step) {
            0 => _personalStep(),
            1 => _vehicleStep(),
            _ => _reviewStep(),
          },
        ),
      ),
    );
  }

  /// Com qual telefone a pessoa entrou: um digito errado abria um cadastro
  /// vazio e ela achava que o aplicativo tinha perdido o cadastro aprovado.
  Widget _contaAtual() {
    final telefone = telefoneBonito(context.watch<DriverState>().profile?.phone);
    if (telefone.isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(bottom: Spacing.lg),
      padding: const EdgeInsets.all(Spacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(Radii.sm),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.phone_android, size: 20, color: AppColors.textMuted),
          const SizedBox(width: Spacing.md),
          Expanded(
            child: Text(
              'Você entrou com $telefone, que ainda não tem cadastro de motorista. '
              'Já é motorista ou usa o app do passageiro com outro número? Toque em Sair e entre com ele.',
              style: AppText.caption.copyWith(color: AppColors.textMuted),
            ),
          ),
        ],
      ),
    );
  }

  Widget _personalStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _contaAtual(),
        Text('Etapa 1 de 3', style: AppText.label.copyWith(color: AppColors.primary)),
        const SizedBox(height: Spacing.xs),
        Text('Seus dados', style: AppText.title),
        const SizedBox(height: Spacing.lg),
        AppField(
          label: 'Nome completo',
          hint: 'Igual ao da CNH',
          controller: _nome,
          autoCapitalize: TextCapitalization.words,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: Spacing.md),
        AppField(
          label: 'E-mail',
          hint: 'seuemail@gmail.com',
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          onChanged: (_) => setState(() {}),
        ),
        if (_semTelefone) ...[
          const SizedBox(height: Spacing.md),
          AppField(
            label: 'Telefone (WhatsApp)',
            hint: '(64) 99999-9999',
            controller: _telefone,
            keyboardType: TextInputType.phone,
            onChanged: (value) {
              final masked = formatPhoneInput(value);
              _telefone.value = TextEditingValue(
                text: masked,
                selection: TextSelection.collapsed(offset: masked.length),
              );
              setState(() {});
            },
          ),
        ],
        const SizedBox(height: Spacing.md),
        AppField(label: 'CPF', hint: '000.000.000-00', controller: _cpf, keyboardType: TextInputType.number, inputFormatters: [MascaraCpf()], onChanged: (_) => setState(() {})),
        const SizedBox(height: Spacing.md),
        AppField(label: 'Data de nascimento', hint: 'DD/MM/AAAA', controller: _nascimento, keyboardType: TextInputType.number, inputFormatters: [MascaraData()], onChanged: (_) => setState(() {})),
        const SizedBox(height: Spacing.md),
        AppField(label: 'Número da CNH', hint: '00000000000', controller: _cnh, keyboardType: TextInputType.number, onChanged: (_) => setState(() {})),
        const SizedBox(height: Spacing.md),
        Text('CATEGORIA DA CNH', style: AppText.label.copyWith(color: AppColors.textMuted)),
        const SizedBox(height: Spacing.sm),
        Wrap(
          spacing: Spacing.sm,
          children: [
            for (final category in ['A', 'B', 'AB', 'C', 'D', 'E'])
              GestureDetector(
                onTap: () => setState(() => _cnhCategory = category),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: Spacing.lg, vertical: Spacing.md),
                  decoration: BoxDecoration(
                    color: _cnhCategory == category ? AppColors.primarySoft : AppColors.surfaceElevated,
                    border: Border.all(
                      color: _cnhCategory == category ? AppColors.primary : AppColors.border,
                    ),
                    borderRadius: BorderRadius.circular(Radii.sm),
                  ),
                  child: Text(
                    category,
                    style: AppText.bodyStrong.copyWith(
                      color: _cnhCategory == category ? AppColors.primary : AppColors.text,
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: Spacing.md),
        AppField(label: 'Validade da CNH', hint: 'DD/MM/AAAA', controller: _cnhExpiry, keyboardType: TextInputType.number, inputFormatters: [MascaraData()], onChanged: (_) => setState(() {})),
        if (_error != null) ...[
          const SizedBox(height: Spacing.sm),
          Text(_error!, style: AppText.caption.copyWith(color: AppColors.danger)),
        ],
        const SizedBox(height: Spacing.lg),
        AppButton(label: 'Continuar', onPressed: _submitPersonal),
      ],
    );
  }

  Widget _vehicleStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Etapa 2 de 3', style: AppText.label.copyWith(color: AppColors.primary)),
        const SizedBox(height: Spacing.xs),
        Text('Seu veículo', style: AppText.title),
        const SizedBox(height: Spacing.lg),
        const SizedBox(height: Spacing.sm),
        AppField(label: 'Marca', hint: 'Ex.: Chevrolet', controller: _brand, onChanged: (_) => setState(() {})),
        const SizedBox(height: Spacing.md),
        AppField(label: 'Modelo', hint: 'Ex.: Onix', controller: _model, onChanged: (_) => setState(() {})),
        const SizedBox(height: Spacing.md),
        Row(
          children: [
            Expanded(child: AppField(label: 'Ano', hint: '2020', controller: _year, keyboardType: TextInputType.number, onChanged: (_) => setState(() {}))),
            const SizedBox(width: Spacing.md),
            Expanded(child: AppField(label: 'Cor', hint: 'Ex.: Branco', controller: _color, onChanged: (_) => setState(() {}))),
          ],
        ),
        const SizedBox(height: Spacing.md),
        AppField(
          label: 'Placa',
          hint: 'ABC1D23',
          controller: _plate,
          maxLength: 7,
          onChanged: (value) {
            // Mantem apenas letras e numeros, no maximo 7 caracteres.
            final masked = normalizePlate(value);
            if (masked != value) {
              _plate.value = TextEditingValue(
                text: masked,
                selection: TextSelection.collapsed(offset: masked.length),
              );
            }
            setState(() {});
          },
        ),
        const SizedBox(height: Spacing.xs),
        Text(
          'Formatos aceitos: ABC1234 (antigo) ou ABC1D23 (Mercosul)',
          style: AppText.caption.copyWith(color: AppColors.textFaint),
        ),
        if (_error != null) ...[
          const SizedBox(height: Spacing.sm),
          Text(_error!, style: AppText.caption.copyWith(color: AppColors.danger)),
        ],
        const SizedBox(height: Spacing.lg),
        AppButton(label: 'Continuar', onPressed: _submitVehicle),
        const SizedBox(height: Spacing.sm),
        AppButton(label: 'Voltar', variant: AppButtonVariant.ghost, onPressed: () => setState(() => _step = 0)),
      ],
    );
  }

  Widget _reviewStep() {
    final driver = context.watch<DriverState>();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Etapa 3 de 3', style: AppText.label.copyWith(color: AppColors.primary)),
        const SizedBox(height: Spacing.xs),
        Text('Revise e envie', style: AppText.title),
        const SizedBox(height: Spacing.lg),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('DADOS', style: AppText.label.copyWith(color: AppColors.textFaint)),
              const SizedBox(height: Spacing.sm),
              Text('CPF ${_cpf.text}', style: AppText.body),
              Text('CNH ${_cnh.text} - categoria $_cnhCategory', style: AppText.body),
              Text('Validade ${_cnhExpiry.text}', style: AppText.body),
              const AppDivider(),
              Text('VEICULO', style: AppText.label.copyWith(color: AppColors.textFaint)),
              const SizedBox(height: Spacing.sm),
              Text(driver.vehicle?.description ?? '-', style: AppText.body),
              Text(
                '${driver.vehicle?.color ?? ''} - ${driver.vehicle?.plate ?? ''}',
                style: AppText.body,
              ),
            ],
          ),
        ),
        const SizedBox(height: Spacing.md),
        AppCard(
          child: Row(
            children: [
              const Icon(Icons.info_outline, color: AppColors.info, size: 20),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: Text(
                  'Na próxima etapa você envia os documentos obrigatórios.',
                  style: AppText.caption.copyWith(color: AppColors.textMuted),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: Spacing.lg),
        AppButton(label: 'Enviar documentos', loading: _enviando, onPressed: _finish),
        const SizedBox(height: Spacing.sm),
        AppButton(label: 'Voltar', variant: AppButtonVariant.ghost, onPressed: () => setState(() => _step = 1)),
      ],
    );
  }
}
