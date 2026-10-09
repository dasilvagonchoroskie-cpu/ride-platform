import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api/api_client.dart';
import '../core/theme/app_theme.dart';
import '../state/driver_state.dart';
import '../widgets/ui.dart';

/// Onde o passageiro baixa o app (trocar pelo link da Play Store quando
/// o app estiver na loja).
const String linkDoAppDoPassageiro =
    'https://github.com/dasilvagonchoroskie-cpu/ride-platform/releases/tag/apk-ride-passenger-mais-recente';

/// Corrida manual lancada pelo motorista (Evandro, 09/10/2026): passageiro
/// que chamou na rua ou ligou. Com conta: a corrida abre no nome dele. Sem
/// conta: abre pelo telefone e o motorista manda o app pelo WhatsApp.
/// A comissao da Central e cobrada igual.
class CorridaManualScreen extends StatefulWidget {
  const CorridaManualScreen({super.key});

  @override
  State<CorridaManualScreen> createState() => _CorridaManualScreenState();
}

class _CorridaManualScreenState extends State<CorridaManualScreen> {
  final TextEditingController _contato = TextEditingController();
  final TextEditingController _nome = TextEditingController();
  bool _ocupado = false;
  bool _procurou = false;
  bool _temConta = false;
  String? _primeiroNome;
  String? _erro;

  bool get _ehEmail => _contato.text.contains('@');

  @override
  void dispose() {
    _contato.dispose();
    _nome.dispose();
    super.dispose();
  }

  String _mensagem(Object e) =>
      e is ApiException ? e.message : 'Sem conexão com o servidor. Confira a internet e tente de novo.';

  Future<void> _procurar() async {
    if (_contato.text.trim().length < 5) {
      setState(() => _erro = 'Digite o telefone com DDD ou o e-mail do passageiro.');
      return;
    }
    setState(() {
      _ocupado = true;
      _erro = null;
    });
    try {
      final r = await context.read<DriverState>().buscarPassageiro(_contato.text);
      if (!mounted) return;
      setState(() {
        _procurou = true;
        _temConta = r.encontrado;
        _primeiroNome = r.primeiroNome;
      });
    } catch (e) {
      if (mounted) setState(() => _erro = _mensagem(e));
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _abrir() async {
    if (!_temConta && _nome.text.trim().length < 2) {
      setState(() => _erro = 'Digite o nome do passageiro.');
      return;
    }
    setState(() {
      _ocupado = true;
      _erro = null;
    });
    try {
      await context.read<DriverState>().lancarCorridaManual(
            contato: _contato.text,
            nome: _temConta ? null : _nome.text,
          );
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) setState(() => _erro = _mensagem(e));
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _mandarApp() async {
    var so = _contato.text.replaceAll(RegExp(r'\D'), '');
    if (!so.startsWith('55')) so = '55$so';
    final texto = 'Olá! Baixe o app Fortaleza Mov (passageiro) e crie sua conta com este telefone: '
        '$linkDoAppDoPassageiro\nAs suas corridas comigo já vão aparecer no seu histórico.';
    final abriu = await launchUrl(
      Uri.parse('https://wa.me/$so?text=${Uri.encodeComponent(texto)}'),
      mode: LaunchMode.externalApplication,
    );
    if (!abriu && mounted) setState(() => _erro = 'Não deu para abrir o WhatsApp neste celular.');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Corrida manual')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(Spacing.lg),
          children: [
            Text(
              'Passageiro que chamou na rua ou ligou para você. A corrida abre aqui no app, '
              'o valor sai pelo taxímetro e a taxa da Central é cobrada igual.',
              style: AppText.body.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: Spacing.lg),
            TextField(
              controller: _contato,
              enabled: !_ocupado,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(
                labelText: 'Telefone (com DDD) ou e-mail do passageiro',
                prefixIcon: Icon(Icons.person_search),
              ),
              onChanged: (_) => setState(() {
                _procurou = false;
                _erro = null;
              }),
            ),
            const SizedBox(height: Spacing.md),
            if (!_procurou) AppButton(label: 'Procurar passageiro', loading: _ocupado, onPressed: _procurar),
            if (_procurou && _temConta) ...[
              Card(
                child: ListTile(
                  leading: const Icon(Icons.verified_user, color: AppColors.primary),
                  title: Text(_primeiroNome ?? 'Passageiro'),
                  subtitle: const Text('Tem conta no Fortaleza Mov. A corrida vai aparecer no app dele.'),
                ),
              ),
              const SizedBox(height: Spacing.md),
              AppButton(label: 'Abrir corrida para ${_primeiroNome ?? 'o passageiro'}', loading: _ocupado, onPressed: _abrir),
            ],
            if (_procurou && !_temConta) ...[
              if (_ehEmail)
                Text(
                  'Não achamos conta com este e-mail. Use o telefone do passageiro.',
                  style: AppText.body.copyWith(color: AppColors.danger),
                )
              else ...[
                Text(
                  'Este telefone ainda não tem conta. Abra a corrida assim mesmo e, depois, '
                  'mande o app para o passageiro criar a conta com este número.',
                  style: AppText.body.copyWith(color: AppColors.textMuted),
                ),
                const SizedBox(height: Spacing.md),
                TextField(
                  controller: _nome,
                  enabled: !_ocupado,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(labelText: 'Nome do passageiro', prefixIcon: Icon(Icons.person)),
                ),
                const SizedBox(height: Spacing.md),
                AppButton(label: 'Abrir corrida', loading: _ocupado, onPressed: _abrir),
                const SizedBox(height: Spacing.sm),
                OutlinedButton.icon(
                  onPressed: _ocupado ? null : _mandarApp,
                  icon: const Icon(Icons.chat),
                  label: const Text('Mandar o app pelo WhatsApp'),
                ),
              ],
            ],
            if (_erro != null) ...[
              const SizedBox(height: Spacing.md),
              Text(_erro!, style: AppText.body.copyWith(color: AppColors.danger)),
            ],
          ],
        ),
      ),
    );
  }
}
