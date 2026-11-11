/// Ajustes proprios de cada fabricante no app do passageiro (Evandro,
/// 10/11/2026). Todos recomendados: seguram o aviso "motorista chegou" com o
/// app minimizado durante a corrida, mas nunca impedem de pedir corrida.
/// O Android nao informa esses ajustes; a pessoa abre e confirma ("Ja fiz").
class AjusteAparelho {
  const AjusteAparelho(this.chave, this.titulo, this.passos);

  final String chave;
  final String titulo;
  final String passos;
}

const _inicio = AjusteAparelho('inicioAutomatico', 'Início automático',
    'Para o celular não fechar o aplicativo durante a corrida. Na tela que abrir, ligue a chave do Fortaleza Move.');

const Map<String, List<AjusteAparelho>> _porFamilia = {
  'xiaomi': [
    _inicio,
    AjusteAparelho('bateriaFabricante', 'Bateria: Nenhuma restrição',
        'Na tela que abrir, escolha "Nenhuma restrição". Se abrir a lista "Economia de bateria de apps", o Fortaleza Move '
            'tem que ficar em "Apps ativos" — nunca toque em "Suspender apps".'),
  ],
  'samsung': [
    AjusteAparelho('nuncaSuspender', 'Apps que nunca entram em suspensão',
        'Na tela que abrir: "Limites de uso em segundo plano" → "Apps que nunca entram em suspensão" → toque em "+" e '
            'escolha o Fortaleza Move. Se abrir outra tela: Configurações → Bateria → Limites de uso em segundo plano.'),
  ],
  'oppo': [
    _inicio,
    AjusteAparelho('segundoPlano', 'Atividade em segundo plano',
        'Na tela do aplicativo que abrir: "Uso da bateria" → ligue "Permitir atividade em segundo plano".'),
  ],
  'vivo': [
    _inicio,
    AjusteAparelho('segundoPlano', 'Alto consumo em segundo plano',
        'Na tela que abrir, permita o Fortaleza Move em "Alto consumo de energia em segundo plano".'),
  ],
  'huawei': [
    AjusteAparelho('inicioAutomatico', 'Inicialização de apps',
        'Desligue "Gerenciar automaticamente" do Fortaleza Move e deixe ligadas "Início automático", '
            '"Início secundário" e "Executar em segundo plano".'),
  ],
  'honor': [
    AjusteAparelho('inicioAutomatico', 'Inicialização de apps',
        'Desligue "Gerenciar automaticamente" do Fortaleza Move e deixe ligadas "Início automático", '
            '"Início secundário" e "Executar em segundo plano".'),
  ],
  'asus': [_inicio],
};

List<AjusteAparelho> ajustesDoAparelho(String familia, List<String> extras) {
  final lista = _porFamilia[familia] ?? const [];
  return [for (final a in lista) if (extras.contains(a.chave)) a];
}

String marcaDaFamilia(String familia) => switch (familia) {
      'xiaomi' => 'Xiaomi',
      'samsung' => 'Samsung',
      'oppo' => 'Oppo / Realme / OnePlus',
      'vivo' => 'Vivo',
      'huawei' => 'Huawei',
      'honor' => 'Honor',
      'asus' => 'Asus',
      _ => 'celular',
    };

/// "Redmi 23053RN02L · HyperOS 1.0 · Android 14".
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
