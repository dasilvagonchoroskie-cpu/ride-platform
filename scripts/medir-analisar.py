#!/usr/bin/env python3
"""Relatorio da esteira "Medir o mapa" (etapa 2, 29/10/2026).

uso: medir-analisar.py <pasta-da-medicao> <app> <rotulo> <pasta-do-relatorio> [--fotos]

Junta, para cada abertura (r1, r2, r3):
  - os eventos que o proprio app registrou (MEDIDA ...), em ms desde que o
    app comecou a rodar;
  - o tempo do Android ate o primeiro quadro (am start -W, TotalTime);
  - pelas fotos da tela: o primeiro instante em que a area do mapa tem
    "desenho de mapa" (muitas cores diferentes), em ms desde o toque no icone.
Com --fotos, guarda miniaturas de alguns instantes (so passageiro e
motorista: a tela da Central tem dados de pessoas reais e nao vai para o
repositorio publico).
"""
import os
import re
import sys

from PIL import Image, ImageChops, ImageStat

PASTA, APP, ROTULO, SAIDA = sys.argv[1:5]
GUARDAR_FOTOS = '--fotos' in sys.argv
INSTANTES = [1000, 3000, 6000, 9000, 12000, 19000]
LIMIAR_CORES = 100
LIMIAR_DIFERENCA = 20

EVENTOS = [
    ('primeiro_quadro', 'primeira tela desenhada'),
    ('gps', 'posição do GPS chegou'),
    ('mapa', 'mapa na tela'),
    ('mapa_pronto', 'mapa do Google pronto'),
    ('ruas', 'primeira imagem de ruas carregada'),
    ('marcadores', 'carros/motoristas no mapa'),
]


def regiao_do_mapa(caminho):
    """Meio da tela, onde fica o mapa (reduzido)."""
    try:
        img = Image.open(caminho).convert('RGB')
    except Exception:
        return None
    w, h = img.size
    return img.crop((int(w * 0.08), int(h * 0.30), int(w * 0.92), int(h * 0.62))).resize((160, 120))


def cores(regiao):
    """Cores diferentes (em 16 tons por canal)."""
    if regiao is None:
        return -1
    return len({(r >> 4, g >> 4, b >> 4) for r, g, b in regiao.get_flattened_data()}) if hasattr(regiao, 'get_flattened_data') \
        else len({(r >> 4, g >> 4, b >> 4) for r, g, b in regiao.getdata()})


def diferenca(a, b):
    """Diferenca media entre duas fotos (0 = iguais)."""
    if a is None or b is None:
        return 0
    return sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 3


def ler_imagens(nome):
    """Imagens do mapa que vieram da rede: (status, bytes, ms, instante)."""
    lista = []
    try:
        linhas = open(os.path.join(PASTA, f'{nome}-log.txt'), encoding='utf-8', errors='replace').read().splitlines()
    except FileNotFoundError:
        return lista
    for l in linhas:
        m = re.search(r'MEDIDA_IMG (\d+) (\d+)b (\d+)ms em=(\d+)', l)
        if m:
            lista.append(tuple(int(x) for x in m.groups()))
    return lista


def ler_eventos(nome):
    ev, api = {}, []
    try:
        linhas = open(os.path.join(PASTA, f'{nome}-log.txt'), encoding='utf-8', errors='replace').read().splitlines()
    except FileNotFoundError:
        return ev, api
    for l in linhas:
        m = re.search(r'MEDIDA (\S+) (\d+)\s*$', l)
        if m and m.group(1) not in ev:
            ev[m.group(1)] = int(m.group(2))
        m = re.search(r'MEDIDA_API (\S+) (\d+)ms status=(\d+) em=(\d+)', l)
        if m:
            api.append((m.group(1), int(m.group(2)), m.group(3), int(m.group(4))))
    return ev, api


def tempo_android(nome):
    try:
        txt = open(os.path.join(PASTA, f'{nome}-am.txt'), encoding='utf-8', errors='replace').read()
    except FileNotFoundError:
        return None
    m = re.search(r'TotalTime:\s*(\d+)', txt)
    return int(m.group(1)) if m else None


def fotos(nome):
    d = os.path.join(PASTA, 'fotos')
    lista = []
    for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        m = re.match(rf'{nome}-(\d+)\.png$', f)
        if m:
            lista.append((int(m.group(1)), os.path.join(d, f)))
    return lista


def seg(ms):
    return '—' if ms is None else f'{ms / 1000:.1f} s'


os.makedirs(SAIDA, exist_ok=True)
saida = []
p = saida.append
info = ''
try:
    info = open(os.path.join(PASTA, 'info.txt'), encoding='utf-8').read().strip().replace('\n', ' · ')
