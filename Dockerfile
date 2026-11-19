FROM node:26-alpine3.24@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS node-builder

WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY index.html vite.config.js .env.production ./
COPY public ./public
COPY src ./src

RUN npm run build

################################################

FROM alpine:3.24@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf

RUN apk add --no-cache \
  lighttpd \
  && mkdir /cache \
  && chown 10000:10000 /cache

COPY --from=node-builder --chown=10000:10000 /src/dist /delivery-dashboard
COPY --chown=10000:10000 lighttpd.conf /lighttpd.conf

USER 10000:10000
ENTRYPOINT ["/usr/sbin/lighttpd", "-D", "-f", "/lighttpd.conf"]
