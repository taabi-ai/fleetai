# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24.21.0
FROM node:${NODE_VERSION}-alpine AS runtime
RUN apk add --no-cache tini && addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=ghcr.io/fleetai/platform-build /out .
COPY routes.yaml ./routes.yaml
USER app
EXPOSE 4000
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","dist/main.js"]
