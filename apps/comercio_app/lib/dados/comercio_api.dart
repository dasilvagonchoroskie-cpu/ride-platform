import '../core/api.dart';
import '../core/config.dart';
import 'modelos.dart';

/// Rascunho de entrega: tudo que o servidor precisa para consultar o preco
/// e para pedir. Montado pela tela "Nova entrega".
class DadosDeEntrega {
  DadosDeEntrega({
    required this.descricao,
    this.observacoes,
    this.coletaAlternativa,
    required this.destinatarioNome,
    required this.destinatarioTelefone,
    required this.destino,
    this.referencia,
    this.veiculo,
  });

  final String descricao;
  final String? observacoes;

  /// null = coleta no endereco do estabelecimento.
  final Lugar? coletaAlternativa;
  final String destinatarioNome;
  final String destinatarioTelefone;
  final Endereco destino;
  final String? referencia;
  final String? veiculo;

  Map<String, dynamic> toJson({String? chave, String? cotacao}) {
    return {
      if (chave != null) 'chave': chave,
      'encomenda': {
        'descricao': descricao.trim(),
        if (observacoes != null && observacoes!.trim().isNotEmpty) 'observacoes': observacoes!.trim(),
      },
      if (coletaAlternativa != null)
        'coletaAlternativa': {
          'address': coletaAlternativa!.endereco,
          'latitude': coletaAlternativa!.latitude,
          'longitude': coletaAlternativa!.longitude,
        },
      'destinatario': {'nome': destinatarioNome.trim(), 'telefone': destinatarioTelefone.trim()},
      'destino': {
        'logradouro': destino.logradouro.trim(),
        'numero': destino.numero.trim(),
        if ((destino.complemento ?? '').trim().isNotEmpty) 'complemento': destino.complemento!.trim(),
        'bairro': destino.bairro.trim(),
        'cidade': destino.cidade.trim(),
        'uf': destino.uf.trim().toUpperCase(),
        'cep': destino.cep.replaceAll(RegExp(r'\D'), ''),
        'latitude': destino.latitude,
        'longitude': destino.longitude,
        if ((referencia ?? '').trim().isNotEmpty) 'referencia': referencia!.trim(),
      },
      if (veiculo != null) 'veiculo': veiculo,
      if (cotacao != null && cotacao.isNotEmpty) 'cotacao': cotacao,
    };
  }
}

/// Dados do cadastro do estabelecimento.
class DadosDoCadastro {
  DadosDoCadastro({
    required this.nomeFantasia,
    this.razaoSocial,
    required this.cnpj,
    required this.responsavelNome,
    this.responsavelCpf,
    required this.telefone,
    required this.email,
    required this.endereco,
    this.senha,
  });

  final String nomeFantasia;
  final String? razaoSocial;
  final String cnpj;
  final String responsavelNome;
  final String? responsavelCpf;
  final String telefone;
  final String email;
  final Endereco endereco;
  final String? senha;

  Map<String, dynamic> toJson() => {
        'nomeFantasia': nomeFantasia.trim(),
        if ((razaoSocial ?? '').trim().isNotEmpty) 'razaoSocial': razaoSocial!.trim(),
        'cnpj': cnpj.replaceAll(RegExp(r'\D'), ''),
        'responsavelNome': responsavelNome.trim(),
        if ((responsavelCpf ?? '').trim().isNotEmpty) 'responsavelCpf': responsavelCpf!.replaceAll(RegExp(r'\D'), ''),
        'telefone': telefone.trim(),
        'email': email.trim().toLowerCase(),
        ..._enderecoJson(endereco),
        if ((senha ?? '').isNotEmpty) 'senha': senha,
      };
}

Map<String, dynamic> _enderecoJson(Endereco e) => {
      'logradouro': e.logradouro.trim(),
      'numero': e.numero.trim(),
      if ((e.complemento ?? '').trim().isNotEmpty) 'complemento': e.complemento!.trim(),
      'bairro': e.bairro.trim(),
      'cidade': e.cidade.trim(),
      'uf': e.uf.trim().toUpperCase(),
      'cep': e.cep.replaceAll(RegExp(r'\D'), ''),
      if (e.latitude != null && e.longitude != null) ...{'latitude': e.latitude, 'longitude': e.longitude},
    };

/// Todas as chamadas do app ao servidor. Nada aqui calcula preco ou estado.
class ComercioApi {
  ComercioApi(this.api);

  final ApiClient api;

  // ---- Entrar ----

  Future<void> pedirCodigo(String email) async {
    await api.post('/auth/otp/request', {'email': email.trim().toLowerCase(), 'purpose': 'LOGIN'});
  }

