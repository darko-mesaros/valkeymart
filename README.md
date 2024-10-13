# ValkeyMart
An example of using Valkey on MemoryDB with a Flask Python application

![valkeymart screenshot](/img/valkeymart.png)

## Valkey client instance

This stack includes an EC2 instance that serves as a valkey client. It has `valkey-cli` installed locally and is created in the same VPC as the Valkey cluster.

To connect to this instance, please use *AWS SSM Session Manager*, either via the AWS Console, or using the CLI. You will need the [Session Manager Plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) for this to work using the AWS CLI.

## Application

ValkeyMart is just a *very* simple application that simulates a shopping cart for a random user. And it stores all of the items in the shopping cart to an in-memory database, using Valkey for AWS MemoryDB.

The application itself is run using a docker container, using the [AWS App Runner](https://aws.amazon.com/apprunner/) service.

To **deploy this stack** we are using [AWS CDK](https://aws.amazon.com/cdk/), so make sure to have that installed. Then simply run:
```
cdk deploy
```

Do note, for this to work you will need **Docker** available and running on your workstation.

### Local development

To do any proper local development, I have set up a `Makefile` that you can use to run the application locally using Docker. The only requrement is that you have a `valkey/valkey` docker container running locally. Here is how you set that up:

1. Make sure to have `docker compose` available on your system.
2. Create a docker network called `local-dev`
```bash
docker network create local-dev
```
3. Somewhere outside of this CDK stack, create the following folder structure:
```
├── conf
│   └── valkey.conf
├── data
└── docker-compose.yml
```
4. In your `conf/valkey.conf` file add the following:
```
bind 0.0.0.0 -::1
protected-mode no
```
5. Set up your `docker-compose.yml` file with the following contents:
```yaml
services:
  valkey:
    container_name: valkey
    hostname: valkey
    image: valkey/valkey:7.2.6
    volumes:
      - ./conf/valkey.conf:/etc/valkey/valkey.conf
      - ./data:/data
    command: valkey-server /etc/valkey/valkey.conf
    healthcheck:
      test: ["CMD-SHELL", "redis-cli ping | grep PONG"]
      interval: 1s
      timeout: 3s
      retries: 5
    ports:
      - "6379:6379"
    networks:
      - local-dev
networks:
  local-dev:
    name: local-dev
    external: true
```
6. Run `docker compose up -d` - and you are set!

For more information on these steps, you can check out this amazing [article](https://community.aws/content/2fdr6Vg8BiJS8jr8xsuQRRc0MD5/getting-started-with-valkey-using-docker-and-go?lang=en) by my friend Ricardo. 🥰

### Local deployment

To deploy and manage the application locally, make sure to have completed the steps above. We are using a `Makefile` for the automation, so to run your development enviroment, simply run:
```
make all
```

To remove any container images just run:
```
make clean
```

If any of these fail **make sure you have the following packages installed**:
- GNU Make
- GNU netcat (needed for one of the `Makefile` checks)
- docker compose
- docker buildx
