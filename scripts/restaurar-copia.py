#!/usr/bin/env python3
"""Restaurar a copia do banco (so em caso de perda de dados).

1) Baixe a copia (.json.gz.age) dos artefatos da esteira "Copia diaria do banco".
2) Rode:  python3 scripts/restaurar-copia.py COPIA.json.gz.age CHAVE.txt > restaurar.sql
   (CHAVE.txt = a chave privada AGE-SECRET-KEY-1... que esta no arquivo do projeto)
3) Rode o restaurar.sql no banco (vazio, com o esquema criado). Cada tabela
   entra com json_populate_recordset; linha que ja existe e ignorada.

Precisa: pip install pyrage
"""
import gzip
import json
import sys

import pyrage


def main() -> None:
    copia, chave = sys.argv[1], sys.argv[2]
    ident = pyrage.x25519.Identity.from_str(open(chave).read().strip())
    dados = json.loads(gzip.decompress(pyrage.decrypt(open(copia, 'rb').read(), [ident])))
    tabelas = dados['tabelas']
    print('-- Copia gerada em', dados.get('geradoEm'))
    print('BEGIN;')
    # Sem checar chaves estrangeiras durante a carga (a ordem das tabelas nao importa).
    print("SET LOCAL session_replication_role = replica;")
    for nome, linhas in tabelas.items():
        if not linhas:
            continue
        corpo = json.dumps(linhas, ensure_ascii=False).replace("'", "''")
        print(f'INSERT INTO public."{nome}" SELECT * FROM json_populate_recordset(NULL::public."{nome}", \'{corpo}\') ON CONFLICT DO NOTHING;')
    print('COMMIT;')
    print('-- Linhas por tabela:', json.dumps(dados.get('contagem', {})), file=sys.stderr)


if __name__ == '__main__':
    main()
