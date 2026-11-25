// Minimal static file server for the delivery-dashboard SPA.
//
// The app uses HashRouter, so client routes live in the URL fragment and never
// reach the server — no SPA rewrite/fallback is needed. The server only serves
// real files from the document root, plus the runtime-injected config.js that an
// init container writes into the mounted dynamic/ directory.
package main

import (
	"context"
	"errors"
	"log"
	"mime"
	"net/http"
	"os"
	"os/signal"
	"path"
	"strings"
	"syscall"
	"time"
)

const (
	defaultDocRoot = "/delivery-dashboard"
	addr           = ":8080"
	configPath     = "/dynamic/config.js"
)

func main() {
	// Extensions the Go stdlib builtin mime table doesn't cover on a scratch
	// image (no /etc/mime.types). .ico in particular ships in the dist and
	// would otherwise be content-sniffed. .js/.mjs/.webp are registered
	// explicitly too so the Content-Type is guaranteed, not table-dependent.
	_ = mime.AddExtensionType(".ico", "image/x-icon")
	_ = mime.AddExtensionType(".webp", "image/webp")
	_ = mime.AddExtensionType(".js", "application/javascript")
	_ = mime.AddExtensionType(".mjs", "application/javascript")

	fsys := noListFS{http.Dir(docRoot())}
	fileServer := http.FileServer(fsys)

	handler := func(w http.ResponseWriter, r *http.Request) {
		setCacheControl(w, r.URL.Path)

		if clientAcceptsGzip(r) {
			if tryServePrecompressed(w, r, fsys) {
				return
			}
		}
		fileServer.ServeHTTP(w, r)
	}

	srv := &http.Server{
		Addr:              addr,
		Handler:           http.HandlerFunc(handler),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		// Generous: large bundles over slow mobile links must still finish.
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown so a rolling deploy lets in-flight responses finish
	// instead of resetting connections on SIGTERM.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	go func() {
		log.Printf("serving %s on %s", docRoot(), addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	<-ctx.Done()
	stop()
	log.Print("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("graceful shutdown failed: %v", err)
	}
}

// setCacheControl applies the right caching policy per resource:
//   - /assets/* are content-hashed by Vite (e.g. index-DP4ZqrXI.js), so their
//     content never changes under a given name — cache forever, skip revalidation.
//   - config.js is runtime config an init container may rewrite on pod restart;
//     clients must never cache it.
//   - everything else (index.html, favicon.ico, manifest.json) keeps a stable
//     name but can change across deploys, so store-but-revalidate: a stale entry
//     point would reference hashed assets that no longer exist.
func setCacheControl(w http.ResponseWriter, urlPath string) {
	switch {
	case urlPath == configPath:
		w.Header().Set("Cache-Control", "no-store")
	case strings.HasPrefix(urlPath, "/assets/"):
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	default:
		w.Header().Set("Cache-Control", "no-cache")
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

// tryServePrecompressed looks for a <path>.gz sidecar baked into the image by
// the Dockerfile. If found it serves it directly — no per-request compression.
// The lookup goes through fsys (an http.Dir), which cleans the path and rejects
// traversal, so the .gz path has the same safety guarantees as the fallthrough.
// Returns true when the response has been written.
func tryServePrecompressed(w http.ResponseWriter, r *http.Request, fsys http.FileSystem) bool {
	// Don't try to serve a .gz of a directory; fall through to the file server.
	if strings.HasSuffix(r.URL.Path, "/") {
		return false
	}

	f, err := fsys.Open(r.URL.Path + ".gz")
	if err != nil {
		return false
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil || fi.IsDir() {
		return false
	}

	// Derive the Content-Type from the original file's extension (the URL path
	// without the .gz we appended). path.Ext is "" when there's no dot, which
	// mime.TypeByExtension handles by returning "".
	ct := mime.TypeByExtension(strings.ToLower(path.Ext(r.URL.Path)))
	if ct == "" {
		ct = "application/octet-stream"
	}

	w.Header().Set("Content-Type", ct)
	w.Header().Set("Content-Encoding", "gzip")
	w.Header().Add("Vary", "Accept-Encoding")
	// Serve the original name (without .gz) so any content sniffing / logging
	// sees the logical resource; ServeContent uses the explicit Content-Type set
	// above rather than re-sniffing the gzipped bytes.
	http.ServeContent(w, r, strings.TrimSuffix(fi.Name(), ".gz"), fi.ModTime(), f)
	return true
}

// noListFS wraps http.FileSystem to suppress directory listings while still
// serving a directory's index.html. http.FileServer opens a directory, and if
// it finds no index file it renders a listing of the contents — which would
// expose /assets/ etc. We can't just reject every directory open: that breaks
// "/" (and the k8s probes that GET it), because serving "/" means opening the
// root dir to resolve its index.html. So on a directory open we probe for an
// index.html inside: present -> allow the open (FileServer serves the index);
// absent -> return fs.ErrNotExist, which FileServer turns into a clean 404
// instead of a listing.
type noListFS struct{ http.FileSystem }

func (n noListFS) Open(name string) (http.File, error) {
	f, err := n.FileSystem.Open(name)
	if err != nil {
		return nil, err
	}
	fi, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	if fi.IsDir() {
		index := strings.TrimSuffix(name, "/") + "/index.html"
		if idx, ierr := n.FileSystem.Open(index); ierr != nil {
			f.Close()
			return nil, os.ErrNotExist
		} else {
			idx.Close()
		}
	}
	return f, nil
}

