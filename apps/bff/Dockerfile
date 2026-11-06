# Образ BFF: сборки BFF и клиента одного коммита. Собирается из корня монорепы: bun run image
FROM oven/bun:1.4.4-alpine
# полный SHA коммита: по метке CD сверяет образ с релизом до выкатки (frontend#4, infra#74)
ARG RELEASE_SHA=dev
LABEL org.opencontainers.image.revision=$RELEASE_SHA \
      org.opencontainers.image.source=https://github.com/Cringe-Driven-Development-Team/frontend
WORKDIR /app
COPY apps/bff/dist/bff.js /app/bff.js
COPY apps/client/dist/index.html /app/client/index.html
# Публичные файлы: список совпадает с PUBLIC_FILES в src/public.ts
COPY apps/client/dist/sw.js apps/client/dist/offline.html apps/client/dist/offline.css apps/client/dist/onest-variable.woff2 apps/client/dist/manifest.webmanifest apps/client/dist/pwa-192.png apps/client/dist/pwa-512.png \
     apps/client/dist/pwa-maskable-512.png apps/client/dist/apple-touch-icon.png /app/client/
USER bun
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:3000/health || exit 1
CMD ["bun", "bff.js"]
