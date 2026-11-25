// Minimal static file server for the delivery-dashboard SPA.
//
// The app uses HashRouter, so client routes live in the URL fragment and never
// reach the server — no SPA rewrite/fallback is needed. The server only serves
// real files from the document root, plus the runtime-injected config.js that an
// init container writes into the mounted dynamic/ directory.
package main

import (
	"compress/gzip"
	"log"
	"mime"
	"net/http"
	"os"
	"strings"
)

const (
	defaultDocRoot = "/delivery-dashboard"
	addr           = ":8080"
	configPath     = "/dynamic/config.js"
)

// compressibleTypes are the content-type prefixes worth gzipping. Binary assets
// (png/jpg/webp/ico/woff) are already compressed, so we pass them through.
var compressibleTypes = []string{
	"text/",
	"application/javascript",
	"application/json",
	"image/svg+xml",
}

func main() {
	// Extensions the Go stdlib mime table may not cover on a scratch image
	// (no /etc/mime.types). Registering them keeps Content-Type correct.
	_ = mime.AddExtensionType(".webp", "image/webp")
	_ = mime.AddExtensionType(".js", "application/javascript")
	_ = mime.AddExtensionType(".mjs", "application/javascript")

	fileServer := http.FileServer(http.Dir(docRoot()))

	handler := func(w http.ResponseWriter, r *http.Request) {
		// Runtime config must never be cached: a pod restart may rewrite it with
		// new REACT_APP_* values and clients must pick those up immediately.
		if r.URL.Path == configPath {
			w.Header().Set("Cache-Control", "no-store")
		}

		if clientAcceptsGzip(r) {
			serveGzip(w, r, fileServer)
			return
		}
		fileServer.ServeHTTP(w, r)
	}

	log.Printf("serving %s on %s", docRoot(), addr)
	srv := &http.Server{Addr: addr, Handler: http.HandlerFunc(handler)}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

// docRoot is the directory served. Overridable via DOC_ROOT for local testing
// without the container's absolute path; defaults to the in-container mount.
func docRoot() string {
	if v := os.Getenv("DOC_ROOT"); v != "" {
		return v
	}
	return defaultDocRoot
}

func clientAcceptsGzip(r *http.Request) bool {
	for _, enc := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		if strings.TrimSpace(strings.SplitN(enc, ";", 2)[0]) == "gzip" {
			return true
		}
	}
	return false
}

func serveGzip(w http.ResponseWriter, r *http.Request, next http.Handler) {
	// Always vary on the encoding so caches/proxies don't mix compressed and
	// plain responses for the same URL.
	w.Header().Add("Vary", "Accept-Encoding")
	gzw := &gzipResponseWriter{ResponseWriter: w}
	defer gzw.Close()
	next.ServeHTTP(gzw, r)
}

// gzipResponseWriter lazily starts gzip only once it sees a compressible
// Content-Type. Content-Type is resolved by the FileServer on the first Write
// (via http.DetectContentType) or by an explicit header set, so we decide at
// WriteHeader / first Write time.
type gzipResponseWriter struct {
	http.ResponseWriter
	gz      *gzip.Writer
	decided bool
}

func (g *gzipResponseWriter) WriteHeader(status int) {
	g.decide()
	g.ResponseWriter.WriteHeader(status)
}

func (g *gzipResponseWriter) Write(b []byte) (int, error) {
	if !g.decided {
		// No explicit WriteHeader call → sniff from the body like net/http does,
		// so the decision matches the Content-Type the client will see.
		if g.ResponseWriter.Header().Get("Content-Type") == "" {
			g.ResponseWriter.Header().Set("Content-Type", http.DetectContentType(b))
		}
		g.decide()
	}
	if g.gz != nil {
		return g.gz.Write(b)
	}
	return g.ResponseWriter.Write(b)
}

// decide inspects the resolved Content-Type and, if compressible, switches the
// response to gzip. Called exactly once (guarded by g.decided).
func (g *gzipResponseWriter) decide() {
	if g.decided {
		return
	}
	g.decided = true
	if !isCompressible(g.ResponseWriter.Header().Get("Content-Type")) {
		return
	}
	// Content-Length would be wrong after compression; drop it and let the
	// response be chunked.
	g.ResponseWriter.Header().Del("Content-Length")
	g.ResponseWriter.Header().Set("Content-Encoding", "gzip")
	g.gz = gzip.NewWriter(g.ResponseWriter)
}

func (g *gzipResponseWriter) Close() {
	if g.gz != nil {
		g.gz.Close()
	}
}

func isCompressible(contentType string) bool {
	ct := strings.ToLower(contentType)
	for _, p := range compressibleTypes {
		if strings.HasPrefix(ct, p) {
			return true
		}
	}
	return false
}
