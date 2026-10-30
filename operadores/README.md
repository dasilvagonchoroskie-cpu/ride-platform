# Apps de outros operadores (etapa 6)

Mesmo código, com o nome, a cor, os ícones e o pacote (Google Play) de outro
operador. Cada pasta aqui é um operador; `exemplo/` é só para testar a esteira.

## Criar

```
bash scripts/novo-app.sh --operador goiatuba --nome "Goiatuba Mov" --cor "#12AB34" \
     --pacote br.com.goiatubamov --icone-passageiro simbolo.png --icone-motorista simbolo.png --enviar
```

- `--pacote`: vira `<pacote>.passageiro` e `<pacote>.motorista` na Google Play.
  Depois de publicado, não muda nunca.
- Ícones: PNG com fundo transparente (só o desenho). A esteira monta o ícone
  adaptativo com o símbolo a ~60% do ícone que aparece no celular, sobre
  `--fundo` (padrão #0070B8), mais o redondo, o legado e o monocromático do
  Android 13+. Fundo branco (ou xadrez desenhado) é removido sozinho, com
  aviso. Sem ícone, fica o da Fortaleza Move.
- `--api`: servidor do operador (padrão: o da Fortaleza Move).
- `--enviar`: grava no GitHub e roda a esteira **App de operador**.

A esteira compila os dois APKs e confere dentro do APK o pacote e o nome que
aparece no celular (relatório em `logs/operadores/<operador>/`).

## O que fica com o operador

- Aviso push: registrar os dois pacotes no Firebase (sem isso, o app funciona
  com o vigia próprio, sem push).
- Google Play: conta de desenvolvedor e ficha da loja.
- Nome, cor, logo e faixa do Início também mudam pela Central
  (Configurações → Aparência do app), sem gerar app novo.
