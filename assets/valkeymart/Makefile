# Docker Image and tag
IMAGE_NAME=valkeymart
IMAGE_TAG=latest

# Uses local docker network address
HOST_IP := $(shell ip -4 addr show docker0 | grep -Po 'inet \K[\d.]+')
# Sets ssl to false for local connections
REDIS_PORT = '6379'
SSL=False
LOCAL=True

build:
	#docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .
	docker buildx build --platform linux/amd64 -t $(IMAGE_NAME):$(IMAGE_TAG) .

# Checks if a local instance of redis/valkey is running
check-local:
	@if ! nc -z localhost $(REDIS_PORT) > /dev/null 2>&1; then \
		echo "⚠️ WARNING: It seems your local Redis instance is not running."; \
		echo "⚠️ Please ensure that your have Redis running on localhost:6379 for local testing and development"; \
		exit 1; \
	fi

run: check-local
	docker run -it --rm \
		--network local-dev \
		-p 5000:5000 \
		-e REDIS_URL=$(HOST_IP) \
		-e SSL=$(SSL) \
		-e LOCAL=$(LOCAL) \
		$(IMAGE_NAME):$(IMAGE_TAG)

all: build run

clean:
	docker rmi $(IMAGE_NAME):$(IMAGE_TAG)

.PHONY: build check-local run all clean
