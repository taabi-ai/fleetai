# Local Kubernetes with kind

This runbook targets Docker Desktop with WSL2 integration. `kind` is the
supported local-cluster option because it runs Kubernetes nodes as Docker
containers and works the same from Windows PowerShell and a WSL2 shell.

## Prerequisites

- Docker Desktop running with the WSL2 backend.
- `kubectl`, `kind`, and Helm 3 available on `PATH`.
- Node.js 24 LTS and pnpm 12 for local development.

## Create the cluster

From the repository root:

```powershell
kind create cluster --config deploy/kind/cluster.yaml
kubectl cluster-info --context kind-fleetai
```

The configuration maps the cluster's HTTP/HTTPS test ports to
`http://localhost:8080` and `https://localhost:8443`.

## Build and load application images

The repository's release Dockerfiles expect CI build output. For now, build
the web and gateway images using the same CI process (or your image builder),
tag them exactly as below, and load them into kind:

```powershell
docker build -f apps/web/Dockerfile -t fleetai/web:dev .
docker build -f apps/gateway/Dockerfile -t fleetai/gateway:dev .
kind load docker-image fleetai/web:dev fleetai/gateway:dev --name fleetai
```

## Install the local chart

```powershell
helm dependency build deploy/helm/fleetai
helm upgrade --install fleetai deploy/helm/fleetai `
  --namespace fleetai --create-namespace `
  --values deploy/helm/fleetai/values-dev.yaml `
  --values deploy/helm/fleetai/values-kind.yaml
kubectl get pods,svc -n fleetai
```

The `values-kind.yaml` overlay runs only web and gateway. The remaining
microservice images and their database/message dependencies are not present
in this repository yet, so the overlay deliberately leaves them disabled.

## Remove the cluster

```powershell
kind delete cluster --name fleetai
```

Do not use production secrets in the local cluster. Create local-only
Kubernetes secrets if you enable services that require them.
