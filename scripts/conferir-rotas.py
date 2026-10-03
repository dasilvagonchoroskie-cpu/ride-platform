#!/usr/bin/env python3
"""
Confere se TODA chamada que os tres aplicativos fazem ao servidor existe no
servidor com o mesmo metodo (GET, POST, PATCH, PUT, DELETE).

Foi assim que escapou o "Metodo PUT nao suportado" das tarifas da Central:
o aplicativo chamava PUT e o servidor so tinha PATCH. Este script roda na
esteira e reprova a montagem se aparecer qualquer chamada sem rota.
"""
import pathlib, re, sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
BACK = RAIZ / 'apps/backend/src'
APPS = ['mobile_passenger', 'mobile_driver', 'central_app']

def normalizar(caminho: str) -> list[str]:
    caminho = caminho.split('?')[0]
    partes = [p for p in caminho.strip('/').split('/') if p]
    saida = []
    for p in partes:
        if p.startswith(':') or '$' in p or '{' in p:
            saida.append(':p')
        else:
            saida.append(p)
    return saida

# ---------------- rotas do servidor ----------------
rotas = []
for arq in BACK.rglob('*.controller.ts'):
    texto = arq.read_text(encoding='utf-8')
    # cada classe controller tem seu prefixo
    blocos = re.split(r'(?=@Controller\()', texto)
    for bloco in blocos[1:]:
        m = re.match(r"@Controller\(\s*(?:'([^']*)')?\s*\)", bloco)
        prefixo = m.group(1) if m and m.group(1) else ''
        for mm in re.finditer(r"@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)", bloco):
            metodo = mm.group(1).upper()
            sub = mm.group(2) or ''
            rotas.append((metodo, normalizar(f'{prefixo}/{sub}'), f'{arq.name}'))

def existe(metodo, partes):
    for m, r, _ in rotas:
        if m != metodo or len(r) != len(partes):
            continue
        if all(a == b or a == ':p' or b == ':p' for a, b in zip(r, partes)):
            return True
    return False

# ---------------- chamadas dos aplicativos ----------------
erros = []
total = 0
padrao = re.compile(r"request\(\s*((?:[^,]*?'[A-Z]+'[^,]*?))\s*,\s*['\"](/[^'\"]*)['\"]", re.S)
for app in APPS:
    for arq in (RAIZ / 'apps' / app / 'lib').rglob('*.dart'):
        texto = arq.read_text(encoding='utf-8')
        for m in padrao.finditer(texto):
            metodos = re.findall(r"'([A-Z]+)'", m.group(1))
            caminho = m.group(2)
            for metodo in metodos:
                total += 1
                if not existe(metodo, normalizar(caminho)):
                    linha = texto[: m.start()].count('\n') + 1
                    erros.append(f'{app}: {metodo} {caminho}  ({arq.relative_to(RAIZ)}:{linha})')

# O cliente de cada aplicativo precisa saber enviar todos os metodos usados.
for app in APPS:
    cliente = (RAIZ / 'apps' / app / 'lib/core/api/api_client.dart').read_text(encoding='utf-8')
    usados = set()
    for arq in (RAIZ / 'apps' / app / 'lib').rglob('*.dart'):
        for m in padrao.finditer(arq.read_text(encoding='utf-8')):
            usados.update(re.findall(r"'([A-Z]+)'", m.group(1)))
    for metodo in sorted(usados):
        if f"case '{metodo}'" not in cliente:
            erros.append(f'{app}: o cliente do aplicativo nao sabe enviar {metodo} (api_client.dart)')

print(f'Rotas no servidor: {len(rotas)} | chamadas dos aplicativos conferidas: {total}')
if erros:
    print('CHAMADAS SEM ROTA NO SERVIDOR:')
    for e in erros:
        print('  - ' + e)
    sys.exit(1)
print('Todas as chamadas dos aplicativos existem no servidor.')
