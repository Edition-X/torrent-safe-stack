SHELL := /bin/bash

# Load variables from .env for every recipe
include .env
export $(shell sed 's/=.*//' .env)

.PHONY: up down build logs ps scan clean

up:  ## Build (if needed) and start stack
	@docker compose up -d --build

down: ## Stop and remove containers
	@docker compose down

build: ## Rebuild images
	@docker compose build

logs: ## Tail logs from all services
	@docker compose logs -f

ps: ## Show running containers
	@docker compose ps

scan: ## Manually scan downloads folder (uses clamav container)
	@docker compose exec clamav clamdscan --multiscan /downloads
