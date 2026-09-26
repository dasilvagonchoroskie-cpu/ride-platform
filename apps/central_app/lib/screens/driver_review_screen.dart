import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme/central_theme.dart';
import '../core/utils/formatters.dart';
import '../data/models/central_models.dart';
import '../state/central_state.dart';
import '../widgets/ui.dart';

/// Analise do cadastro: documentos enviados + Aprovar / Rejeitar.
class DriverReviewScreen extends StatefulWidget {
  const DriverReviewScreen({super.key, required this.application});

  final DriverApplication application;

  @override
  State<DriverReviewScreen> createState() => _DriverReviewScreenState();
}

class _DriverReviewScreenState extends State<DriverReviewScreen> {
  bool _busy = false;

  Future<void> _approve() async {
    // Enquanto o envio de fotos nao existe, a aprovacao e por conferencia
    // PRESENCIAL dos documentos — e fica registrada no servidor.
    final conferencia = await showDialog<String>(
      context: context,
      builder: (_) => _ConferenciaPresencial(nome: widget.application.name),
    );
    if (conferencia == null || !mounted) return;
    setState(() => _busy = true);
    final ok = await context
        .read<CentralState>()
        .approveDriver(widget.application, conferencia: conferencia);
    if (!mounted) return;
    setState(() => _busy = false);

    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${widget.application.name} aprovado.',
            style: AppText.body.copyWith(color: AppColors.text),
          ),
          backgroundColor: AppColors.primary,
        ),
      );
      Navigator.of(context).pop();
    }
  }

  Future<void> _reject() async {
    final reason = await showDialog<String>(
      context: context,
      builder: (_) => const _RejectDialog(),
    );

    if (reason == null || !mounted) return;

    setState(() => _busy = true);
    final ok = await context.read<CentralState>().rejectDriver(widget.application, reason);
    if (!mounted) return;
    setState(() => _busy = false);

    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${widget.application.name} rejeitado.',
            style: AppText.body.copyWith(color: AppColors.text),
          ),
          backgroundColor: AppColors.danger,
        ),
      );
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final application = widget.application;
    final tablet = MediaQuery.of(context).size.width >= 900;
    final alertas = application.divergencias;

    final details = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Alerta em vermelho: so aparece quando ha algo para conferir.
        // Nao trava a aprovacao — e um aviso para o administrador olhar
        // antes de decidir, nao uma trava automatica.
        if (alertas.isNotEmpty) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(Spacing.md),
            decoration: BoxDecoration(
              color: AppColors.danger.withValues(alpha: 0.12),
              border: Border.all(color: AppColors.danger),
              borderRadius: BorderRadius.circular(Radii.sm),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.warning_amber_rounded, size: 18, color: AppColors.danger),
                    const SizedBox(width: Spacing.xs),
                    Text(
                      'Confira antes de aprovar',
                      style: AppText.bodyStrong.copyWith(color: AppColors.danger),
                    ),
                  ],
                ),
                const SizedBox(height: Spacing.xs),
                for (final a in alertas)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text('• $a', style: AppText.body.copyWith(color: AppColors.danger)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: Spacing.lg),
        ],
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  AppAvatar(initials: application.initials, size: 52),
                  const SizedBox(width: Spacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(application.name, style: AppText.heading),
                        Text(
                          'Cadastro enviado em ${formatDateTime(application.submittedAt)}',
                          style: AppText.caption.copyWith(color: AppColors.textMuted),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const AppDivider(),
              _Row(label: 'CPF', value: application.cpf),
              _Row(label: 'Telefone', value: application.phone),
              _Row(label: 'E-mail', value: application.email),
              _Row(label: 'Cidade', value: application.city),
              const AppDivider(),
              _Row(
                label: 'CNH',
                value: '${application.cnhNumber} - categoria ${application.cnhCategory}',
              ),
              _Row(label: 'Validade da CNH', value: application.cnhExpiresAt),
              const AppDivider(),
              _Row(label: 'Veiculo', value: application.vehicle.description),
              _Row(label: 'Cor', value: application.vehicle.color),
              _Row(label: 'Placa', value: application.vehicle.plate),
            ],
          ),
        ),
        const SizedBox(height: Spacing.lg),
        const SectionTitle(text: 'Documentos enviados'),
        AppCard(
          child: Column(
            children: [
              for (final document in application.documents)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: Spacing.xs),
                  child: Row(
                    children: [
                      Container(
                        height: 52,
                        width: 68,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.surfaceElevated,
                          border: Border.all(color: AppColors.border),
                          borderRadius: BorderRadius.circular(Radii.sm),
                        ),
                        child: Icon(
                          document.type == DocumentType.profilePhoto
                              ? Icons.person_outline
                              : Icons.image_outlined,
                          color: AppColors.textFaint,
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: Spacing.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(document.type.label, style: AppText.bodyStrong),
                            if (document.rejectionReason != null)
                              Text(
                                document.rejectionReason!,
                                style: AppText.caption.copyWith(color: AppColors.danger),
                              ),
                          ],
                        ),
                      ),
                      AppBadge(
                        text: document.status.name.toUpperCase(),
                        tone: document.isApproved
                            ? AppBadgeTone.success
                            : document.isRejected
                                ? AppBadgeTone.danger
                                : AppBadgeTone.warning,
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        if (!application.documentsComplete) ...[
          const SizedBox(height: Spacing.md),
          AppCard(
            child: Row(
              children: [
                const Icon(Icons.info_outline, color: AppColors.warning, size: 20),
                const SizedBox(width: Spacing.md),
                Expanded(
                  child: Text(
                    'Existem documentos pendentes ou rejeitados. A aprovacao sera recusada ate que todos estejam validos.',
                    style: AppText.caption.copyWith(color: AppColors.textMuted),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );

    final actions = AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('DECISAO', style: AppText.label.copyWith(color: AppColors.textFaint)),
          const SizedBox(height: Spacing.md),
          AppButton(
            label: 'Aprovar motorista',
            variant: AppButtonVariant.approve,
            icon: Icons.check_circle_outline,
            loading: _busy,
            onPressed: _approve,
          ),
          const SizedBox(height: Spacing.sm),
          AppButton(
            label: 'Rejeitar',
            variant: AppButtonVariant.danger,
            icon: Icons.cancel_outlined,
            enabled: !_busy,
            onPressed: _reject,
          ),
        ],
      ),
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Analise do cadastro')),
      body: SafeArea(
        child: tablet
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 3,
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(Spacing.lg),
                      child: details,
                    ),
                  ),
                  SizedBox(
                    width: 340,
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(Spacing.lg),
                      child: actions,
                    ),
                  ),
                ],
              )
            : SingleChildScrollView(
                padding: const EdgeInsets.all(Spacing.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    details,
                    const SizedBox(height: Spacing.lg),
                    actions,
                    const SizedBox(height: Spacing.lg),
                  ],
                ),
              ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Spacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(label, style: AppText.caption.copyWith(color: AppColors.textMuted)),
          ),
          Expanded(
            child: Text(value, style: AppText.bodyStrong.copyWith(fontSize: 14)),
          ),
        ],
      ),
    );
  }
}

