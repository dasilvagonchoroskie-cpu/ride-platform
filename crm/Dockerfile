# CRM Fortaleza Move — imagem para Render (ou qualquer Docker).
# Os dados (data/) vivem num disco temporário e são guardados no cofre criptografado (src/persist.js).
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
# Biblioteca do WhatsApp (Baileys) com versão e dependências FIXAS (wa-lib/package-lock.json), instalada fora de data/.
# Para atualizar: mudar a versão em wa-lib/package.json, gerar o lock de novo, revisar e testar.
COPY wa-lib/package.json wa-lib/package-lock.json /opt/wa-lib/
RUN cd /opt/wa-lib && npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-slim
ENV NODE_ENV=production WA_LIB_DIR=/opt/wa-lib FM_DATA_DIR=/app/data
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /opt/wa-lib /opt/wa-lib
COPY . .
RUN rm -rf data test && mkdir -p data && chown -R node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "start.js"]
