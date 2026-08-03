.PHONY: dev migrate migrate-remote test backfill weekly deploy down logs

dev:
	docker compose up -d --build db
	@echo "waiting for db…"
	@until docker compose exec -T db pg_isready -U carryscan -d carryscan >/dev/null 2>&1; do sleep 1; done
	docker compose up -d --build ingest web
	@echo "CarryScan up · http://localhost:3000"

migrate:
	docker compose exec -T db psql -U carryscan -d carryscan -f /docker-entrypoint-initdb.d/000_init.sql || true
	cd services/ingest && DATABASE_URL=$${DATABASE_URL:-postgresql://carryscan:carryscan@localhost:5432/carryscan} npm run migrate

migrate-remote:
	cd services/ingest && npm run migrate

backfill:
	docker compose run --rm ingest npx tsx src/main.ts --backfill

weekly:
	cd services/ingest && PUBLIC_BASE_URL=$${PUBLIC_BASE_URL:-https://carryscan.vercel.app} npm run weekly

test:
	cd services/ingest && npm test
	cd apps/web && npm run typecheck && npm run lint && npm run build

deploy:
	git pull
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=200
