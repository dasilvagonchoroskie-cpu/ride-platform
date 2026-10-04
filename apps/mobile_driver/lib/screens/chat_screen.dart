import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api/api_client.dart';
import '../core/theme/app_theme.dart';

/// Conversa da corrida entre passageiro e motorista (modelo Pop Move).
/// Pergunta ao servidor a cada 3 segundos; ao abrir, as mensagens do
/// outro lado ficam como lidas.
class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    required this.api,
    required this.caminho,
    required this.titulo,
    required this.atalhos,
  });

  final ApiClient api;

  /// Ex.: `/rides/ID/messages` ou `/driver/rides/ID/messages`.
  final String caminho;
  final String titulo;

  /// Respostas prontas para tocar e mandar.
  final List<String> atalhos;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _Mensagem {
  _Mensagem(this.id, this.minha, this.texto, this.hora, this.lida);
  final String id;
  final bool minha;
  final String texto;
  final DateTime hora;
  final bool lida;
}

class _ChatScreenState extends State<ChatScreen> {
  final _texto = TextEditingController();
  final _rolagem = ScrollController();
  Timer? _relogio;
  List<_Mensagem> _lista = [];
  bool _carregando = true;
  bool _enviando = false;
  bool _aberta = true;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _carregar();
    _relogio = Timer.periodic(const Duration(seconds: 3), (_) => _carregar());
  }

  @override
  void dispose() {
    _relogio?.cancel();
    _texto.dispose();
    _rolagem.dispose();
    super.dispose();
  }

  Future<void> _carregar() async {
    try {
      final r = await widget.api.request('GET', widget.caminho) as Map<String, dynamic>;
      final itens = (r['items'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map((m) => _Mensagem(
                m['id'] as String? ?? '',
                m['minha'] == true,
                m['texto'] as String? ?? '',
                DateTime.tryParse(m['criadaEm'] as String? ?? '')?.toLocal() ?? DateTime.now(),
                m['lida'] == true,
              ))
          .toList();
      if (!mounted) return;
      final cresceu = itens.length != _lista.length;
      setState(() {
        _lista = itens;
        _aberta = r['podeEscrever'] != false;
        _carregando = false;
        _erro = null;
      });
      if (cresceu) _descer();
    } on ApiException catch (e) {
      if (mounted) setState(() { _erro = e.message; _carregando = false; });
    } catch (_) {
      if (mounted) setState(() { _erro = 'Sem conexão. Tentando de novo...'; _carregando = false; });
    }
  }

  void _descer() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_rolagem.hasClients) _rolagem.jumpTo(_rolagem.position.maxScrollExtent);
    });
  }

  Future<void> _enviar(String texto) async {
    final t = texto.trim();
    if (t.isEmpty || _enviando) return;
    setState(() => _enviando = true);
    try {
      await widget.api.request('POST', widget.caminho, body: {'texto': t});
      _texto.clear();
      await _carregar();
    } on ApiException catch (e) {
      if (mounted) setState(() => _erro = e.message);
    } catch (_) {
      if (mounted) setState(() => _erro = 'Sem conexão. A mensagem não foi enviada.');
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  String _hora(DateTime d) => '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.titulo)),
      body: Column(
        children: [
          if (_erro != null)
            Container(
              width: double.infinity,
              color: AppColors.danger.withValues(alpha: 0.12),
              padding: const EdgeInsets.all(Spacing.sm),
              child: Text(_erro!, textAlign: TextAlign.center, style: AppText.caption.copyWith(color: AppColors.danger)),
            ),
          Expanded(
            child: _carregando
                ? const Center(child: CircularProgressIndicator())
                : _lista.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(Spacing.xl),
                          child: Text(
                            'Nenhuma mensagem ainda.\nUse as respostas prontas ou escreva abaixo.',
                            textAlign: TextAlign.center,
                            style: AppText.body.copyWith(color: AppColors.textMuted),
                          ),
                        ),
                      )
                    : ListView.builder(
                        controller: _rolagem,
                        padding: const EdgeInsets.all(Spacing.md),
                        itemCount: _lista.length,
                        itemBuilder: (_, i) {
                          final m = _lista[i];
                          return Align(
                            alignment: m.minha ? Alignment.centerRight : Alignment.centerLeft,
                            child: Container(
                              constraints: const BoxConstraints(maxWidth: 280),
                              margin: const EdgeInsets.only(bottom: Spacing.sm),
                              padding: const EdgeInsets.symmetric(horizontal: Spacing.md, vertical: Spacing.sm),
                              decoration: BoxDecoration(
                                color: m.minha ? AppColors.brand : AppColors.surface,
                                border: m.minha ? null : Border.all(color: AppColors.border),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(m.texto, style: AppText.body.copyWith(color: m.minha ? Colors.white : AppColors.text)),
                                  const SizedBox(height: 2),
                                  Text(
                                    m.minha ? '${_hora(m.hora)}${m.lida ? ' · lida' : ''}' : _hora(m.hora),
                                    style: AppText.caption.copyWith(
                                      fontSize: 11,
                                      color: m.minha ? Colors.white70 : AppColors.textMuted,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
          ),
          if (_aberta) ...[
            SizedBox(
              height: 48,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: Spacing.md),
                children: [
                  for (final a in widget.atalhos)
                    Padding(
                      padding: const EdgeInsets.only(right: Spacing.sm),
                      child: ActionChip(label: Text(a), onPressed: _enviando ? null : () => _enviar(a)),
                    ),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(Spacing.md, Spacing.xs, Spacing.sm, Spacing.sm),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _texto,
                        maxLength: 500,
                        minLines: 1,
                        maxLines: 4,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: const InputDecoration(hintText: 'Escreva a mensagem', counterText: ''),
                        onSubmitted: _enviar,
                      ),
                    ),
                    IconButton.filled(
                      tooltip: 'Enviar',
                      onPressed: _enviando ? null : () => _enviar(_texto.text),
                      icon: const Icon(Icons.send),
                    ),
                  ],
                ),
              ),
            ),
          ] else
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(Spacing.md),
                child: Text(
                  'A conversa fica aberta só enquanto a corrida está em andamento.',
                  textAlign: TextAlign.center,
                  style: AppText.caption.copyWith(color: AppColors.textMuted),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
