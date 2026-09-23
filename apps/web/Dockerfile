# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS build

ARG SENTRY_UPLOAD_SOURCE_MAPS=false
ARG SENTRY_RELEASE
ENV SENTRY_UPLOAD_SOURCE_MAPS=${SENTRY_UPLOAD_SOURCE_MAPS}
ENV SENTRY_RELEASE=${SENTRY_RELEASE}
ENV NEXT_PUBLIC_SENTRY_RELEASE=${SENTRY_RELEASE}

ARG NEXT_PUBLIC_COGNITO_USER_POOL_ID
ARG NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID
ARG NEXT_PUBLIC_COGNITO_DOMAIN
ARG NEXT_PUBLIC_APP_ORIGIN
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
ARG NEXT_PUBLIC_STATIC_ASSET_BASE_URL
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
ARG NEXT_PUBLIC_META_PIXEL_ID

ENV NEXT_PUBLIC_COGNITO_USER_POOL_ID=${NEXT_PUBLIC_COGNITO_USER_POOL_ID}
ENV NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=${NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID}
ENV NEXT_PUBLIC_COGNITO_DOMAIN=${NEXT_PUBLIC_COGNITO_DOMAIN}
ENV NEXT_PUBLIC_APP_ORIGIN=${NEXT_PUBLIC_APP_ORIGIN}
ENV NEXT_PUBLIC_GA_MEASUREMENT_ID=${NEXT_PUBLIC_GA_MEASUREMENT_ID}
ENV NEXT_PUBLIC_META_PIXEL_ID=${NEXT_PUBLIC_META_PIXEL_ID}
ENV NEXT_PUBLIC_STATIC_ASSET_BASE_URL=${NEXT_PUBLIC_STATIC_ASSET_BASE_URL}
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates g++ make python3 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.34.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN --mount=type=secret,id=sentry_auth_token \
    pnpm build:web \
    && node scripts/upload-sentry-sourcemaps.mjs web

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8
ENV HOSTNAME=127.0.0.1
ENV PORT=3000
ENV HOME=/home/ec2-user
ENV STOCKSEMBLY_MIGRATIONS_DIR=/app/migrations

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl locales \
    && curl --fail --silent --show-error \
      https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
      --output /etc/ssl/certs/aws-rds-global-bundle.pem \
    && sed -i 's/^# *en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen \
    && locale-gen \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build --chown=node:node /app/.next/standalone ./
# Payment domain verification must be served directly from the application origin.
COPY --from=build --chown=node:node /app/public/.well-known ./public/.well-known

RUN install -d -m 0700 -o node -g node /home/ec2-user/.codex/tmp \
    && install -d -m 0755 /etc/pki/ca-trust/extracted/pem \
    && touch /etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem \
    && chown node:node /app /home/ec2-user

ENV TMPDIR=/home/ec2-user/.codex/tmp

USER node

EXPOSE 3000

CMD ["node", "server.js"]