except FileNotFoundError:
    pass
p(f'Medicao do mapa — {APP} — "{ROTULO}"')
p(f'Aparelho de teste: emulador Android da esteira do GitHub ({info})')
REDE = os.environ.get('MEDIR_REDE', 'normal')
if REDE == '4g':
    p('Rede: a da esteira (EUA) LIMITADA como um 4G fraco: 6 Mbit/s para baixar, 1,5 para subir, 100 a 250 ms de atraso.')
else:
    p('Rede: a da esteira (EUA). Num celular no Brasil, com 4G, os tempos de rede tendem a ser maiores.')
p('')
NOMES = {'r1': 'r1 primeira abertura, GPS sem sinal nos primeiros 8 s',
         'r2': 'r2 segunda abertura (GPS ok, ruas guardadas)',
         'r3': 'r3 terceira abertura (igual a r2)'}
resumo = {}
for nome in ('r1', 'r2', 'r3'):
    ev, api = ler_eventos(nome)
    lista = fotos(nome)
    # A primeira foto ainda e a tela inicial do Android (cheia de cores):
    # mapa visivel = muitas cores E diferente dessa primeira foto.
    regioes = [(t, regiao_do_mapa(c)) for t, c in lista]
    caminho_base = os.path.join(PASTA, 'fotos', f'{nome}-base.png')
    base = regiao_do_mapa(caminho_base) if os.path.exists(caminho_base) else (regioes[0][1] if regioes else None)
    serie = [(t, cores(r), diferenca(r, base)) for t, r in regioes]
    primeira_com_mapa = next((t for t, n, d in serie if n >= LIMIAR_CORES and d >= LIMIAR_DIFERENCA), None)
    p(f'== {NOMES[nome]} ==')
    p(f'  Android até o primeiro quadro (TotalTime): {seg(tempo_android(nome))}')
    for chave, texto in EVENTOS:
        if chave in ev:
            p(f'  {texto}: {seg(ev[chave])} (desde o início do app)')
    faltando = [texto for chave, texto in EVENTOS if chave not in ev and chave not in ('mapa_pronto',)]
    if faltando:
        p(f'  não aconteceu nos 20 s: {", ".join(faltando)}')
    p(f'  mapa com ruas visível pela foto da tela: {seg(primeira_com_mapa)} (desde o toque no ícone)')
    p('  fotos (instante: cores/diferença da 1ª foto): ' + ', '.join(f'{t / 1000:.1f}s:{n}/{d:.0f}' for t, n, d in serie[::2]))
    if api:
        p('  servidor (1º pedido de cada caminho): ' + '; '.join(f'{c} {ms} ms ({s})' for c, ms, s, _ in api[:12]))
    imgs = ler_imagens(nome)
    finais = [i for i in imgs if i[1] > 0 or i[0] not in (429, 502, 503, 504)]
    devagar = [i for i in imgs if i[0] == 429]
    boas = [i for i in finais if i[0] == 200]
    # "todas as ruas da tela": a ultima imagem boa da primeira leva (antes de 15 s)
    leva = [i for i in boas if i[3] <= 15000]
    ultima = max((i[3] for i in leva), default=None)
    if imgs:
        p(f'  imagens do mapa pela rede: {len(boas)} certas, {len(finais) - len(boas)} com erro, {len(devagar)} respostas 429 ("devagar"), '
          f'{sum(i[1] for i in boas) // 1024} KB; última imagem da tela aos {seg(ultima)}')
    else:
        p('  imagens do mapa pela rede: nenhuma (vieram do guardado do celular)')
    p('')
    resumo[nome] = (ev.get('mapa'), ev.get('ruas'), primeira_com_mapa, ev.get('gps'), ev.get('marcadores'), ultima)
    if GUARDAR_FOTOS and lista:
        for alvo in INSTANTES:
            t, c = min(lista, key=lambda x: abs(x[0] - alvo))
            try:
                img = Image.open(c).convert('RGB')
                img.thumbnail((270, 600))
                img.save(os.path.join(SAIDA, f'{nome}-{alvo // 1000:02d}s.jpg'), quality=70)
            except Exception:
                pass

p('Resumo (mapa na tela / ruas pelo app / ruas pela foto / GPS / carros / todas as ruas da tela):')
for nome, (a, b, c, d, e, f) in resumo.items():
    p(f'  {nome}: {seg(a)} / {seg(b)} / {seg(c)} / {seg(d)} / {seg(e)} / {seg(f)}')
open(os.path.join(SAIDA, 'relatorio.txt'), 'w', encoding='utf-8').write('\n'.join(saida) + '\n')
print('\n'.join(saida))
