FROM node:24-alpine AS builder

ENV NEXT_TELEMETRY_DISABLED=1 \
    PATH=/app/node_modules/.bin:$PATH
ARG OPEN_MERCATO_DOCKER_REGISTRY_HOST=host.docker.internal
ARG NEXT_PUBLIC_DOCUMENTS_COLLAB_URL
ENV NEXT_PUBLIC_DOCUMENTS_COLLAB_URL=${NEXT_PUBLIC_DOCUMENTS_COLLAB_URL}
# Module enablement is baked in by `yarn generate` below, not read at container
# runtime — the ECS task definition's own OM_ENABLE_STORAGE_S3=true only takes
# effect because it's also set here at build time. Setting it only at runtime
# (without this) silently no-ops: the module never gets compiled in.
ENV OM_ENABLE_STORAGE_S3=true

WORKDIR /app

RUN apk add --no-cache python3 make g++ ca-certificates openssl
RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
RUN if grep -Eq 'http://(localhost|127\\.0\\.0\\.1):' .yarnrc.yml; then \
      sed \
        -e "s#http://localhost:#http://${OPEN_MERCATO_DOCKER_REGISTRY_HOST}:#g" \
        -e "s#http://127.0.0.1:#http://${OPEN_MERCATO_DOCKER_REGISTRY_HOST}:#g" \
        .yarnrc.yml > .yarnrc.yml.container; \
      if ! grep -Eq '^checksumBehavior:' .yarnrc.yml.container; then \
        printf '\nchecksumBehavior: update\n' >> .yarnrc.yml.container; \
      fi; \
      mv .yarnrc.yml.container .yarnrc.yml; \
    fi
RUN yarn install

COPY . .
RUN yarn generate && sed -i 's/^CACHE_STRATEGY=.*/CACHE_STRATEGY=memory/' .env
RUN node ./scripts/patch-node24-json-imports.mjs && \
    NODE_OPTIONS="--max-old-space-size=1024" NODE_ENV=production node --max-old-space-size=2048 ./node_modules/.bin/next build && \
    rm -rf .mercato/next/.cache

FROM node:24-alpine AS dev

ENV NODE_ENV=development \
    NEXT_TELEMETRY_DISABLED=1 \
    PATH=/app/node_modules/.bin:$PATH
ARG OPEN_MERCATO_DOCKER_REGISTRY_HOST=host.docker.internal

WORKDIR /app

RUN apk add --no-cache python3 make g++ ca-certificates openssl
RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
RUN if grep -Eq 'http://(localhost|127\\.0\\.0\\.1):' .yarnrc.yml; then \
      sed \
        -e "s#http://localhost:#http://${OPEN_MERCATO_DOCKER_REGISTRY_HOST}:#g" \
        -e "s#http://127.0.0.1:#http://${OPEN_MERCATO_DOCKER_REGISTRY_HOST}:#g" \
        .yarnrc.yml > .yarnrc.yml.container; \
      if ! grep -Eq '^checksumBehavior:' .yarnrc.yml.container; then \
        printf '\nchecksumBehavior: update\n' >> .yarnrc.yml.container; \
      fi; \
      mv .yarnrc.yml.container .yarnrc.yml; \
    fi
RUN yarn install

COPY . .

COPY docker/scripts/dev-entrypoint.sh /app/docker/scripts/dev-entrypoint.sh
COPY docker/scripts/init-or-migrate.sh /app/docker/scripts/init-or-migrate.sh
COPY docker/scripts/mcp-entrypoint.sh /app/docker/scripts/mcp-entrypoint.sh
RUN chmod +x /app/docker/scripts/dev-entrypoint.sh
RUN chmod +x /app/docker/scripts/init-or-migrate.sh
RUN chmod +x /app/docker/scripts/mcp-entrypoint.sh

EXPOSE 3000 4101
CMD ["/bin/sh", "/app/docker/scripts/dev-entrypoint.sh"]

FROM node:24-alpine AS runner

ARG CONTAINER_PORT=3000
ARG DOCUMENTS_COLLAB_PORT=4101
ARG OPEN_MERCATO_DOCKER_REGISTRY_HOST=host.docker.internal
# Chromium backs the Documents PDF export (puppeteer-core). Build with
# --build-arg INSTALL_CHROMIUM=1 to include it; PDF export otherwise returns 503.
ARG INSTALL_CHROMIUM=0

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PATH=/app/node_modules/.bin:$PATH \
    PORT=${CONTAINER_PORT} \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN adduser -D -u 1001 omuser

WORKDIR /app

RUN if [ "$INSTALL_CHROMIUM" = "1" ]; then \
      apk add --no-cache ca-certificates chromium openssl; \
    else \
      apk add --no-cache ca-certificates openssl; \
    fi
RUN corepack enable
# Reuse the Yarn binary the builder already downloaded so corepack does not
# attempt a network fetch at container start-up. The runner runs as omuser,
# so the cache must live in that user's home, not /root/.cache.
RUN mkdir -p /home/omuser/.cache/node
COPY --from=builder /root/.cache/node/corepack /home/omuser/.cache/node/corepack
RUN chown -R omuser:omuser /home/omuser/.cache

COPY --chown=omuser:omuser package.json yarn.lock .yarnrc.yml ./
RUN if grep -Eq 'http://(localhost|127\\.0\\.0\\.1):' .yarnrc.yml; then \
      sed \
        -e "s#http://localhost:#http://${OPEN_MERCATO_DOCKER_REGISTRY_HOST}:#g" \
        -e "s#http://127.0.0.1:#http://${OPEN_MERCATO_DOCKER_REGISTRY_HOST}:#g" \
        .yarnrc.yml > .yarnrc.yml.container; \
      if ! grep -Eq '^checksumBehavior:' .yarnrc.yml.container; then \
        printf '\nchecksumBehavior: update\n' >> .yarnrc.yml.container; \
      fi; \
      mv .yarnrc.yml.container .yarnrc.yml; \
    fi
RUN yarn workspaces focus --all --production && chown -R omuser:omuser node_modules

# .mercato includes .mercato/next — do not copy .mercato/next separately (duplicates 2 GB)
COPY --chown=omuser:omuser --from=builder /app/.mercato ./.mercato
COPY --chown=omuser:omuser --from=builder /app/public ./public
COPY --chown=omuser:omuser --from=builder /app/src ./src
COPY --chown=omuser:omuser --from=builder /app/types ./types
COPY --chown=omuser:omuser --from=builder /app/next.config.ts ./next.config.ts
COPY --chown=omuser:omuser --from=builder /app/postcss.config.mjs ./postcss.config.mjs
COPY --chown=omuser:omuser --from=builder /app/components.json ./components.json
COPY --chown=omuser:omuser --from=builder /app/tsconfig.json ./tsconfig.json
COPY --chown=omuser:omuser --from=builder /app/scripts ./scripts
COPY --chown=omuser:omuser docker/scripts/init-or-migrate.sh /app/docker/scripts/init-or-migrate.sh
# Used by the optional `mcp` service (compose profile `agents`).
COPY --chown=omuser:omuser docker/scripts/mcp-entrypoint.sh /app/docker/scripts/mcp-entrypoint.sh
RUN chmod +x /app/docker/scripts/init-or-migrate.sh /app/docker/scripts/mcp-entrypoint.sh

USER omuser

EXPOSE ${CONTAINER_PORT} ${DOCUMENTS_COLLAB_PORT}
CMD ["yarn", "start"]
