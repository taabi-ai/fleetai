# syntax=docker/dockerfile:1.7
# apps/web/Dockerfile — Next.js 16 standalone output.
ARG NODE_VERSION=24.21.0
FROM node:${NODE_VERSION}-alpine AS runtime
RUN apk add --no-cache tini && addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=ghcr.io/fleetai/platform-build /out/apps/web/.next/standalone .
COPY --from=ghcr.io/fleetai/platform-build /out/apps/web/.next/static ./.next/static
COPY --from=ghcr.io/fleetai/platform-build /out/apps/web/public ./public
USER app
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","server.js"]
