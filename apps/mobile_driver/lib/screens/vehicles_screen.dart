import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';
import '../core/central.dart';
import '../core/fotos.dart';
import '../core/theme/app_theme.dart';
import '../state/driver_state.dart';

/// Meus veiculos (Evandro, 09/10/2026: "o motorista comprou mais um carro ou
/// trocou de carro, para ele atualizar os dados — isso nao pode deixar a
/// desejar").
///
/// - Cadastrar outro carro (com foto do carro e do CRLV): a Central confere e
///   libera. Ate la ele continua trabalhando com o carro de agora.
/// - Trocar o carro em uso (um por vez), corrigir marca/modelo/ano/cor e
///   tirar um carro.
class VehiclesScreen extends StatefulWidget {
  const VehiclesScreen({super.key});

  @override
  State<VehiclesScreen> createState() => _VehiclesScreenState();
}

class _VehiclesScreenState extends State<VehiclesScreen> {
  bool _carregou = false;
  String? _ocupado;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _carregar());
  }

  Future<void> _carregar() async {
    await context.read<DriverState>().carregarCarros();
    if (mounted) setState(() => _carregou = true);
  }

  /// Roda a acao. Erros comuns o aplicativo ja mostra; o de conflito (ex.: em
  /// corrida) mostra aqui.
  Future<void> _fazer(String id, Future<void> Function() acao, String sucesso) async {
    setState(() => _ocupado = id);
    try {
      await acao();
      avisar(sucesso);
    } on ApiException catch (e) {
      if (e.statusCode == 409) avisar(e.message);
    } catch (_) {
      avisar('Sem conexão com o servidor.');
    } finally {
      if (mounted) setState(() => _ocupado = null);
    }
  }

  Future<void> _novo() async {
    final enviado = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const NovoCarroScreen()));
    if (enviado == true && mounted) await _carregar();
  }

  Future<void> _editar(Map<String, dynamic> v) async {
    final dados = await _formularioDeCorrecao(context, v);
    if (dados == null || !mounted) return;
    final driver = context.read<DriverState>();
    await _fazer('${v['id']}', () => driver.editarCarro('${v['id']}', dados), 'Dados do carro salvos.');
  }

  Future<void> _fotos(Map<String, dynamic> v) async {
    final driver = context.read<DriverState>();
    for (final (tipo, titulo) in [('FOTO', 'Foto do carro (de frente, com a placa)'), ('CRLV', 'Foto do CRLV do carro')]) {
      if (!mounted) return;
      final foto = await escolherFoto(context, titulo: titulo);
      if (foto == null || !mounted) continue;
      await _fazer('${v['id']}', () => driver.fotoDoCarro('${v['id']}', tipo, mime: foto.mime, base64: foto.base64),
          tipo == 'FOTO' ? 'Foto do carro enviada.' : 'CRLV enviado. A Central vai conferir.');
    }
  }

  Future<void> _tirar(Map<String, dynamic> v) async {
    final emUso = v['isActive'] == true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Tirar ${v['brand'] ?? ''} ${v['model'] ?? ''}?'),
        content: Text(emUso
            ? 'É o carro que você usa agora. Se tiver outro carro liberado, ele passa a ser o de uso; senão você não consegue ficar disponível até cadastrar outro.'
            : 'O carro sai da sua lista. As corridas já feitas continuam no histórico.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Voltar')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Tirar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final driver = context.read<DriverState>();
    await _fazer('${v['id']}', () => driver.tirarCarro('${v['id']}'), 'Carro tirado da sua lista.');
  }

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final lista = driver.veiculos;

    return Scaffold(
      appBar: AppBar(title: const Text('Meus veículos')),
      body: RefreshIndicator(
        onRefresh: _carregar,
        child: ListView(
          padding: const EdgeInsets.all(Spacing.lg),
          children: [
            if (!_carregou && lista.isEmpty) const LinearProgressIndicator(),
            if (_carregou && lista.isEmpty)
              Padding(
                padding: const EdgeInsets.all(Spacing.xl),
                child: Text(
                  'Nenhum veículo cadastrado. Sem carro em uso você não consegue ficar disponível.',
                  textAlign: TextAlign.center,
                  style: AppText.body.copyWith(color: AppColors.textMuted),
                ),
              ),
            for (final v in lista) ...[
              _Veiculo(
                dados: v,
                ocupado: _ocupado == '${v['id']}',
                usar: () => _fazer('${v['id']}', () => driver.usarCarro('${v['id']}'), 'Pronto: agora você trabalha com este carro.'),
                editar: () => _editar(v),
                fotos: () => _fotos(v),
                tirar: () => _tirar(v),
              ),
              const SizedBox(height: Spacing.md),
            ],
            FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              onPressed: _novo,
              icon: const Icon(Icons.add),
              label: const Text('Cadastrar outro carro'),
            ),
            const SizedBox(height: Spacing.sm),
            Text(
              'Comprou ou trocou de carro? Cadastre aqui com a foto do carro e do documento (CRLV). '
              'A Central confere e libera; até lá você continua com o carro de agora.',
              style: AppText.caption.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: Spacing.md),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52), backgroundColor: AppColors.surface),
              onPressed: () async {
                final contato = await driver.contatoCentral();
                await abrirWhatsApp(
                  contato?.whatsapp,
                  'Olá! Sou o motorista ${driver.profile?.name ?? ''} e preciso de ajuda com o meu veículo.',
                );
              },
              icon: const Icon(Icons.chat),
              label: const Text('Falar com a Central'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Veiculo extends StatelessWidget {
  const _Veiculo({
    required this.dados,
    required this.ocupado,
    required this.usar,
    required this.editar,
    required this.fotos,
    required this.tirar,
  });

  final Map<String, dynamic> dados;
  final bool ocupado;
  final VoidCallback usar;
  final VoidCallback editar;
  final VoidCallback fotos;
  final VoidCallback tirar;

  @override
  Widget build(BuildContext context) {
    final situacao = '${dados['situacao'] ?? (dados['isActive'] == true ? 'EM_USO' : 'GUARDADO')}';
    final placa = '${dados['plate'] ?? ''}'.toUpperCase();
    final placaFmt = placa.length == 7 ? '${placa.substring(0, 3)}-${placa.substring(3)}' : placa;
    final motivo = dados['motivo'] as String?;
    final (rotulo, cor) = switch (situacao) {
      'EM_USO' => ('Em uso', AppColors.primary),
      'PENDENTE' => ('Aguardando a Central conferir', AppColors.warning),
      'RECUSADO' => ('Recusado pela Central', AppColors.danger),
      _ => ('Guardado (liberado)', AppColors.textMuted),
    };
    final fotoUrl = dados['fotoUrl'] as String?;
    final semFotos = situacao == 'PENDENTE' && (dados['fotoUrl'] == null || dados['crlvUrl'] == null);

    return Container(
      padding: const EdgeInsets.all(Spacing.lg),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(Radii.sm),
        border: situacao == 'EM_USO' ? Border.all(color: AppColors.primary, width: 1.5) : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (fotoUrl != null && fotoUrl.startsWith('/'))
                FotoDoServidor(caminho: fotoUrl, tamanho: 56, reserva: const _IconeCarro())
              else
                const _IconeCarro(),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${dados['brand'] ?? ''} ${dados['model'] ?? ''}'.trim(),
                      style: AppText.heading.copyWith(fontSize: 18),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      '${dados['year'] ?? ''}  •  ${dados['color'] ?? ''}',
                      style: AppText.body.copyWith(color: AppColors.textMuted),
                    ),
                    const SizedBox(height: Spacing.xs),
                    Text(rotulo, style: AppText.caption.copyWith(color: cor, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: Spacing.sm, vertical: Spacing.xs),
                decoration: BoxDecoration(
                  border: Border.all(color: AppColors.text, width: 1.4),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(placaFmt, style: AppText.bodyStrong.copyWith(letterSpacing: 1.1)),
              ),
            ],
          ),
          if (motivo != null && situacao == 'RECUSADO')
            Padding(
              padding: const EdgeInsets.only(top: Spacing.sm),
              child: Text('Motivo: $motivo. Corrija os dados ou mande as fotos de novo.', style: AppText.caption.copyWith(color: AppColors.danger)),
            ),
          if (semFotos)
            Padding(
              padding: const EdgeInsets.only(top: Spacing.sm),
              child: Text(
                'Falta mandar ${dados['fotoUrl'] == null ? 'a foto do carro' : ''}${dados['fotoUrl'] == null && dados['crlvUrl'] == null ? ' e ' : ''}${dados['crlvUrl'] == null ? 'o CRLV' : ''}.',
                style: AppText.caption.copyWith(color: AppColors.warning),
              ),
            ),
          const SizedBox(height: Spacing.sm),
          if (ocupado)
            const LinearProgressIndicator()
          else
            Wrap(
              spacing: Spacing.sm,
              runSpacing: Spacing.xs,
              children: [
                if (situacao == 'GUARDADO') FilledButton(onPressed: usar, child: const Text('Usar este carro')),
                if (situacao == 'PENDENTE' || situacao == 'RECUSADO')
                  OutlinedButton.icon(onPressed: fotos, icon: const Icon(Icons.photo_camera_outlined), label: const Text('Mandar fotos')),
                TextButton(onPressed: editar, child: const Text('Corrigir dados')),
                TextButton(
                  onPressed: tirar,
                  child: const Text('Tirar', style: TextStyle(color: AppColors.danger)),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _IconeCarro extends StatelessWidget {
  const _IconeCarro();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 56,
      height: 56,
      decoration: const BoxDecoration(color: AppColors.brandSoft, shape: BoxShape.circle),
      child: const Icon(Icons.directions_car, color: AppColors.brand, size: 30),
    );
  }
}

/// Corrigir marca, modelo, ano e cor (outra placa = outro carro).
Future<Map<String, dynamic>?> _formularioDeCorrecao(BuildContext context, Map<String, dynamic> v) {
  final marca = TextEditingController(text: '${v['brand'] ?? ''}');
  final modelo = TextEditingController(text: '${v['model'] ?? ''}');
  final ano = TextEditingController(text: '${v['year'] ?? ''}');
  final cor = TextEditingController(text: '${v['color'] ?? ''}');
  String? erro;
  return showDialog<Map<String, dynamic>>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) => AlertDialog(
        title: const Text('Corrigir dados do carro'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: marca, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Marca')),
              TextField(controller: modelo, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Modelo')),
              TextField(controller: ano, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Ano')),
              TextField(controller: cor, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Cor')),
              const SizedBox(height: Spacing.sm),
              Text('A placa não muda aqui: carro com outra placa é carro novo.', style: AppText.caption.copyWith(color: AppColors.textMuted)),
              if (erro != null) Text(erro!, style: AppText.caption.copyWith(color: AppColors.danger)),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Voltar')),
          FilledButton(
            onPressed: () {
              final a = int.tryParse(ano.text.trim());
              if (marca.text.trim().isEmpty || modelo.text.trim().isEmpty || cor.text.trim().isEmpty) {
                setState(() => erro = 'Preencha marca, modelo e cor.');
                return;
              }
              if (a == null || a < 1990 || a > DateTime.now().year + 1) {
                setState(() => erro = 'Ano inválido.');
                return;
              }
              Navigator.of(ctx).pop({'brand': marca.text.trim(), 'model': modelo.text.trim(), 'year': a, 'color': cor.text.trim()});
            },
            child: const Text('Salvar'),
          ),
        ],
      ),
    ),
  );
}

/// Cadastrar outro carro: dados, foto do carro (de frente, com a placa) e
/// foto do CRLV. A Central confere e libera.
class NovoCarroScreen extends StatefulWidget {
  const NovoCarroScreen({super.key});

  @override
  State<NovoCarroScreen> createState() => _NovoCarroScreenState();
}

class _NovoCarroScreenState extends State<NovoCarroScreen> {
  final _placa = TextEditingController();
  final _marca = TextEditingController();
  final _modelo = TextEditingController();
  final _ano = TextEditingController();
  final _cor = TextEditingController();
  FotoEscolhida? _foto;
  FotoEscolhida? _crlv;
  bool _enviando = false;
  String? _erro;

  @override
  void dispose() {
    for (final c in [_placa, _marca, _modelo, _ano, _cor]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _problema() {
    final placa = _placa.text.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
    if (!RegExp(r'^[A-Z]{3}\d[A-Z0-9]\d{2}$').hasMatch(placa)) return 'Placa inválida (ABC1234 ou ABC1D23).';
    if (_marca.text.trim().isEmpty || _modelo.text.trim().isEmpty || _cor.text.trim().isEmpty) return 'Preencha marca, modelo e cor.';
    final ano = int.tryParse(_ano.text.trim());
    if (ano == null || ano < 1990 || ano > DateTime.now().year + 1) return 'Ano do carro inválido.';
    if (_foto == null) return 'Tire a foto do carro de frente, com a placa aparecendo.';
    if (_crlv == null) return 'Tire a foto do documento do carro (CRLV).';
    return null;
  }

  Future<void> _enviar() async {
    final problema = _problema();
    setState(() => _erro = problema);
    if (problema != null) return;
    setState(() => _enviando = true);
    final driver = context.read<DriverState>();
    try {
      final carro = await driver.cadastrarCarro({
        'plate': _placa.text.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), ''),
        'brand': _marca.text.trim(),
        'model': _modelo.text.trim(),
        'year': int.parse(_ano.text.trim()),
        'color': _cor.text.trim(),
      });
      final id = '${carro['id']}';
      final conferir = carro['situacao'] == 'PENDENTE';
      if (conferir) {
        await driver.fotoDoCarro(id, 'FOTO', mime: _foto!.mime, base64: _foto!.base64);
        await driver.fotoDoCarro(id, 'CRLV', mime: _crlv!.mime, base64: _crlv!.base64);
      }
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          icon: const Icon(Icons.check_circle, color: AppColors.primary, size: 40),
          title: Text(conferir ? 'Carro enviado para a Central' : 'Carro cadastrado'),
          content: Text(conferir
              ? 'A Central confere a foto e o CRLV e libera o carro. Você recebe o carro liberado aqui em Meus veículos; '
                  'aí é só tocar em "Usar este carro". Até lá, continue com o carro de agora.'
              : 'O carro já está na sua lista.'),
          actions: [FilledButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Entendi'))],
        ),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _erro = e.message);
    } catch (_) {
      if (mounted) setState(() => _erro = 'Sem conexão com o servidor. O carro não foi enviado.');
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  Widget _campo(String rotulo, TextEditingController c, {TextInputType? teclado, TextCapitalization caps = TextCapitalization.words, String? dica}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.md),
      child: TextField(
        controller: c,
        keyboardType: teclado,
        textCapitalization: caps,
        decoration: InputDecoration(labelText: rotulo, hintText: dica),
      ),
    );
  }

  Widget _botaoFoto(String rotulo, FotoEscolhida? foto, ValueChanged<FotoEscolhida> aoEscolher) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.sm),
      child: OutlinedButton.icon(
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52), alignment: Alignment.centerLeft),
        onPressed: _enviando
            ? null
            : () async {
                final f = await escolherFoto(context, titulo: rotulo);
                if (f != null && mounted) setState(() => aoEscolher(f));
              },
        icon: Icon(foto == null ? Icons.photo_camera_outlined : Icons.check_circle, color: foto == null ? null : AppColors.primary),
        label: Text(foto == null ? rotulo : '$rotulo: pronta (toque para trocar)'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cadastrar outro carro')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(Spacing.lg),
          children: [
            Text(
              'Preencha os dados do carro e mande as duas fotos. A Central confere e libera.',
              style: AppText.body.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: Spacing.md),
            _campo('Placa', _placa, caps: TextCapitalization.characters, dica: 'ABC1D23'),
            _campo('Marca', _marca, dica: 'Ex.: Chevrolet'),
            _campo('Modelo', _modelo, dica: 'Ex.: Onix'),
            _campo('Ano', _ano, teclado: TextInputType.number),
            _campo('Cor', _cor),
            _botaoFoto('Foto do carro (de frente, com a placa)', _foto, (f) => _foto = f),
            _botaoFoto('Foto do CRLV', _crlv, (f) => _crlv = f),
            if (_erro != null)
              Padding(
                padding: const EdgeInsets.only(top: Spacing.sm),
                child: Text(_erro!, style: AppText.body.copyWith(color: AppColors.danger)),
              ),
            const SizedBox(height: Spacing.lg),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              onPressed: _enviando ? null : _enviar,
              child: Text(_enviando ? 'Enviando...' : 'Enviar para a Central'),
            ),
          ],
        ),
      ),
    );
  }
}
