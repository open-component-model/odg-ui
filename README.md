# Open Delivery Gear UI

[![REUSE status](https://api.reuse.software/badge/github.com/open-component-model/odg-ui)](https://api.reuse.software/info/github.com/open-component-model/odg-ui)

![tests](https://github.com/open-component-model/odg-ui/actions/workflows/non-release.yaml/badge.svg)
![release](https://github.com/open-component-model/odg-ui/actions/workflows/release.yaml/badge.svg)

This repository is used for developing the `Delivery Dashboard`, which is part of the Open
Delivery Gear. It is run against the `Delivery Service` as backing API and displays delivery
metadata for OCM-based deliveries.

It is written in `javascript` and uses `react` as well as the react component
framework `material-ui`.

## Development

To run the local dev server:

```
npm start
```

The dev server starts on [http://localhost:3000](http://localhost:3000).

For startup, `Delivery-Dashboard` requires a running instance of `Delivery-Service`.
Configure the API URL via `.env.development` or by setting the `VITE_DELIVERY_SERVICE_API_URL`
environment variable before running `npm start`.

To produce a production build:

```
npm run build
```

Output goes to `dist/`. Preview the production build locally with `npm run preview`.

## Running as a container locally

Build the image:

```
docker build --progress=plain -t odg-ui .
```

Note: the `Build:` footer will show `dev-build`, as the real version is only patched into
`.env.production` by the CI pipeline during release builds.

Start it (lighttpd serves on port 8080 inside the container, expose it e.g. on port 3000):

```
docker run -d --rm --name odg-ui -p 3000:8080 odg-ui
```

The dashboard expects the `Delivery-Service` API URL to be injected at runtime via
`/dynamic/config.js` (in deployed environments, this file is written by an init container
from the pod's `REACT_APP_*` environment variables). For a local container, write it
manually (adjust the URL to where your `Delivery-Service` listens):

```
docker exec odg-ui sh -c \
  "mkdir -p /delivery-dashboard/dynamic && \
   printf \"window.REACT_APP_DELIVERY_SERVICE_API_URL = 'http://localhost:5000';\\n\" \
   > /delivery-dashboard/dynamic/config.js"
```

The dashboard is now available at [http://localhost:3000](http://localhost:3000).

To stop the container:

```
docker stop odg-ui
```

Thanks to the `--rm` flag, the container is deleted automatically once stopped. If you
started it without `--rm`, delete it explicitly with `docker rm odg-ui`.

## Code style

Make use of [eslint](https://eslint.org/) and use our config `eslint.config.mjs`.
Also, it is recommended to install a pre-push hook executing `eslint`.
Please note that linter plugins are expected to be installed in global npm context.
Either install them via `npm install -g` or adjust `.ci/lint` accordingly.

```
> cat odg-ui/.git/hooks/pre-push

#!/usr/bin/env sh
set -e
repo_dir=$(readlink -f $(dirname $0)/../..)
${repo_dir}/.ci/lint
```

<p align="center"><img alt="Bundesministerium für Wirtschaft und Energie (BMWE)-EU funding logo" src="https://apeirora.eu/assets/img/BMWK-EU.png" width="400"/></p>
