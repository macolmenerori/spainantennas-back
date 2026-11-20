# spainantennas-back

Backend API for the _spainantennas_ project. Stores and serves radio and TV antennas locations in Spain on a MongoDB database, along with the radio station or TV channel it serves. Built with Express 5, TypeScript, and Mongoose.

## Requirements

| Dependency | Version            |
| ---------- | ------------------ |
| Node.js    | >= 26.0.0          |
| pnpm       | 12                 |
| MongoDB    | any recent version |

[Opensesame](https://github.com/macolmenerori/opensesame-back) authentication service must be running and reachable at the URL configured in `AUTH_URL`. All API endpoints require a valid Bearer token issued by that service.

## Setup and running

### Demo (whole project)

A Docker Compose setup is included to run the **whole backend stack** (MongoDB + auth service + API) with a single command, pre-loaded with sample data. The images are built from the GitHub repositories of [opensesame-back](https://github.com/macolmenerori/opensesame-back) and this project, so no local configuration is needed. The frontend will be added to the stack once it exists.

1. Clone the repository:

   ```bash
   git clone https://github.com/macolmenerori/spainantennas-back.git
   cd spainantennas-back/docker
   ```

2. Build and start all services:

   ```bash
   docker compose up --build
   ```

3. The API is available at `http://localhost:8083/api/v1` (healthcheck at `http://localhost:8083/healthcheck`). Read endpoints are public. Write endpoints require a Bearer token from the auth service, which you get by logging in with:
   - **Email:** `admin@admin.com`
   - **Password:** `administrator`

The compose stack includes:

| Service              | Port  | Description                   |
| -------------------- | ----- | ----------------------------- |
| `spainantennas-db`   | 27017 | MongoDB with seeded demo data |
| `opensesame-back`    | 8080  | Authentication API            |
| `spainantennas-back` | 8083  | SpainAntennas API             |

> 16 sample placements (48 transmitters) are pre-loaded: AM-MW, FM, DAB+ and TV sites across Spain, including one TV site without coordinates. To reset the data, run `docker compose down` and start again.

### With Docker

The Dockerfile uses a multi-stage build: dependencies and source are compiled in an intermediate stage, and only the production `node_modules` and compiled `dist/` output are copied into the final image.

Before building, make sure a `config.env` file exists at the project root (see [Configuration](#configuration) below). The image copies it in at build time.

1. Set up and configure [opensesame-back](https://github.com/macolmenerori/opensesame-back) for authentication

```bash
docker build -t opensesame-back:latest .
docker network create opensesame-network
docker run --network opensesame-network -p 8080:8080 --name opensesame-back opensesame-back
```

1. Set up and configure this project

```bash
# Build the image
docker build -t spainantennas-back:latest .

# Run it (port 8083 is exposed by the container)
docker run --network opensesame-network -p 8083:8083 --name spainantennas-back spainantennas-back
```

The container includes a healthcheck that pings `/healthcheck` every 120 seconds. You can verify it manually while the container is running:

```bash
curl http://localhost:8083/healthcheck
```

### Locally

```bash
# 1. Install dependencies
pnpm install

# 2. Create and edit the env file (see Configuration below)
cp config.env.example config.env

# 3. Start the development server (uses nodemon for hot-reload)
pnpm dev
```

The server starts on the port defined in `config.env` (default `8083`). A healthcheck endpoint is available at `http://localhost:8083/healthcheck`.

## Configuration

## Available scripts

| Script                               | What it does                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `pnpm dev`                           | Starts the app with nodemon and tsx (hot-reload)                                                     |
| `pnpm build`                         | Compiles `src/` → `dist/` via `tsc`                                                                  |
| `pnpm start`                         | Runs the compiled app (`node dist/server.js`)                                                        |
| `pnpm lint`                          | Runs ESLint with auto-fix (includes Prettier formatting)                                             |
| `pnpm prettify`                      | Formats the whole repo with Prettier                                                                 |
| `pnpm types`                         | Type-checks without emitting (`tsc --noEmit`)                                                        |
| `pnpm test`                          | Runs the Vitest suite once                                                                           |
| `pnpm verify`                        | Runs audit, lint, prettify, types, test and build in sequence                                        |
| `pnpm generate:openapi`              | Generates `openapi.yaml` from the `@openapi` JSDoc in `src/routes/`                                  |
| `pnpm generate:openapi:json`         | Same, but writes `openapi.json`                                                                      |
| `pnpm release <patch\|minor\|major>` | Runs `verify`, bumps the version in `package.json` (no commit or tag) and regenerates `openapi.yaml` |

## API Overview

Check out the full specification on [`openapi.yaml`](openapi.yaml) file.

## CI

A GitHub Actions workflow (`.github/workflows/CI.yml`) runs on every push and pull request targeting `master`. It installs dependencies, builds the project, starts the server, and verifies the healthcheck endpoint responds correctly.

## License

This project is licensed under the [MIT](https://opensource.org/licenses/MIT) license.
