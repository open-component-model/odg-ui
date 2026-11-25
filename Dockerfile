FROM node:26-alpine3.24@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS node-builder

WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY index.html vite.config.js .env.production ./
COPY public ./public
COPY src ./src

RUN npm run build

################################################

FROM golang:1.27-alpine@sha256:70bd7ddea8b6cbe5d6943cde279d6b67feb10cc924fb9100d1d8757c1575b280 AS go-builder

WORKDIR /app

COPY server/go.mod ./
RUN go mod download

COPY server/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /server .

################################################

FROM scratch

# No shell, no libc, no package manager. The k8s securityContext pins the
# runtime uid/gid (10000, runAsNonRoot); the binary only reads the world-
# readable dist and writes nothing (config.js is written by the init container
# into a separate emptyDir mount).
COPY --from=go-builder /server /server
COPY --from=node-builder /src/dist /delivery-dashboard

EXPOSE 8080
ENTRYPOINT ["/server"]
