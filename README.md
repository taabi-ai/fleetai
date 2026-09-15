# FleetAI Platform

FleetAI Platform is the microservices successor of the FleetAI Dash modular monolith. It's built as a pnpm + Turborepo monorepo with:

- 9 independently deployable NestJS microservices
- Next.js 16 frontend (App Router)
- Fastify API gateway and ingress controller
- PostgreSQL per service with Prisma ORM
- Redpanda (Kafka API) for cross-service events
- pgmq for in-service job queues
- Redis for cache/rate limiting
- MinIO for object storage
- OpenTelemetry for observability

## Getting Started

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Start infrastructure:
   ```bash
   pnpm infra:up
   ```

3. Run development servers:
   ```bash
   pnpm dev
   ```

## Documentation

See [docs/migration/README.md](docs/migration/README.md) for the full migration guide and agent prompts.

## Agent Development

This repository is designed for AI coding agents. See `AGENTS.md` for the contract between humans and agents, and run the prompts in `docs/migration/04-AGENT-PROMPTS/` in order to migrate from the monolith to the microservices architecture.

## License

Proprietary - FleetAI Platform