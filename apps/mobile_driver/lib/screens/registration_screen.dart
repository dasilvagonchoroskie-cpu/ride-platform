import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/avisos.dart';
import '../core/central.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../state/driver_state.dart';
import '../widgets/painel_ui.dart';
import 'vehicles_screen.dart';

/// Cadastro: o motorista confere, etapa por etapa, o que esta registrado.
/// Correcoes passam pela Central, que confere os documentos pessoalmente.
class RegistrationScreen extends StatefulWidget {
  const RegistrationScreen({super.key});

  @override
  State<RegistrationScreen> createState() => _RegistrationScreenState();
}

class _RegistrationScreenState extends State<RegistrationScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<DriverState>().sincronizarCadastro();
    });
  }

  void _ir(Widget tela) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => tela));

  /// Excluir a propria conta na hora (exigencia da Google Play; antes so
  /// mandava um pedido pelo WhatsApp). Pede para escrever EXCLUIR.
  Future<void> _excluirConta() async {
    final driver = context.read<DriverState>();
    final saldo = driver.carteira?.balanceCents ?? 0;
    final escrito = TextEditingController();
    final confirmou = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Excluir minha conta'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Apaga seu cadastro de motorista: dados pessoais, CNH, fotos dos documentos, carros, '
                'carteira e extrato. As corridas já feitas ficam guardadas sem o seu nome (obrigação fiscal).'
                '${saldo > 0 ? '\n\nVocê tem ${dinheiro(saldo)} na carteira: esse saldo é perdido. Peça o saque antes, se quiser.' : ''}'
                '\n\nNão dá para desfazer.',
              ),
              const SizedBox(height: Spacing.md),
              const Text('Escreva EXCLUIR para confirmar'),
              TextField(controller: escrito, textCapitalization: TextCapitalization.characters),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(escrito.text.trim().toUpperCase() == 'EXCLUIR'),
            child: const Text('Excluir conta', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (confirmou != true || !mounted) {
      if (confirmou == false && escrito.text.isNotEmpty) avisar('Não excluiu: escreva EXCLUIR para confirmar.');
      return;
    }
    final ok = await driver.excluirConta();
    if (!mounted || !ok) return;
    avisar('Sua conta foi excluída.');
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('Cadastro')),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Spacing.xl, Spacing.xl, Spacing.xl, Spacing.md),
              child: Text(
                'Você pode conferir os dados de cada etapa do seu cadastro.',
                style: AppText.body.copyWith(color: AppColors.textMuted, fontSize: 17),
              ),
            ),
            _Etapa(numero: 1, titulo: 'Dados pessoais', onTap: () => _ir(const PersonalDataScreen())),
            _Etapa(numero: 2, titulo: 'Veículo', onTap: () => _ir(const VehiclesScreen())),
            _Etapa(numero: 3, titulo: 'Documentos', onTap: () => _ir(const DocumentsInfoScreen())),
            const Spacer(),
            TextButton(
              onPressed: _excluirConta,
              child: Text(
                'Excluir conta',
                style: AppText.heading.copyWith(color: AppColors.danger, fontSize: 19),
              ),
            ),
            const SizedBox(height: Spacing.xl),
          ],
        ),
      ),
    );
  }
}

class _Etapa extends StatelessWidget {
  const _Etapa({required this.numero, required this.titulo, required this.onTap});

  final int numero;
  final String titulo;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Spacing.xl, vertical: Spacing.md),
        child: Row(
          children: [
            Container(
              width: 60,
              height: 60,
              alignment: Alignment.center,
              decoration: const BoxDecoration(color: AppColors.brandSoft, shape: BoxShape.circle),
              child: Text(
                '$numero',
                style: AppText.title.copyWith(color: AppColors.brand, fontSize: 28, fontWeight: FontWeight.w500),
              ),
            ),
            const SizedBox(width: Spacing.xl),
            Expanded(child: Text(titulo, style: AppText.title.copyWith(fontSize: 22))),
            const Icon(Icons.chevron_right, color: AppColors.brand, size: 32),
          ],
        ),
      ),
    );
  }
}

String _data(dynamic iso) {
  final d = DateTime.tryParse('${iso ?? ''}');
  if (d == null) return '';
  return '${d.day} de ${mesesCurtos[d.month - 1]} de ${d.year}';
}