/// Dialogo de rejeicao com campo de motivo.
class _RejectDialog extends StatefulWidget {
  const _RejectDialog();

  @override
  State<_RejectDialog> createState() => _RejectDialogState();
}

class _RejectDialogState extends State<_RejectDialog> {
  final _reason = TextEditingController();
  String? _error;

  static const List<String> _suggestions = [
    'Documento ilegivel',
    'CNH vencida',
    'Dados divergentes',
    'Veiculo reprovado',
  ];

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: AppColors.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg)),
      title: Text('Rejeitar cadastro', style: AppText.heading),
      content: SizedBox(
        width: 380,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Descreva o motivo. O motorista recebe a justificativa para corrigir e reenviar.',
              style: AppText.caption.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: Spacing.md),
            AppField(
              label: 'Motivo da rejeicao',
              hint: 'Ex.: CNH vencida',
              controller: _reason,
              maxLength: 300,
              error: _error,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: Spacing.sm),
            Wrap(
              spacing: Spacing.sm,
              runSpacing: Spacing.sm,
              children: [
                for (final suggestion in _suggestions)
                  GestureDetector(
                    onTap: () {
                      _reason.text = suggestion;
                      setState(() {});
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: Spacing.md,
                        vertical: Spacing.sm,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        border: Border.all(color: AppColors.border),
                        borderRadius: BorderRadius.circular(Radii.pill),
                      ),
                      child: Text(
                        suggestion,
                        style: AppText.caption.copyWith(color: AppColors.textMuted),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          style: TextButton.styleFrom(foregroundColor: AppColors.textMuted),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: () {
            if (_reason.text.trim().length < 3) {
              setState(() => _error = 'Informe ao menos 3 caracteres.');
              return;
            }
            Navigator.of(context).pop(_reason.text.trim());
          },
          style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
          child: const Text('Confirmar rejeicao'),
        ),
      ],
    );
  }
}

/// Confirmacao do que foi conferido PESSOALMENTE antes de aprovar.
///
/// Os itens seguem a Lei 13.640/2018 (transporte por aplicativo): CNH com
/// EAR, CRLV em dia e certidao negativa de antecedentes criminais — mais a
/// vistoria do veiculo. Todos precisam estar marcados para aprovar.
class _ConferenciaPresencial extends StatefulWidget {
  const _ConferenciaPresencial({required this.nome});

  final String nome;

  @override
  State<_ConferenciaPresencial> createState() => _ConferenciaPresencialState();
}

class _ConferenciaPresencialState extends State<_ConferenciaPresencial> {
  static const _itens = [
    'CNH original, válida e com a observação EAR',
    'Documento do veículo (CRLV) em dia',
    'Certidão negativa de antecedentes criminais',
    'Vi o veículo e a placa confere com o cadastro',
  ];
  final _marcados = List<bool>.filled(_itens.length, false);
  final _obs = TextEditingController();

  @override
  void dispose() {
    _obs.dispose();
    super.dispose();
  }

  bool get _tudoConferido => _marcados.every((m) => m);

  void _aprovar() {
    final obs = _obs.text.trim();
    Navigator.of(context).pop(
      'Conferencia presencial: CNH com EAR, CRLV em dia, certidao negativa '
      'de antecedentes e vistoria do veiculo.${obs.isEmpty ? '' : ' Obs: $obs'}',
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Conferência presencial'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Marque o que você conferiu pessoalmente de ${widget.nome}. '
              'Fica registrado quem aprovou, quando e o que foi conferido.',
            ),
            const SizedBox(height: 8),
            for (var i = 0; i < _itens.length; i++)
              CheckboxListTile(
                value: _marcados[i],
                onChanged: (v) => setState(() => _marcados[i] = v ?? false),
                title: Text(_itens[i]),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
              ),
            TextField(
              controller: _obs,
              maxLength: 200,
              decoration: const InputDecoration(labelText: 'Observação (opcional)'),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancelar')),
        FilledButton(
          onPressed: _tudoConferido ? _aprovar : null,
          child: const Text('Aprovar'),
        ),
      ],
    );
  }
}
