COMPOSE_FILE := docker/docker-compose.yaml

.PHONY: up down build logs ps test coverage

build:
	docker compose -f $(COMPOSE_FILE) build

up:
	docker compose -f $(COMPOSE_FILE) up -d

down:
	docker compose -f $(COMPOSE_FILE) down

logs:
	docker compose -f $(COMPOSE_FILE) logs -f

ps:
	docker compose -f $(COMPOSE_FILE) ps

test:
	python -m pytest -q

coverage:
	python -m pytest --cov=app --cov-report=term-missing
