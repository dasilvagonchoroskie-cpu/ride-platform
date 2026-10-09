import 'package:flutter/material.dart';

import '../core/theme/central_theme.dart';
import '../data/painel.dart';
import 'comuns.dart';
import 'foto.dart';

/// Carros do motorista no cadastro dele (Evandro, 09/10/2026: "o motorista
/// comprou mais um carro ou trocou de carro, para atualizar os dados — isso
/// nao pode deixar a desejar").
///
/// A Central ve todos os carros com a situacao, confere o carro novo que o
/// motorista mandou pelo aplicativo (foto e CRLV), cadastra outro carro,
/// troca o carro em uso, corrige os dados e tira um carro.
class CarrosDoMotorista extends StatefulWidget {
  const CarrosDoMotorista({super.key, required this.driverId, required this.api, this.depois});

  final String driverId;
  final PainelApi api;

  /// Avisa o cadastro para recarregar (o carro em uso aparece no topo).
  final VoidCallback? depois;

  @override
  State<CarrosDoMotorista> createState() => _CarrosDoMotoristaState();
}

class _CarrosDoMotoristaState extends State<CarrosDoMotorista> {
  List<CarroDoMotorista>? _carros;
  String? _erro;
  bool _ocupado = false;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    try {
      final r = await widget.api.carrosDoMotorista(widget.driverId);
      if (!mounted) return;
      setState(() {
        _carros = r;
        _erro = null;
      });
    } catch (e) {
      if (mounted) setState(() => _erro = mensagemDe(e));
    }
  }

  /// Roda a acao, mostra o aviso e troca a lista pela que o servidor devolveu.
  Future<void> _fazer(Future<List<CarroDoMotorista>> Function() acao, String sucesso) async {
    setState(() => _ocupado = true);
    try {
      final r = await acao();
      if (!mounted) return;
      setState(() => _carros = r);
      avisar(context, sucesso);
      widget.depois?.call();
    } catch (e) {
      if (mounted) avisar(context, mensagemDe(e), erro: true);
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _novo() async {
    final dados = await formularioDoCarro(context, titulo: 'Cadastrar outro carro');
    if (dados == null || !mounted) return;
    await _fazer(() => widget.api.cadastrarCarro(widget.driverId, dados), 'Carro cadastrado (já conferido pela Central).');
  }

  Future<void> _editar(CarroDoMotorista c) async {
    final dados = await formularioDoCarro(context, titulo: 'Corrigir ${c.nome}', carro: c);
    if (dados == null || !mounted) return;
    await _fazer(() => widget.api.editarCarro(c.id, dados), 'Dados do carro salvos.');
  }

  Future<void> _recusar(CarroDoMotorista c) async {
    final motivo = await pedirTexto(
      context,
      titulo: 'Recusar ${c.nome}',
      rotulo: 'Motivo (o motorista vê)',
      explicacao: 'Ex.: CRLV ilegível, foto sem a placa, carro diferente do documento.',
      confirmar: 'Recusar',
    );
    if (motivo == null || !mounted) return;
    await _fazer(() => widget.api.revisarCarro(c.id, false, motivo), 'Carro recusado. O motorista vê o motivo.');
  }

  Future<void> _remover(CarroDoMotorista c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Tirar ${c.nome} (${c.placaBonita})?'),
        content: Text(
          '${c.emUso ? 'É o carro em uso: se o motorista tiver outro carro conferido, ele passa a ser o de uso; senão, o motorista fica sem carro e não consegue ficar disponível.\n\n' : ''}'
          'As corridas já feitas com este carro continuam no histórico.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancelar')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Tirar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await _fazer(() => widget.api.removerCarro(c.id), 'Carro tirado.');
  }

  Future<void> _foto(CarroDoMotorista c, String tipo) async {
    final foto = await escolherFoto(context, titulo: tipo == 'FOTO' ? 'Foto do carro (de frente, com a placa)' : 'Foto do CRLV');
    if (foto == null || !mounted) return;
    await _fazer(() => widget.api.fotoDoCarro(c.id, tipo, foto.mime, foto.base64), tipo == 'FOTO' ? 'Foto do carro salva.' : 'CRLV salvo.');
  }

  @override
  Widget build(BuildContext context) {
    final carros = _carros;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_erro != null)
          Text('Não carregou os carros: $_erro', style: AppText.caption.copyWith(color: AppColors.danger))
        else if (carros == null)
          const LinearProgressIndicator()
        else if (carros.isEmpty)
          Text('Nenhum carro. Sem carro em uso o motorista não fica disponível.', style: AppText.caption.copyWith(color: AppColors.warning)),
        for (final c in carros ?? const <CarroDoMotorista>[]) _Carro(
          carro: c,
          ocupado: _ocupado,
          aprovar: () => _fazer(() => widget.api.revisarCarro(c.id, true), 'Carro aprovado. O motorista já pode usar.'),
          recusar: () => _recusar(c),
          usar: () => _fazer(() => widget.api.usarCarro(c.id), '${c.nome} agora é o carro em uso.'),
          editar: () => _editar(c),
          remover: () => _remover(c),
          foto: (tipo) => _foto(c, tipo),
        ),
        if (_ocupado) const Padding(padding: EdgeInsets.only(top: Spacing.sm), child: LinearProgressIndicator()),
        const SizedBox(height: Spacing.sm),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: _ocupado ? null : _novo,
            icon: const Icon(Icons.add),
            label: const Text('Cadastrar outro carro'),
          ),
        ),
      ],
    );
  }
}

