import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/avisos.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/geo.dart';
import '../data/models/models.dart';
import '../state/app_state.dart';
import '../state/ride_state.dart';
import '../widgets/form_ui.dart';
import '../widgets/ui.dart';
import 'destino_sheet.dart';
import 'legal_screen.dart';

/// Entrega de encomenda (Etapa 5, 30/10/2026 — Fase 1).
///
/// O cliente diz onde coletar, onde entregar, o que vai e quem recebe. Ve o
/// preco (tarifa propria da cidade) e pede. Depois do pedido, a tela da
/// corrida mostra o codigo de 4 numeros para mandar a quem recebe.
class EntregaScreen extends StatefulWidget {
  const EntregaScreen({super.key});

  @override
  State<EntregaScreen> createState() => _EntregaScreenState();
}

class _EntregaScreenState extends State<EntregaScreen> {
  final _descricao = TextEditingController();
  final _nome = TextEditingController();
  final _telefone = TextEditingController();
  PlaceSuggestion? _coleta;
  PlaceSuggestion? _entrega;
  PaymentOption _pagamento = kFormasDePagamento.first;
  bool _leuAsRegras = false;
  bool _calculando = false;
  bool _pedindo = false;
  RideQuote? _preco;
  String? _erro;

  @override
  void initState() {
    super.initState();
    // Coleta comeca onde o cliente esta (pode trocar).
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final aqui = context.read<AppState>().coords;
      final lugar = await context.read<RideState>().addressOf(aqui);
      if (!mounted || _coleta != null) return;
      setState(() => _coleta = lugar ?? PlaceSuggestion(address: 'Minha localização atual', coords: aqui, distanceKm: 0));
    });
  }

  @override
  void dispose() {
    _descricao.dispose();
    _nome.dispose();
    _telefone.dispose();
    super.dispose();
  }

  Future<void> _escolher({required bool coleta}) async {
    final p = await DestinoSheet.abrir(context, titulo: coleta ? 'Endereço de coleta' : 'Endereço de entrega');
    if (p == null || DestinoSheet.ehSemDestino(p) || !mounted) return;
    setState(() {
      if (coleta) {
        _coleta = p;
      } else {
        _entrega = p;
      }
      _preco = null;
    });
  }

  /// O que falta para pedir (null = tudo certo).
  String? _falta() {
    if (_coleta == null) return 'Escolha o endereço de coleta.';
    if (_entrega == null) return 'Escolha o endereço de entrega.';
    if (distanceKm(_coleta!.coords, _entrega!.coords) < 0.05) return 'Coleta e entrega estão no mesmo lugar.';
    if (_descricao.text.trim().length < 3) return 'Diga o que vai ser levado.';
    if (_nome.text.trim().length < 2) return 'Diga o nome de quem recebe.';
    final tel = _telefone.text.replaceAll(RegExp(r'\D'), '');
    if (tel.length < 10 || tel.length > 13) return 'Telefone de quem recebe com DDD (ex.: 64 99999-1234).';
    if (!_leuAsRegras) return 'Confirme que leu as regras de entrega.';
    return null;
  }

  Future<void> _verPreco() async {
    final falta = _falta();
    setState(() => _erro = falta);
    if (falta != null) return;
    setState(() => _calculando = true);
    final q = await context.read<RideState>().estimarEntrega(
          _coleta!.coords,
          _entrega!.coords,
          coletaEndereco: _coleta!.fullAddress,
          entregaEndereco: _entrega!.fullAddress,
        );
    if (!mounted) return;
    setState(() {
      _calculando = false;
      _preco = q;
    });
  }

  Future<void> _pedir() async {
    final falta = _falta();
    setState(() => _erro = falta);
    if (falta != null || _preco == null || _pedindo) return;
    setState(() => _pedindo = true);
    try {
      await context.read<RideState>().requestRide(
            origin: _coleta!.coords,
            destination: _entrega!.coords,
            pickupAddress: _coleta!.fullAddress,
            dropoffAddress: _entrega!.fullAddress,
            paymentMethod: _pagamento.label,
            paymentType: _pagamento.type,
            entrega: {
              'descricao': _descricao.text.trim(),
              'destinatarioNome': _nome.text.trim(),
              'destinatarioTelefone': _telefone.text.replaceAll(RegExp(r'\D'), ''),
            },
          );
    } on ApiException catch (e) {
      avisar(e.message);
      if (mounted) setState(() => _pedindo = false);
      return;
    } catch (_) {
      avisar('Sem conexão com o servidor. A entrega não foi pedida.');
      if (mounted) setState(() => _pedindo = false);
      return;
    }
    if (!mounted) return;
    // A tela da corrida abre sozinha (procurando motorista).
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  Widget _endereco({required String rotulo, required PlaceSuggestion? lugar, required IconData icone, required VoidCallback aoTocar}) {
    return Material(
      color: AppColors.surfaceElevated,
      borderRadius: BorderRadius.circular(Radii.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.md),
        onTap: aoTocar,
        child: Padding(
          padding: const EdgeInsets.all(Spacing.md),
          child: Row(
            children: [
              Icon(icone, color: AppColors.brand),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(rotulo.toUpperCase(), style: AppText.label.copyWith(color: AppColors.textMuted)),
                    const SizedBox(height: 2),
                    Text(
                      lugar?.fullAddress ?? 'Toque para escolher',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body.copyWith(fontWeight: FontWeight.w600, color: lugar == null ? AppColors.textMuted : AppColors.text),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.textMuted),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final preco = _preco;
    return TelaFormulario(
      titulo: 'Entrega',
      child: ListView(
        padding: const EdgeInsets.all(Spacing.lg),
        children: [
          Text(
            'Um motorista parceiro leva a sua encomenda. Quem recebe diz um código ao motorista na hora da entrega.',
            style: AppText.body.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: Spacing.lg),
          _endereco(rotulo: 'Coleta', lugar: _coleta, icone: Icons.inventory_2_outlined, aoTocar: () => _escolher(coleta: true)),
          const SizedBox(height: Spacing.sm),
          _endereco(rotulo: 'Entrega', lugar: _entrega, icone: Icons.flag_outlined, aoTocar: () => _escolher(coleta: false)),
          const SizedBox(height: Spacing.lg),
          AppField(
            label: 'O que vai ser levado',
            hint: 'Ex.: envelope com documentos, caixa pequena',
            controller: _descricao,
            maxLength: 200,
            autoCapitalize: TextCapitalization.sentences,
          ),
          const SizedBox(height: Spacing.sm),
          AppField(
            label: 'Nome de quem recebe',
            controller: _nome,
            maxLength: 120,
            autoCapitalize: TextCapitalization.words,
          ),
          const SizedBox(height: Spacing.sm),
          AppField(
            label: 'Telefone de quem recebe (com DDD)',
            hint: '64 99999-1234',
            controller: _telefone,
            keyboardType: TextInputType.phone,
            maxLength: 16,
          ),
          const SizedBox(height: Spacing.sm),
          Text('PAGAMENTO (DIRETO AO MOTORISTA)', style: AppText.label.copyWith(color: AppColors.textMuted)),
          const SizedBox(height: Spacing.xs),
          Wrap(
            spacing: Spacing.sm,
            children: [
              for (final f in kFormasDePagamento)
                ChoiceChip(
                  label: Text(f.label),
                  selected: f.id == _pagamento.id,
                  onSelected: (_) => setState(() => _pagamento = f),
                ),
            ],
          ),
          const SizedBox(height: Spacing.md),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _leuAsRegras,
            onChanged: (v) => setState(() => _leuAsRegras = v == true),
            title: Text(
              'Li as regras de entrega: itens proibidos, peso e tamanho, embalagem.',
              style: AppText.body,
            ),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const LegalScreen())),
              child: const Text('Ler as regras (Termos de Uso, item 7-A)'),
            ),
          ),
          if (_erro != null)
            Padding(
              padding: const EdgeInsets.only(bottom: Spacing.sm),
              child: Text(_erro!, style: AppText.body.copyWith(color: AppColors.danger, fontWeight: FontWeight.w600)),
            ),
          if (preco != null) ...[
            Container(
              padding: const EdgeInsets.all(Spacing.md),
              decoration: BoxDecoration(color: AppColors.brandSoft, borderRadius: BorderRadius.circular(Radii.md)),
              child: Row(
                children: [
                  const Icon(Icons.local_shipping_outlined, color: AppColors.brand),
                  const SizedBox(width: Spacing.md),
                  Expanded(
                    child: Text(
                      preco.taximetro
                          ? 'Entrega: cerca de ${formatMoney(preco.priceCents)} (o valor final sai do trajeto feito).'
                          : 'Entrega: ${formatMoney(preco.priceCents)}.',
                      style: AppText.bodyStrong,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: Spacing.md),
            AppButton(label: _pedindo ? 'Pedindo…' : 'Pedir entrega', loading: _pedindo, onPressed: _pedir),
          ] else
            AppButton(label: _calculando ? 'Calculando…' : 'Ver o preço', loading: _calculando, onPressed: _verPreco),
          const SizedBox(height: Spacing.xl),
        ],
      ),
    );
  }
}
