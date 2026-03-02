FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

COPY package.json .
RUN npm install

COPY . .

EXPOSE 8082

CMD ["node", "src/index.js"]
