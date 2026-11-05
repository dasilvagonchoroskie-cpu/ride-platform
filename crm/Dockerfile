# CRM Fortaleza Move — imagem para Render (ou qualquer Docker).
# Os dados (data/) vivem num disco temporário e são guardados no cofre criptografado (src/persist.js).
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
# Biblioteca do WhatsApp (Baileys) instalada no build, fora de data/ (não entra no retrato do cofre).
RUN mkdir -p /opt/wa-lib && cd /opt/wa-lib && echo '{"name":"wa-lib","version":"1.0.0","private":true}' > package.json \
 && npm install --omit=dev --ignore-scripts --no-audit --no-fund @whiskeysockets/baileys

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