class _Carro extends StatelessWidget {
  const _Carro({
    required this.carro,
    required this.ocupado,
    required this.aprovar,
    required this.recusar,
    required this.usar,
    required this.editar,
    required this.remover,
    required this.foto,
  });

  final CarroDoMotorista carro;
  final bool ocupado;
  final VoidCallback aprovar;
  final VoidCallback recusar;
  final VoidCallback usar;
  final VoidCallback editar;
  final VoidCallback remover;
  final void Function(String tipo) foto;

  @override
  Widget build(BuildContext context) {
    final c = carro;
    final cor = switch (c.situacao) {
      'EM_USO' => AppColors.success,
      'PENDENTE' => AppColors.warning,
      'RECUSADO' => AppColors.danger,
      _ => AppColors.textMuted,
    };
    return Container(
      margin: const EdgeInsets.only(bottom: Spacing.sm),
      padding: const EdgeInsets.all(Spacing.md),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(Radii.md),
        border: Border.all(color: c.paraConferir ? AppColors.warning : AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c.nome.isEmpty ? 'Carro' : c.nome, style: AppText.bodyStrong),
                    Text('${c.ano} · ${c.cor} · ${c.placaBonita}', style: AppText.caption.copyWith(color: AppColors.textMuted)),
                    Text(c.rotuloSituacao, style: AppText.caption.copyWith(color: cor, fontWeight: FontWeight.w600)),
                    if (c.motivo != null) Text('Motivo: ${c.motivo}', style: AppText.caption.copyWith(color: AppColors.danger)),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                tooltip: 'Mais opções',
                enabled: !ocupado,
                onSelected: (v) {
                  switch (v) {
                    case 'editar':
                      editar();
                    case 'foto':
                      foto('FOTO');
                    case 'crlv':
                      foto('CRLV');
                    default:
                      remover();
                  }
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'editar', child: Text('Corrigir dados')),
                  PopupMenuItem(value: 'foto', child: Text('Foto do carro')),
                  PopupMenuItem(value: 'crlv', child: Text('Foto do CRLV')),
                  PopupMenuItem(value: 'remover', child: Text('Tirar este carro')),
                ],
              ),
            ],
          ),
          if (c.fotoUrl != null || c.crlvUrl != null) ...[
            const SizedBox(height: Spacing.sm),
            Wrap(
              spacing: Spacing.sm,
              children: [
                if (c.fotoUrl != null) _Miniatura(rotulo: 'Carro', caminho: c.fotoUrl!),
                if (c.crlvUrl != null) _Miniatura(rotulo: 'CRLV', caminho: c.crlvUrl!),
              ],
            ),
          ],
          if (c.paraConferir || (!c.emUso && c.situacao == 'GUARDADO')) ...[
            const SizedBox(height: Spacing.xs),
            Wrap(
              spacing: Spacing.sm,
              children: [
                if (c.paraConferir) ...[
                  FilledButton(onPressed: ocupado ? null : aprovar, child: const Text('Aprovar carro')),
                  TextButton(
                    onPressed: ocupado ? null : recusar,
                    child: const Text('Recusar', style: TextStyle(color: AppColors.danger)),
                  ),
                ],
                if (c.situacao == 'GUARDADO') OutlinedButton(onPressed: ocupado ? null : usar, child: const Text('Usar este carro')),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _Miniatura extends StatelessWidget {
  const _Miniatura({required this.rotulo, required this.caminho});

  final String rotulo;
  final String caminho;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        FotoDoServidor(caminho: caminho, largura: 96, altura: 72),
        Text(rotulo, style: AppText.caption.copyWith(color: AppColors.textMuted)),
      ],
    );
  }
}

