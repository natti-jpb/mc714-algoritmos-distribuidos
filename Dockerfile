# Imagem única usada por todos os serviços (nós, observer, web).
# O comando concreto é definido por serviço no docker-compose.yml.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# 8080 = observer (telemetria/controle) | 5173 = webapp | 9200+ = portas dos nós
EXPOSE 8080 5173

CMD ["npx", "tsx", "src/node/index.ts"]
