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

################################################

FROM golang:1.27-alpine@sha256:70bd7ddea8b6cbe5d6943cde279d6b67feb10cc924fb9100d1d8757c1575b280 AS go-builder

WORKDIR /app

COPY server/go.mod ./
RUN go mod download

COPY server/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /server .

################################################

FROM scratch

# No shell, no libc, no package manager. USER locks the runtime uid/gid into
# the image itself; the k8s securityContext reinforces it at the pod level. The
# binary only reads the world-readable dist and writes nothing (config.js is
# written by the init container into a separate emptyDir mount).
COPY --from=go-builder /server /server
COPY --from=node-builder /src/dist /delivery-dashboard

USER 10000:10000
EXPOSE 8080
ENTRYPOINT ["/server"]
