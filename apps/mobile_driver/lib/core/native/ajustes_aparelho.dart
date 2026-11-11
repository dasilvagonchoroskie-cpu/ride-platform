/// Ajustes proprios de cada fabricante (Evandro, 10/11/2026, Redmi 12: "o
/// aplicativo tem que identificar o modelo e pedir tudo que precisa").
///
/// O Android nao informa esses ajustes; o aplicativo abre a tela certa do
/// fabricante e o motorista confirma ("Ja fiz"). O texto usa os nomes que
/// aparecem nos menus em portugues de cada marca.
class AjusteAparelho {
  const AjusteAparelho(this.chave, this.titulo, this.passos, {this.obrigatorio = true, this.temTela = true});

  final String chave;
  final String titulo;
  final String passos;

  /// Sem ele o motorista nao fica Disponivel.
  final bool obrigatorio;

  /// false: nao ha tela para abrir (so a explicacao e o "Ja fiz").
  final bool temTela;
}

const _travarRecentes = AjusteAparelho(
  'travarRecentes',
  'Travar nos apps recentes',
  'Abra os apps recentes (arraste de baixo para cima e segure), segure o cartão do Fortaleza Move Motorista '
      'e toque no cadeado. Assim a limpeza de memória não fecha o aplicativo.',
  obrigatorio: false,
  temTela: false,
);

const Map<String, List<AjusteAparelho>> _porFamilia = {
  'xiaomi': [
    AjusteAparelho('inicioAutomatico', 'Início automático',
        'Sem isto a Xiaomi fecha o aplicativo e a corrida não chega. Na tela que abrir, ligue a chave do Fortaleza Move Motorista.'),
    AjusteAparelho('bateriaFabricante', 'Bateria: Nenhuma restrição',
        'Na tela que abrir, escolha "Nenhuma restrição". Se abrir a lista "Economia de bateria de apps", o Fortaleza Move '
            'Motorista tem que ficar em "Apps ativos" — nunca toque em "Suspender apps".'),
    AjusteAparelho('outrasPermissoes', 'Tela de bloqueio e janelas pop-up',
        'Para a chamada abrir por cima de tudo, mesmo com o celular bloqueado. Na tela que abrir, em "Outras permissões", '
            'deixe em "Permitir": "Exibir na tela de bloqueio", "Exibir janelas pop-up enquanto executa em segundo plano" '
            'e "Abrir novas janelas enquanto executa em segundo plano".'),
    _travarRecentes,
  ],
  'samsung': [
    AjusteAparelho('nuncaSuspender', 'Apps que nunca entram em suspensão',
        'A Samsung põe para dormir os apps pouco abertos. Na tela que abrir: "Limites de uso em segundo plano" → '
            '"Apps que nunca entram em suspensão" → toque em "+" e escolha o Fortaleza Move Motorista. '
            'Se abrir outra tela: Configurações → Bateria → Limites de uso em segundo plano.'),
  ],
  'oppo': [
    AjusteAparelho('inicioAutomatico', 'Início automático',
        'Na tela que abrir, ligue a chave do Fortaleza Move Motorista.'),
    AjusteAparelho('segundoPlano', 'Atividade em segundo plano',
        'Na tela do aplicativo que abrir: "Uso da bateria" → ligue "Permitir atividade em segundo plano" '
            '(e "Permitir início automático", se aparecer).'),
    _travarRecentes,
  ],
  'vivo': [
    AjusteAparelho('inicioAutomatico', 'Início automático',
        'Na tela que abrir, ligue a chave do Fortaleza Move Motorista.'),
    AjusteAparelho('segundoPlano', 'Alto consumo em segundo plano',
        'Na tela que abrir, permita o Fortaleza Move Motorista em "Alto consumo de energia em segundo plano".'),
    _travarRecentes,
  ],
  'huawei': [
    AjusteAparelho('inicioAutomatico', 'Inicialização de apps',
        'Na tela que abrir, desligue "Gerenciar automaticamente" do Fortaleza Move Motorista e deixe ligadas as três chaves: '
            '"Início automático", "Início secundário" e "Executar em segundo plano".'),
  ],
  'honor': [
    AjusteAparelho('inicioAutomatico', 'Inicialização de apps',
        'Na tela que abrir, desligue "Gerenciar automaticamente" do Fortaleza Move Motorista e deixe ligadas as três chaves: '
            '"Início automático", "Início secundário" e "Executar em segundo plano".'),
  ],
  'asus': [
    AjusteAparelho('inicioAutomatico', 'Início automático',
        'Na tela que abrir ("Gerenciador de inicialização automática"), permita o Fortaleza Move Motorista.'),
  ],
};

/// Ajustes deste aparelho, na ordem do Android ([extras] vem do nativo).
List<AjusteAparelho> ajustesDoAparelho(String familia, List<String> extras) {
  final lista = _porFamilia[familia] ?? const [];
  return [for (final a in lista) if (extras.contains(a.chave)) a];
}

/// Nome do celular para mostrar na tela: "Redmi 23053RN02L · HyperOS 1.0 · Android 14".
String nomeDoAparelho(Map<String, dynamic> perfil) {
  final marca = (perfil['marca'] ?? '').toString();
  final modelo = (perfil['modelo'] ?? '').toString();
  final aparelho = modelo.toLowerCase().startsWith(marca.toLowerCase()) ? modelo : '$marca $modelo'.trim();
  final sistema = (perfil['sistema'] ?? '').toString();
  final android = (perfil['android'] ?? '').toString();
  return [
    if (aparelho.isNotEmpty) aparelho,
    if (sistema.isNotEmpty && sistema != 'Android') sistema,
    if (android.isNotEmpty) 'Android $android',
  ].join(' · ');
}
