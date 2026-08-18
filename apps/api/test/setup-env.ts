// config.ts waliduje env przy imporcie i wymaga DATABASE_URL. Testy jednostkowe
// and those going through app.inject() never touch the database, so any valid
// connection string will do — integration tests override it with the
// Testcontainers address.
process.env.DATABASE_URL ??= "postgres://sfera:sfera@127.0.0.1:5433/sfera_test";
// Tests substitute fakes for the queue and the progress bus, so nothing ever
// connects to this address — but the config insists it is set.
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
process.env.JWT_SECRET ??= "test-secret-o-dlugosci-co-najmniej-32-znakow";
// Tests run over HTTP through inject, so a secure cookie would not survive.
process.env.COOKIE_SECURE ??= "false";
