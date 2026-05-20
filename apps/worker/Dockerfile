FROM node:22-slim
RUN npm install -g pnpm@9.12.0
WORKDIR /app
COPY . .
RUN pnpm install
CMD ["pnpm", "--filter", "@wardrobe/worker", "dev"]
