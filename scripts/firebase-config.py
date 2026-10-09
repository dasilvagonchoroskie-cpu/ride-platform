#!/usr/bin/env python3
"""Liga o push (Firebase) nos aplicativos a partir do google-services.json.

Uso: python3 scripts/firebase-config.py caminho/google-services.json

O Firebase gera UM google-services.json com todos os aplicativos Android do
projeto. Este script cria, para cada aplicativo nosso que estiver nele,
android/app/src/main/res/values/firebase.xml com os valores que o Android le
na abertura (o mesmo que o plugin "google-services" do Gradle faria) e um
keep.xml para o encolhimento de recursos nao apagar esses valores.

Os valores nao sao segredo (vao dentro do APK de qualquer jeito). A chave
privada da conta de servico (para o SERVIDOR mandar o push) NAO entra aqui:
ela vai so nas variaveis do Render.
"""
import json
import pathlib
import sys

APPS = {
    'br.com.fortalezamov.motorista': 'apps/mobile_driver',
    'br.com.fortalezamov.passageiro': 'apps/mobile_passenger',
    'com.rideplatform.central_app': 'apps/central_app',
}

def main(caminho: str) -> int:
    dados = json.loads(pathlib.Path(caminho).read_text(encoding='utf-8'))
    projeto = dados['project_info']
    raiz = pathlib.Path(__file__).resolve().parent.parent
    feitos = 0
    for cliente in dados.get('client', []):
        pacote = cliente['client_info']['android_client_info']['package_name']
        pasta = APPS.get(pacote)
        if not pasta:
            continue
        chave = (cliente.get('api_key') or [{}])[0].get('current_key', '')
        valores = {
            'google_app_id': cliente['client_info']['mobilesdk_app_id'],
            'gcm_defaultSenderId': projeto['project_number'],
            'google_api_key': chave,
            'google_crash_reporting_api_key': chave,
            'project_id': projeto['project_id'],
            'google_storage_bucket': projeto.get('storage_bucket', ''),
        }
        res = raiz / pasta / 'android/app/src/main/res'
        (res / 'values').mkdir(parents=True, exist_ok=True)
        linhas = ['<?xml version="1.0" encoding="utf-8"?>', '<!-- Gerado por scripts/firebase-config.py (push). -->', '<resources>']
        for nome, valor in valores.items():
            if valor:
                linhas.append(f'    <string name="{nome}" translatable="false">{valor}</string>')
        linhas.append('</resources>')
        (res / 'values/firebase.xml').write_text('\n'.join(linhas) + '\n', encoding='utf-8')
        (res / 'raw').mkdir(parents=True, exist_ok=True)
        (res / 'raw/keep.xml').write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<resources xmlns:tools="http://schemas.android.com/tools"\n'
            '    tools:keep="@string/google_app_id,@string/gcm_defaultSenderId,@string/google_api_key,'
            '@string/google_crash_reporting_api_key,@string/project_id,@string/google_storage_bucket" />\n',
            encoding='utf-8',
        )
        print(f'OK: {pacote} -> {pasta}')
        feitos += 1
    if feitos == 0:
        print('Nenhum aplicativo nosso no arquivo. Confira os nomes de pacote no Firebase:', ', '.join(APPS))
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
