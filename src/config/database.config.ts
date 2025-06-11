const config = {
  production: {
    name: 'default',
    type: 'postgres',
    host: process.env.DB_HOST ? process.env.DB_HOST : 'localhost',
    port: process.env.DB_POST ? process.env.DB_POST : 5432,
    username: process.env.DB_USER ? process.env.DB_USER : 'postgres',
    password: process.env.DB_PASSWORD ? process.env.DB_PASSWORD : '123456',
    database: process.env.DB_DATABASE ? process.env.DB_DATABASE : 'postgres',
    encoding: 'utf8',
    charset: 'utf8mb4',
    entities: ['dist/**/*.entity{.ts,.js}'],
    synchronize: false,
    migrationsRun: true,
    migrationsTableName: 'migrations',
    migrations: ['dist/migrations/**/*{.ts,.js}'],
    subscribers: [`dist/subscribers/**/*.subscriber{.ts,.js}`],
    cli: {
      migrationsDir: 'src/migrations',
      entitiesDir: 'src/models',
    },
    logging: true,
  },
  development: {
    name: 'default',
    type: 'postgres',
    host: process.env.DB_HOST ? process.env.DB_HOST : 'localhost',
    port: process.env.DB_POST ? process.env.DB_POST : 5432,
    username: process.env.DB_USER ? process.env.DB_USER : 'postgres',
    password: process.env.DB_PASSWORD ? process.env.DB_PASSWORD : '123456',
    database: process.env.DB_DATABASE ? process.env.DB_DATABASE : 'postgres',
    encoding: 'utf8',
    charset: 'utf8mb4',
    entities: ['dist/**/*.entity{.ts,.js}'],
    synchronize: false,
    migrationsRun: true,
    migrationsTableName: 'migrations',
    migrations: ['dist/migrations/**/*{.ts,.js}'],
    subscribers: [`dist/subscribers/**/*.subscriber{.ts,.js}`],
    cli: {
      migrationsDir: 'src/migrations',
    },
    logging: true,
  },
}

const env = process.env.NODE_ENV || 'development'
console.log('config[env]', config[env])
export = config[env]
