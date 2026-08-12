// config.ts waliduje env przy imporcie i wymaga DATABASE_URL. Testy jednostkowe
// i te przez app.inject() nie dotykają bazy, więc wystarczy im dowolny poprawny
// connection string — testy integracyjne nadpisują go adresem z Testcontainers.
process.env.DATABASE_URL ??= "postgres://sfera:sfera@127.0.0.1:5433/sfera_test";
// Testy podstawiają atrapy kolejki i szyny postępu, więc pod ten adres nic się
// nie łączy — config wymaga jednak, żeby był ustawiony.
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
process.env.JWT_SECRET ??= "test-secret-o-dlugosci-co-najmniej-32-znakow";
// Testy jadą po HTTP przez inject, więc secure cookie by nie przeszło.
process.env.COOKIE_SECURE ??= "false";
