import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

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

  final _cpf = TextEditingController();

  final _nascimento = TextEditingController();
  final _cnh = TextEditingController();
  final _cnhExpiry = TextEditingController(text: '31/12/2030');
  String _cnhCategory = 'B';

  final _brand = TextEditingController(text: 'Toyota');
  final _model = TextEditingController(text: 'Corolla');
  final _year = TextEditingController(text: '2022');
  final _color = TextEditingController(text: 'Prata');
  final _plate = TextEditingController(text: 'ABC1D23');

  String? _error;

  @override
  void dispose() {
    for (final controller in [_cpf, _cnh, _cnhExpiry, _brand, _model, _year, _color, _plate]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _submitPersonal() async {
    if (onlyDigits(_cpf.text).length != 11) {
      setState(() => _error = 'Informe um CPF com 11 digitos.');
      return;
    }
    if (onlyDigits(_cnh.text).length != 11) {
      setState(() => _error = 'O numero da CNH tem 11 digitos.');
      return;
    }

    setState(() {
      _error = null;
      _step = 1;
    });
  }

  Future<void> _submitVehicle() async {
    if (_brand.text.trim().isEmpty || _model.text.trim().isEmpty) {
      setState(() => _error = 'Informe marca e modelo do veiculo.');
      return;
    }
    // BUG CORRIGIDO: a validacao anterior usava onlyDigits(), que remove as
    // LETRAS da placa — "ABC1D23" virava "123" e nunca passava no teste.
    // Agora normalizamos para alfanumerico e validamos os dois padroes:
    // antigo (ABC1234) e Mercosul (ABC1D23).
    final plate = normalizePlate(_plate.text);
    if (!isValidPlate(plate)) {
      setState(() => _error = 'Placa invalida. Use ABC1234 ou ABC1D23.');
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

  Future<void> _finish() async {
    final driver = context.read<DriverState>();

    await driver.completeOnboarding(
      birthDate: _nascimento.text,
      cpf: onlyDigits(_cpf.text),
      cnhNumber: onlyDigits(_cnh.text),
      cnhCategory: _cnhCategory,
      cnhExpiresAt: _cnhExpiry.text,
    );

    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const _DocumentsStep()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Cadastro do motorista'),
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

  Widget _personalStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Etapa 1 de 3', style: AppText.label.copyWith(color: AppColors.primary)),
        const SizedBox(height: Spacing.xs),
        Text('Seus dados', style: AppText.title),
        const SizedBox(height: Spacing.lg),
        AppField(label: 'CPF', hint: '000.000.000-00', controller: _cpf, keyboardType: TextInputType.number, onChanged: (_) => setState(() {})),
        const SizedBox(height: Spacing.md),
        AppField(label: 'Data de nascimento', hint: 'DD/MM/AAAA', controller: _nascimento, keyboardType: TextInputType.datetime, onChanged: (_) => setState(() {})),
        const SizedBox(height: Spacing.md),
        AppField(label: 'Numero da CNH', hint: '00000000000', controller: _cnh, keyboardType: TextInputType.number, onChanged: (_) => setState(() {})),
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
        AppField(label: 'Validade da CNH', hint: 'DD/MM/AAAA', controller: _cnhExpiry, onChanged: (_) => setState(() {})),
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
        Text('Seu veiculo', style: AppText.title),
        const SizedBox(height: Spacing.lg),
        const SizedBox(height: Spacing.sm),
        AppField(label: 'Marca', controller: _brand, onChanged: (_) => setState(() {})),
        const SizedBox(height: Spacing.md),
        AppField(label: 'Modelo', controller: _model, onChanged: (_) => setState(() {})),
        const SizedBox(height: Spacing.md),
        Row(
          children: [
            Expanded(child: AppField(label: 'Ano', controller: _year, keyboardType: TextInputType.number, onChanged: (_) => setState(() {}))),
            const SizedBox(width: Spacing.md),
            Expanded(child: AppField(label: 'Cor', controller: _color, onChanged: (_) => setState(() {}))),
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
                  'Na proxima etapa voce envia os documentos obrigatorios.',
                  style: AppText.caption.copyWith(color: AppColors.textMuted),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: Spacing.lg),
        AppButton(label: 'Enviar documentos', onPressed: _finish),
        const SizedBox(height: Spacing.sm),
        AppButton(label: 'Voltar', variant: AppButtonVariant.ghost, onPressed: () => setState(() => _step = 1)),
      ],
    );
  }
}

/// Envio dos documentos obrigatorios.
class _DocumentsStep extends StatelessWidget {
  const _DocumentsStep();

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Documentos')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Envie seus documentos', style: AppText.title),
              const SizedBox(height: Spacing.xs),
              Text(
                '${driver.documentsApproved} de ${driver.documentsTotal} aprovados',
                style: AppText.caption.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: Spacing.md),
              ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(
                  value: driver.documentsTotal == 0
                      ? 0
                      : driver.documentsApproved / driver.documentsTotal,
                  minHeight: 6,
                  backgroundColor: AppColors.border,
                  valueColor: const AlwaysStoppedAnimation(AppColors.primary),
                ),
              ),
              const SizedBox(height: Spacing.lg),
              for (final document in driver.documents)
                Padding(
                  padding: const EdgeInsets.only(bottom: Spacing.sm),
                  child: AppCard(
                    child: Row(
                      children: [
                        Icon(
                          document.isApproved
                              ? Icons.check_circle
                              : document.isRejected
                                  ? Icons.cancel
                                  : Icons.upload_file,
                          color: document.isApproved
                              ? AppColors.primary
                              : document.isRejected
                                  ? AppColors.danger
                                  : AppColors.textMuted,
                          size: 24,
                        ),
                        const SizedBox(width: Spacing.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(document.type.label, style: AppText.bodyStrong),
                              Text(
                                document.isApproved
                                    ? 'Aprovado'
                                    : document.isRejected
                                        ? (document.rejectionReason ?? 'Reprovado')
                                        : 'Pendente de envio',
                                style: AppText.caption.copyWith(
                                  color: document.isApproved
                                      ? AppColors.primary
                                      : document.isRejected
                                          ? AppColors.danger
                                          : AppColors.textMuted,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (!document.isApproved)
                          TextButton(
                            onPressed: () => context.read<DriverState>().uploadDocument(document.type),
                            style: TextButton.styleFrom(foregroundColor: AppColors.primary),
                            child: const Text('Enviar'),
                          ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Concluir cadastro',
                enabled: driver.documentsComplete,
                onPressed: () {
                  context.read<DriverState>().uploadDocument(DocumentType.profilePhoto);
                  Navigator.of(context).pop();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
