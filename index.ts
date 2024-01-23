import { CronJob } from "npm:cron";
import bytes from "npm:bytes";
import { existsSync } from "https://deno.land/std@0.212.0/fs/mod.ts";

const BACKUP_SCHEDULE = Deno.env.get("BACKUP_SCHEDULE") ?? "0 0 0 * * *";
const TIMEZONE = Deno.env.get("TIMEZONE") ?? "UTC";
const S3_BUCKET = Deno.env.get("S3_BUCKET");
const S3_ACCESS_KEY = Deno.env.get("S3_ACCESS_KEY");
const S3_SECRET_KEY = Deno.env.get("S3_SECRET_KEY");
const PG_HOST = Deno.env.get("PG_HOST");
const PG_PORT = Deno.env.get("PG_PORT") ?? "5432";
const PG_USER = Deno.env.get("PG_USER") ?? "postgres";
const PG_PASSWORD = Deno.env.get("PG_PASSWORD");
const MYSQL_HOST = Deno.env.get("MYSQL_HOST");
const MYSQL_PORT = Deno.env.get("MYSQL_PORT") ?? "3306";
const MYSQL_USER = Deno.env.get("MYSQL_USER") ?? "root";
const MYSQL_PASSWORD = Deno.env.get("MYSQL_PASSWORD");

async function getPgDatabases(): Promise<string[]> {
  const cmd = await new Deno.Command("psql", {
    args: [
      `--host=${PG_HOST}`,
      `--port=${PG_PORT}`,
      `--username=${PG_USER}`,
      `--csv`,
      `--command=SELECT datname FROM pg_database;`,
    ],
    env: {
      PGPASSWORD: PG_PASSWORD,
    },
  }).output();

  if (cmd.code !== 0) {
    throw new Error(
      `Error getting Postgres databases (code: ${cmd.code}, stderr: ${
        new TextDecoder().decode(cmd.stderr)
      })`,
    );
  }

  let databases = new TextDecoder().decode(cmd.stdout).split("\n");

  // Remove header and footer.
  databases = databases.slice(1, databases.length - 1);

  // Remove system databases.
  databases = databases.filter((database) =>
    !["postgres", "template0", "template1"].includes(database)
  );

  return databases;
}

async function getMySqlDatabases(): Promise<string[]> {
  const cmd = await new Deno.Command("mysql", {
    args: [
      `--host=${MYSQL_HOST}`,
      `--port=${MYSQL_PORT}`,
      `--user=${MYSQL_USER}`,
      `--execute=SHOW DATABASES`,
    ],
    env: {
      MYSQL_PWD: MYSQL_PASSWORD,
    },
  }).output();

  if (cmd.code !== 0) {
    throw new Error(
      `Error getting MySQL databases (code: ${cmd.code}, stderr: ${
        new TextDecoder().decode(cmd.stderr)
      })`,
    );
  }

  let databases = new TextDecoder().decode(cmd.stdout).split("\n");
  databases = databases.slice(1, databases.length - 1);

  // Remove system databases.
  databases = databases.filter((database) =>
    !["information_schema", "performance_schema", "mysql", "sys"].includes(
      database,
    )
  );

  return databases;
}

async function backupPgDatabase(
  database: string,
  filename: string,
): Promise<void> {
  if (existsSync(filename)) {
    Deno.removeSync(filename);
  }

  const pgDump = await new Deno.Command("pg_dump", {
    args: [
      `--no-owner`,
      `--column-inserts`,
      `--host=${PG_HOST}`,
      `--port=${PG_PORT}`,
      `--file=${filename}`,
      `--username=${PG_USER}`,
      database,
    ],
    env: {
      PGPASSWORD: PG_PASSWORD,
    },
  }).output();

  if (pgDump.code !== 0) {
    throw new Error(
      `Error backing up Postgres database: ${database} (code: ${pgDump.code}, stderr: ${
        new TextDecoder().decode(pgDump.stderr)
      })`,
    );
  }
}

