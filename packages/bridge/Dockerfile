# html2figma 릴레이 — 범용 컨테이너 이미지 (Fly.io / Railway / Koyeb 등)
# 저장소 루트를 컨텍스트로 빌드: docker build -f packages/bridge/Dockerfile .
FROM node:20-alpine AS build
ENV CI=true
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile \
 && pnpm --filter @html2figma/shared build \
 && pnpm --filter @html2figma/bridge build

FROM node:20-alpine AS run
WORKDIR /app
# 번들된 server.js 에는 shared 가 인라인되어 있어 런타임엔 ws 만 필요하다.
COPY --from=build /app/packages/bridge/dist/server.js ./server.js
RUN printf '{"type":"module","dependencies":{"ws":"^8.18.0"}}' > package.json \
 && npm install --omit=dev --no-package-lock
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