  Future<Map<String, dynamic>> entrarComCodigo(String email, String codigo, Map<String, dynamic> aparelho) async {
    final r = await api.post('/auth/otp/verify', {
      'email': email.trim().toLowerCase(),
      'code': codigo.trim(),
      'purpose': 'LOGIN',
      'role': 'PASSENGER',
      'device': aparelho,
    });
    return Map<String, dynamic>.from(r as Map);
  }

  Future<Map<String, dynamic>> entrarComSenha(String email, String senha, Map<String, dynamic> aparelho) async {
    final r = await api.post('/auth/password/login', {
      'email': email.trim().toLowerCase(),
      'password': senha,
      'device': aparelho,
    });
    return Map<String, dynamic>.from(r as Map);
  }

  Future<void> sair(String? renovacao) async {
    try {
      await api.post('/auth/logout', {if (renovacao != null && renovacao.length >= 20) 'refreshToken': renovacao});
    } catch (_) {
      // Sem rede: a sessao local e apagada do mesmo jeito.
    }
  }

  // ---- Estabelecimento ----

  /// null = esta conta ainda nao cadastrou estabelecimento.
  Future<Estabelecimento?> meu() async {
    final r = await api.get('/comercio/meu');
    final m = r is Map ? r : const {};
    if (m['cadastrado'] != true || m['comercio'] == null) return null;
    final loja = m['comercio'];
    return Estabelecimento.fromJson(loja is Map ? {...loja, 'entregasLiberadas': m['entregasLiberadas']} : loja);
  }

  Future<Estabelecimento> cadastrar(DadosDoCadastro d) async => Estabelecimento.fromJson(await api.post('/comercio/cadastro', d.toJson()));

  Future<Estabelecimento> atualizar({String? nomeFantasia, String? razaoSocial, String? responsavelNome, String? telefone, Endereco? endereco}) async {
    final corpo = <String, dynamic>{
      if (nomeFantasia != null) 'nomeFantasia': nomeFantasia.trim(),
      if (razaoSocial != null && razaoSocial.trim().isNotEmpty) 'razaoSocial': razaoSocial.trim(),
      if (responsavelNome != null) 'responsavelNome': responsavelNome.trim(),
      if (telefone != null) 'telefone': telefone.trim(),
      if (endereco != null) ..._enderecoJson(endereco),
    };
    return Estabelecimento.fromJson(await api.patch('/comercio/meu', corpo));
  }

  // ---- Endereco no mapa ----

  Future<List<Lugar>> buscarEndereco(String texto, {double? lat, double? lng}) async {
    final r = await api.get('/geo/search', query: {
      'q': texto.trim(),
      'lat': (lat ?? AppConfig.centroLat).toString(),
      'lng': (lng ?? AppConfig.centroLng).toString(),
    });
    final lista = r is List ? r : const [];
    return lista.map(Lugar.tentar).whereType<Lugar>().toList();
  }

  // ---- Entregas ----

  Future<Cotacao> consultarPreco(DadosDeEntrega d) async => Cotacao.fromJson(await api.post('/comercio/entregas/preco', d.toJson()));

  /// So devolve uma entrega se o SERVIDOR confirmou. Erro de rede lanca
  /// ApiException(NETWORK_ERROR): o pedido pode ou nao ter sido gravado; a
  /// tela repete com a MESMA chave (o servidor nao duplica).
  Future<Entrega> pedirEntrega(String chave, DadosDeEntrega d, String? cotacao) async =>
      Entrega.fromJson(await api.post('/comercio/entregas', d.toJson(chave: chave, cotacao: cotacao)));

  Future<Entrega> entrega(String id) async => Entrega.fromJson(await api.get('/comercio/entregas/$id'));

  Future<Historico> historico(int pagina) async => Historico.fromJson(await api.get('/comercio/entregas', query: {'pagina': '$pagina'}));

  Future<Entrega> cancelar(String id, {String? motivo}) async =>
      Entrega.fromJson(await api.post('/comercio/entregas/$id/cancelar', {if (motivo != null && motivo.isNotEmpty) 'motivo': motivo}));

  Future<Repeticao> repetir(String id) async => Repeticao.fromJson(await api.get('/comercio/entregas/$id/repetir'));

  Future<Gastos> gastos({DateTime? de, DateTime? ate}) async => Gastos.fromJson(await api.get('/comercio/gastos', query: {
        if (de != null) 'de': de.toUtc().toIso8601String(),
        if (ate != null) 'ate': ate.toUtc().toIso8601String(),
      }));
}
