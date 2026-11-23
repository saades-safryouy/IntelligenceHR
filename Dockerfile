# IntelligenceHR frontend — React 19 + Vite (Railway)
FROM node:20

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite bakes VITE_* variables at build time; .env.production in the repo
# points at the live Railway backend.
RUN npm run build

EXPOSE 4173
CMD ["sh", "-c", "npx vite preview --host 0.0.0.0 --port ${PORT:-4173}"]