String _cpf(String? c) {
  final s = (c ?? '').replaceAll(RegExp(r'\D'), '');
  if (s.length != 11) return s;
  return '${s.substring(0, 3)}.${s.substring(3, 6)}.${s.substring(6, 9)}-${s.substring(9)}';
}

String _telefone(String? t) {
  var s = (t ?? '').replaceAll(RegExp(r'\D'), '');
  if (s.startsWith('55') && s.length > 11) s = s.substring(2);
  return formatPhoneInput(s);
}

/// Etapa 1: dados pessoais como estao no servidor (so leitura).
class PersonalDataScreen extends StatelessWidget {
  const PersonalDataScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final d = driver.dadosCadastro;
    final u = d?['user'] as Map<String, dynamic>?;
    final perfil = driver.profile;

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('Dados pessoais')),
      body: ListView(
        padding: const EdgeInsets.all(Spacing.xl),
        children: [
          CampoLeitura(rotulo: 'Nome completo', valor: (u?['name'] as String?) ?? perfil?.name ?? ''),
          CampoLeitura(rotulo: 'Data de nascimento', valor: _data(d?['birthDate'])),
          CampoLeitura(rotulo: 'CPF', valor: _cpf((d?['cpf'] as String?) ?? perfil?.cpf)),
          CampoLeitura(rotulo: 'Telefone', valor: _telefone((u?['phone'] as String?) ?? perfil?.phone)),
          CampoLeitura(rotulo: 'E-mail', valor: (u?['email'] as String?) ?? ''),
          CampoLeitura(rotulo: 'Chave Pix', valor: (d?['pixKey'] as String?) ?? ''),
          CampoLeitura(rotulo: 'Número da CNH', valor: (d?['cnhNumber'] as String?) ?? perfil?.cnhNumber ?? ''),
          Row(
            children: [
              Expanded(
                child: CampoLeitura(
                  rotulo: 'Categoria',
                  valor: (d?['cnhCategory'] as String?) ?? perfil?.cnhCategory ?? '',
                ),
              ),
              const SizedBox(width: Spacing.md),
              Expanded(
                flex: 2,
                child: CampoLeitura(
                  rotulo: 'Validade da CNH',
                  valor: _data(d?['cnhExpiresAt'] ?? perfil?.cnhExpiresAt),
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.sm),
          Text(
            'Algum dado errado? A correção é feita pela Central, que confere o documento.',
            style: AppText.body.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: Spacing.md),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            onPressed: () async {
              final contato = await driver.contatoCentral();
              await abrirWhatsApp(
                contato?.whatsapp,
                'Olá! Sou o motorista ${perfil?.name ?? ''} e preciso corrigir um dado do meu cadastro.',
              );
            },
            icon: const Icon(Icons.chat),
            label: const Text('Falar com a Central'),
          ),
        ],
      ),
    );
  }
}

/// Etapa 3: documentos. Hoje a conferencia e presencial na Central.
class DocumentsInfoScreen extends StatelessWidget {
  const DocumentsInfoScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final aprovado = driver.isApproved;
    final aprovadoEm = _data(driver.dadosCadastro?['approvedAt']);

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('Documentos')),
      body: ListView(
        padding: const EdgeInsets.all(Spacing.xl),
        children: [
          Row(
            children: [
              Icon(
                aprovado ? Icons.verified : Icons.schedule,
                color: aprovado ? AppColors.primary : AppColors.warning,
                size: 40,
              ),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      aprovado ? 'Documentos conferidos' : 'Aguardando conferência',
                      style: AppText.title.copyWith(fontSize: 21),
                    ),
                    if (aprovado && aprovadoEm.isNotEmpty)
                      Text('Aprovado em $aprovadoEm', style: AppText.body.copyWith(color: AppColors.textMuted)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.xl),
          Text(
            'Seus documentos são conferidos pessoalmente na Central: CNH com EAR '
            '(exerce atividade remunerada), documento do veículo (CRLV) e '
            'comprovante de endereço.',
            style: AppText.body.copyWith(fontSize: 17),
          ),
          const SizedBox(height: Spacing.md),
          Text(
            'Se trocar de veículo ou renovar a CNH, leve o documento novo à Central '
            'para continuar recebendo corridas.',
            style: AppText.body.copyWith(color: AppColors.textMuted, fontSize: 16),
          ),
        ],
      ),
    );
  }
}
