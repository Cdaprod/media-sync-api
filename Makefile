# Helper targets for media-sync-api

.PHONY: test coverage

test:
	python -m pytest -q

coverage:
	python -m pytest --cov=app --cov-report=term-missing