/// Formulario do carro (placa, marca, modelo, ano e cor). Devolve os dados
/// prontos para o servidor, ou null se cancelou.
Future<Map<String, dynamic>?> formularioDoCarro(BuildContext context, {required String titulo, CarroDoMotorista? carro}) {
  final placa = TextEditingController(text: carro?.placa ?? '');
  final marca = TextEditingController(text: carro?.marca ?? '');
  final modelo = TextEditingController(text: carro?.modelo ?? '');
  final ano = TextEditingController(text: carro == null ? '' : '${carro.ano}');
  final cor = TextEditingController(text: carro?.cor ?? '');
  String? erro;
  return showDialog<Map<String, dynamic>>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) {
        Widget campo(String rotulo, TextEditingController c, {TextInputType? teclado, TextCapitalization caps = TextCapitalization.words, String? dica}) =>
            Padding(
              padding: const EdgeInsets.only(bottom: Spacing.sm),
              child: TextField(
                controller: c,
                keyboardType: teclado,
                textCapitalization: caps,
                decoration: InputDecoration(labelText: rotulo, hintText: dica),
              ),
            );
        return AlertDialog(
          title: Text(titulo),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                campo('Placa', placa, caps: TextCapitalization.characters, dica: 'ABC1D23'),
                campo('Marca', marca, dica: 'Ex.: Chevrolet'),
                campo('Modelo', modelo, dica: 'Ex.: Onix'),
                campo('Ano', ano, teclado: TextInputType.number),
                campo('Cor', cor),
                if (erro != null) Text(erro!, style: AppText.caption.copyWith(color: AppColors.danger)),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () {
                final p = placa.text.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
                final a = int.tryParse(ano.text.trim());
                String? problema;
                if (!RegExp(r'^[A-Z]{3}\d[A-Z0-9]\d{2}$').hasMatch(p)) {
                  problema = 'Placa inválida (ABC1234 ou ABC1D23).';
                } else if (marca.text.trim().isEmpty || modelo.text.trim().isEmpty || cor.text.trim().isEmpty) {
                  problema = 'Preencha marca, modelo e cor.';
                } else if (a == null || a < 1990 || a > DateTime.now().year + 1) {
                  problema = 'Ano inválido.';
                }
                if (problema != null) {
                  setState(() => erro = problema);
                  return;
                }
                Navigator.of(ctx).pop({
                  'plate': p,
                  'brand': marca.text.trim(),
                  'model': modelo.text.trim(),
                  'year': a,
                  'color': cor.text.trim(),
                });
              },
              child: const Text('Salvar'),
            ),
          ],
        );
      },
    ),
  );
}
