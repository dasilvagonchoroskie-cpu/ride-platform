# App do Passageiro (React Native + Expo)

## Fluxo implementado

1. **Onboarding** — telefone com DDD, OTP por SMS (ou entrada direta em modo demonstracao).
2. **Home** — mapa com motoristas proximos, busca de destino com sugestoes e recentes.
3. **Confirmacao** — categorias (Moto, Ride, Comfort, Black, Van) com preco, ETA e
   distancia; escolha da forma de pagamento.
4. **Pareamento** — busca com pulso animado, progresso por etapas e PIN de embarque.
5. **Viagem** — mapa com rota, dados do motorista (nome, nota, veiculo, placa) e metricas.
6. **Conclusao** — recibo com valores, avaliacao por estrelas e tags.
7. **Historico** — resumo (total gasto, media) e detalhe de cada corrida.
8. **Pagamento** — formas de pagamento e cupons.
9. **Conta** — dados pessoais, enderecos recentes e diagnostico do app.

## Modo demonstracao

Quando `EXPO_PUBLIC_API_URL` esta vazio (ou a API nao responde), o app usa
`src/mock/demoEngine.ts` e executa o fluxo inteiro no aparelho: estimativa de preco,
motoristas proximos, pareamento, rota e historico. Isso permite instalar e avaliar o APK
sem servidor. A tela **Conta** mostra qual fonte de dados esta ativa.

## Mapa

`src/components/MapCanvas.tsx` renderiza o mapa com `react-native-svg` — sem dependencia
nativa do Google Maps, portanto funciona em qualquer APK. Para usar o mapa real, instale
`react-native-maps`, defina `GOOGLE_MAPS_ANDROID_KEY` e troque o componente (a interface
de props e a mesma).

## Scripts

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm prebuild     # expo prebuild --platform android --clean
pnpm start        # Metro
```

## Build do APK

Gerado pelo workflow `.github/workflows/android-apks.yml`. Detalhes em
`docs/05-build-apk.md`.
