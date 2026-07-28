.PHONY: dev migrate test backfill deploy down logs

dev:
	docker compose up -d --build db
	@echo "waiting for db…"
	@until docker compose exec -T db pg_isready -U carryscan -d carryscan >/dev/null 2>&1; do sleep 1; done
	docker compose up -d --build ingest web
	@echo "CarryScan up · http://localhost:3000"

migrate:
	docker compose exec -T db psql -U carryscan -d carryscan -f /docker-entrypoint-initdb.d/000_init.sql || true

backfill:
	docker compose run --rm ingest npx tsx src/main.ts --backfill

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
