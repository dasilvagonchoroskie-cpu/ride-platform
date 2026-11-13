import 'package:comercio_app/core/api.dart';
import 'package:comercio_app/dados/comercio_api.dart';
import 'package:comercio_app/dados/modelos.dart';

/// Servidor de mentira para os testes de tela (nada de rede).
class ServidorFalso extends ComercioApi {
  ServidorFalso() : super(ApiClient());

  Estabelecimento? loja;
  Cotacao cotacao = Cotacao(
    enderecoColeta: 'Rua B, 20, Centro, Goiatuba/GO',
    coletaAlternativa: false,
    enderecoEntrega: 'Rua A, 10, Centro, Goiatuba/GO',
    distanciaMetros: 2300,
    duracaoSegundos: 480,
    opcoes: const [OpcaoPreco(veiculo: 'MOTO', nome: 'Moto', valorCents: 700)],
    assinatura: 'assinada',
  );
  Object? erroNoPreco;

  /// Avisos do sino (so os do Comercio) e o que o servidor foi avisado.
  CaixaDeAvisos caixa = const CaixaDeAvisos(itens: []);
  Object? erroNosAvisos;
  final List<String> avisosLidos = [];
  final List<String> avisosApagados = [];
  int consultasDeAvisos = 0;

  /// Imagens do mapa (null = sem mapa de ruas) e os termos de uso.
  ConfigDoMapa? mapaConfig;
  int consultasDeMapa = 0;
  Object? erroNosTermos;
  TermosDeUso termosDeTeste = const TermosDeUso(versao: '0.1.0-minuta', conteudo: '# Termos\n\n## 1. Quem somos\n\nTexto **importante**.\n\n- item um', revisadoPorAdvogado: false);

  @override
  Future<CaixaDeAvisos> avisos() async {
    consultasDeAvisos++;
    if (erroNosAvisos != null) throw erroNosAvisos!;
    return caixa;
  }

  @override
  Future<void> marcarAvisosLidos(List<String> ids) async => avisosLidos.addAll(ids);

  @override
  Future<void> apagarAvisos(List<String> ids) async => avisosApagados.addAll(ids);

  @override
  Future<ConfigDoMapa?> configDoMapa() async {
    consultasDeMapa++;
    return mapaConfig;
  }

  @override
  Future<TermosDeUso> termos() async {
    if (erroNosTermos != null) throw erroNosTermos!;
    return termosDeTeste;
  }

  /// Respostas do pedir, na ordem; o que for Exception e lancado.
  final List<Object> respostasDoPedido = [];
  final List<String> chavesRecebidas = [];
  final List<int?> valoresEsperados = [];
  int consultasDePreco = 0;
  int cadastros = 0;

  @override
  Future<Estabelecimento?> meu() async => loja;

  /// Ultimo pedido de preco recebido (para conferir as varias entregas).
  DadosDeEntrega? ultimosDados;

  TermosDeUso privacidadeDeTeste = const TermosDeUso(versao: '1', conteudo: '# Privacidade\n\nTexto da privacidade.', revisadoPorAdvogado: false);

  @override
  Future<TermosDeUso> privacidade() async => privacidadeDeTeste;

  @override
  Future<Cotacao> consultarPreco(DadosDeEntrega d) async {
    ultimosDados = d;
    consultasDePreco++;
    if (erroNoPreco != null) throw erroNoPreco!;
    return cotacao;
  }

  @override
  Future<Entrega> pedirEntrega(String chave, DadosDeEntrega d, String? cotacao, {int? valorEsperadoCents}) async {
    chavesRecebidas.add(chave);
    valoresEsperados.add(valorEsperadoCents);
    final Object r = respostasDoPedido.isEmpty ? entregaDeTeste() : respostasDoPedido.removeAt(0);
    if (r is Entrega) return r;
    throw r;
  }

  /// Se definida, e o que `entrega(id)` devolve (para testar mapa, motorista etc.).
  Entrega? entregaFixa;

  /// Ultimo cadastro enviado (para conferir o aceite dos termos).
  DadosDoCadastro? ultimoCadastro;

  @override
  Future<Entrega> entrega(String id) async => entregaFixa ?? entregaDeTeste(id: id);

  @override
  Future<Gastos> gastos({DateTime? de, DateTime? ate}) async => const Gastos(
        de: '2026-11-01T03:00:00.000Z',
        ate: '2026-12-01T03:00:00.000Z',
        realizadas: 0,
        canceladas: 0,
        emAndamento: 0,
        totalCents: 0,
        cobrancas: [],
      );

  @override
  Future<Historico> historico(int pagina) async => Historico(total: 0, pagina: 1, porPagina: 20, itens: const []);

  @override
  Future<Estabelecimento> cadastrar(DadosDoCadastro d) async {
    cadastros++;
    ultimoCadastro = d;
    return estabelecimento(situacao: Situacao.aguardando);
  }

  @override
  Future<List<Lugar>> buscarEndereco(String texto, {double? lat, double? lng}) async =>
      const [Lugar(endereco: 'Rua A, 10', detalhe: 'Centro, Goiatuba', latitude: -18.01, longitude: -49.35)];
}

Entrega entregaDeTeste({String id = 'r1', String etapa = 'AGUARDANDO_MOTORISTA', MapaDaEntrega? mapa, String? motoristaNome}) => Entrega(
      id: id,
      codigo: 'FM100',
      etapa: etapa,
      situacao: Etapa.rotulos[etapa] ?? etapa,
      final_: etapa == 'ENTREGUE' || Etapa.ehProblema(etapa),
      criadaEm: '2026-11-12T15:00:00.000Z',
      encomenda: '1 pizza',
      destinatarioNome: 'Maria',
      destinatarioTelefone: '5564999990000',
      enderecoDeEntrega: 'Rua A, 10, Centro, Goiatuba/GO',
      enderecoDeColeta: 'Rua B, 20, Centro, Goiatuba/GO',
      coletaAlternativa: false,
      veiculo: 'MOTO',
      valorEstimadoCents: 700,
      valorCobradoCents: 0,
      mapa: mapa,
      motoristaNome: motoristaNome,
    );

Estabelecimento estabelecimento({String situacao = Situacao.aprovado, String? motivo, bool liberadas = true}) => Estabelecimento(
      id: 'c1',
      nomeFantasia: 'Pizzaria Boa',
      cnpj: '11222333000181',
      responsavelNome: 'Ana Souza',
      telefone: '+5564999998888',
      email: 'loja@exemplo.com',
      endereco: const Endereco(
        logradouro: 'Rua B',
        numero: '20',
        bairro: 'Centro',
        cidade: 'Goiatuba',
        uf: 'GO',
        cep: '75600000',
        latitude: -18.0,
        longitude: -49.3,
        porExtenso: 'Rua B, 20, Centro, Goiatuba/GO, CEP 75600-000',
      ),
      situacao: situacao,
      situacaoRotulo: situacao == Situacao.aprovado ? 'Aprovado' : (situacao == Situacao.aguardando ? 'Seu cadastro ainda está aguardando aprovação da Central.' : 'Indisponível'),
      motivo: motivo,
      entregasLiberadas: liberadas,
    );
