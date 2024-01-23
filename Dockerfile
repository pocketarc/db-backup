FROM denoland/deno:ubuntu-1.39.4

# Set timezone:
RUN ln -snf /usr/share/zoneinfo/$CONTAINER_TIMEZONE /etc/localtime && echo $CONTAINER_TIMEZONE > /etc/timezone

# Install dependencies:
RUN apt-get update && \
    apt-get install -y \
        gzip \
        mysql-client \
        awscli \
        gnupg2 \
        curl \
        lsb-release

RUN sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg

RUN apt-get update && \
    apt-get install -y \
        postgresql-16

WORKDIR /app
COPY ./index.ts ./index.ts

CMD ["deno", "run", "--allow-env", "--allow-net", "--allow-run=mysql,mysqldump,gzip,aws,pg_dump,psql", "--allow-read=/tmp/db-backup.sql,/tmp/db-backup.sql.gz", "--allow-write=/tmp/db-backup.sql,/tmp/db-backup.sql.gz", "index.ts"]
