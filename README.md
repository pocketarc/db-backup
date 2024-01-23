# Docker-based cron job for backing up databases to S3

This Docker image provides an automated solution to back up MySQL and/or PostgreSQL databases to an S3 bucket. It runs on a scheduled basis defined by user-provided environmental variables.

I built this because I needed a simple way to back up all the databases on a server to an S3 bucket. Making it a Docker image allows for easy deployment. No fiddling with dependencies or configuration files, just run the image and you're good to go.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Docker Standalone Usage](#docker-standalone-usage)
- [Docker Compose Usage](#docker-compose-usage)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Prerequisites

Before using this Docker image, you need to have the following:

- Docker (obviously)
- An AWS S3 bucket with appropriate permissions for storage
- AWS S3 Access and Secret keys with appropriate permissions

## Configuration

Prior to running the Docker image, you will need to define environment variables necessary for both database and S3 integration. A `.env` file is recommended for managing these variables.

Here are the variables you can set:

- `BACKUP_SCHEDULE`: Cron schedule string for backup frequency (Default is `"0 0 0 * * *"` which means daily at midnight).
- `TIMEZONE`: Timezone for the server (Default is `"UTC"`).
- `S3_BUCKET`: Name of the S3 bucket where backups should be stored.
- `S3_ACCESS_KEY`: AWS access key ID.
- `S3_SECRET_KEY`: AWS secret access key.
- `PG_HOST`: PostgreSQL server hostname (if not set, PostgreSQL backup is skipped).
- `PG_PORT`: PostgreSQL server port (Default is `"5432"`).
- `PG_USER`: PostgreSQL database user (Default is `"postgres"`).
- `PG_PASSWORD`: Password for the PostgreSQL user.
- `MYSQL_HOST`: MySQL server hostname (if not set, MySQL backup is skipped).
- `MYSQL_PORT`: MySQL server port (Default is `"3306"`).
- `MYSQL_USER`: MySQL database user (Default is `"root"`).
- `MYSQL_PASSWORD`: Password for the MySQL user.

## Docker Standalone Usage

1. Create a `.env` file with the variables specified in the Configuration section.
2. Assuming you have the `.env` file in your current directory, run the following command:

```bash
docker run -d --env-file .env --name db_backup pocketarc/db-backup
```

## Docker Compose Usage

Create a `docker-compose.yml` file with the following content (or add it to your existing `docker-compose.yml`):

```yaml
version: '3.8'
services:
  db_backup:
    image: pocketarc/db-backup:latest
    container_name: db_backup
    restart: unless-stopped
    env_file:
        - .env
```

Replace `.env` with the correct path to your `.env` file.

To run the service, enter:

```bash
docker-compose up -d
```

## Verification

After starting your backup service, you can verify if the backups are running properly by checking the logs:

```bash
docker logs --follow db_backup
```

## Troubleshooting

Common issues and solutions:

- Environment variables not set correctly: Ensure that the `.env` file is properly formatted and that all required variables are set.
- Network problems: Check if Docker can connect to your database servers and the S3 bucket.
- Permission issues: Ensure that the AWS credentials supplied have the correct permissions to access the S3 bucket.

If you are still having issues, please open an issue on GitHub.

## Contributing

I welcome contributions from the community! Whether you're fixing bugs, improving the documentation, or adding new features, your help is appreciated.

This is a Deno project, so you will need to have Deno installed to run the code.

**Note:** This project is quite barebones right now; there are many improvements that can be made (not the least of which is log rotation). I will be adding more features and improvements over time, but feel free to contribute if you have any ideas.
