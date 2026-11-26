FROM node:26-alpine3.24@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS node-builder

WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY index.html vite.config.js .env.production ./
COPY public ./public
COPY src ./src

RUN npm run build

# Pre-compress all compressible assets so the server can serve .gz sidecars
# directly instead of allocating a gzip.Writer per request. Uses BusyBox gzip
# short flags (-9 best, -k keep); the long --best/--keep forms are GNU-only and
# fail on Alpine. -print0/-0 handles paths with spaces and skips gzip entirely
# when nothing matches.
RUN find /src/dist -type f \( \
      -name "*.js" -o -name "*.mjs" -o -name "*.css" \
      -o -name "*.html" -o -name "*.json" -o -name "*.svg" \
      -o -name "*.txt" -o -name "*.xml" \
    \) -print0 | xargs -0 -r -P4 gzip -9 -k

RUN mkdir -p /src/dist/dynamic && \
    echo "window.REACT_APP_DELIVERY_SERVICE_API_URL = 'http://localhost:5000';" \
    > /src/dist/dynamic/config.js

################################################

FROM scratch

# Caddy is statically linked — no libc needed. Even with admin off and
# auto_https off it writes autosave.json / instance.uuid to $XDG_CONFIG_HOME
# (/config) and $XDG_DATA_HOME (/data); those are mounted as emptyDir volumes
# in the Helm chart so readOnlyRootFilesystem: true is satisfied.
COPY --from=caddy:2-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0 /usr/bin/caddy /caddy
COPY --from=node-builder /src/dist /delivery-dashboard
COPY Caddyfile /etc/caddy/Caddyfile

ENV XDG_CONFIG_HOME=/config
ENV XDG_DATA_HOME=/data

USER 10000:10000
EXPOSE 8080
ENTRYPOINT ["/caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