async function backupMysqlDatabase(
  database: string,
  filename: string,
): Promise<void> {
  if (existsSync(filename)) {
    Deno.removeSync(filename);
  }

  const mysqlDump = await new Deno.Command("mysqldump", {
    args: [
      `--host=${MYSQL_HOST}`,
      `--port=${MYSQL_PORT}`,
      `--user=${MYSQL_USER}`,
      `--result-file=${filename}`,
      database,
    ],
    env: {
      MYSQL_PWD: MYSQL_PASSWORD,
    },
  }).output();

  if (mysqlDump.code !== 0) {
    throw new Error(
      `Error backing up MySQL database: ${database} (code: ${mysqlDump.code}, stderr: ${
        new TextDecoder().decode(mysqlDump.stderr)
      })`,
    );
  }
}

async function compressFile(filename: string): Promise<void> {
  if (existsSync(`${filename}.gz`)) {
    Deno.removeSync(`${filename}.gz`);
  }

  const compress = await new Deno.Command("gzip", {
    args: [
      filename,
    ],
  }).output();

  if (compress.code !== 0) {
    throw new Error(
      `Error compressing file: ${filename} (code: ${compress.code}, stderr: ${
        new TextDecoder().decode(compress.stderr)
      })`,
    );
  }
}

async function uploadFile(filename: string, s3Key: string): Promise<void> {
  const s3 = await new Deno.Command("aws", {
    env: {
      AWS_ACCESS_KEY_ID: S3_ACCESS_KEY,
      AWS_SECRET_ACCESS_KEY: S3_SECRET_KEY,
    },
    args: [
      "s3",
      "cp",
      filename,
      `s3://${S3_BUCKET}/${s3Key}`,
    ],
  }).output();

  if (s3.code !== 0) {
    throw new Error(
      `Error uploading file to S3: ${filename} (code: ${s3.code}, stderr: ${
        new TextDecoder().decode(s3.stderr)
      })`,
    );
  }
}

async function backup() {
  if (MYSQL_HOST) {
    console.log("Backing up all MySQL databases...");

    const databases = await getMySqlDatabases();

    console.log(databases);

    for (const database of databases) {
      try {
        console.log("Backing up database:", database);

        const filename = `${database}/${
          new Date().toISOString().replace(/:/g, "-")
        }.mysql.sql.gz`;
        await backupMysqlDatabase(database, `/tmp/db-backup.sql`);
        await compressFile(`/tmp/db-backup.sql`);

        const size = bytes(Deno.statSync(`/tmp/db-backup.sql.gz`).size);
        console.log(`Uploading to S3: ${filename} (${size})`);
        await uploadFile(`/tmp/db-backup.sql.gz`, filename);

        Deno.removeSync(`/tmp/db-backup.sql.gz`);
      } catch (e) {
        console.error(e);
        console.log("Failed to backup database:", database);
      }
    }
  }

  if (PG_HOST) {
    console.log("Backing up all PostgreSQL databases...");

    const databases = await getPgDatabases();

    console.log(databases);

    for (const database of databases) {
      try {
        console.log("Backing up database:", database);

        const filename = `${database}/${
          new Date().toISOString().replace(/:/g, "-")
        }.pg.sql.gz`;
        await backupPgDatabase(database, `/tmp/db-backup.sql`);
        await compressFile(`/tmp/db-backup.sql`);

        const size = bytes(Deno.statSync(`/tmp/db-backup.sql.gz`).size);
        console.log(`Uploading to S3: ${filename} (${size})`);
        await uploadFile(`/tmp/db-backup.sql.gz`, filename);

        Deno.removeSync(`/tmp/db-backup.sql.gz`);
      } catch (e) {
        console.error(e);
        console.log("Failed to backup database:", database);
      }
    }
  }
}

await backup();

console.log(
  "Finished the initial backup, starting the cron job to backup: ",
  BACKUP_SCHEDULE,
);

new CronJob(
  BACKUP_SCHEDULE,
  backup,
  null,
  true,
  TIMEZONE,
);
