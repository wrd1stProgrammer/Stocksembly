# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ make python3 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.34.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8
ENV HOSTNAME=127.0.0.1
ENV PORT=3000
ENV HOME=/home/ec2-user

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates locales \
    && sed -i 's/^# *en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen \
    && locale-gen \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build --chown=node:node /app/.next/standalone ./

RUN install -d -m 0700 -o node -g node /home/ec2-user/.codex/tmp \
    && install -d -m 0755 /etc/pki/ca-trust/extracted/pem \
    && touch /etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem

ENV TMPDIR=/home/ec2-user/.codex/tmp

USER node

EXPOSE 3000

CMD ["node", "server.js"]
