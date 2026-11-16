# Download Benchmark (TypeScript)

Последовательный бенчмарк загрузки по HTTPS для высоконагруженных Node.js-сервисов.

Скрипт делает **N последовательных** полных загрузок указанного ресурса, дожидается полного тела ответа, считает среднее время, суммарный объём и скорость скачивания.

Написан на **TypeScript** со строгой типизацией (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).

## Единицы измерения

| Метрика | Единица | Пояснение |
|---------|---------|-----------|
| Время запроса | **ms** | `performance.now()` |
| Объём данных | **B / KiB / MiB** | 1 KiB = 1024 B, 1 MiB = 1024 KiB |
| Скорость | **MiB/s**, **Mbps** | мебибайты/с (двоичные) и мегабиты/с (десятичные) |

Скорость считается двумя способами:

1. **По сумме времён запросов** — чистая скорость передачи.
2. **Wall-clock** — с учётом пауз и ретраев.

## Требования

- Node.js ≥ 18
- [pnpm](https://pnpm.io/) ≥ 9

## Установка зависимостей

```bash
cd download-benchmark
pnpm install
```

### Предупреждение `ERR_PNPM_IGNORED_BUILDS` (esbuild)

pnpm по умолчанию **не выполняет** postinstall-скрипты зависимостей (supply-chain защита).  
`esbuild` (нужен vitest/tsx) требует native binary — его нужно явно разрешить:

```bash
pnpm approve-builds
```

В интерактивном меню отметьте `esbuild` (Space) и подтвердите (Enter).

После этого postinstall отработает один раз. В `package.json` уже указано:

```json
"pnpm": {
  "onlyBuiltDependencies": ["esbuild"]
}
```

На следующих `pnpm install` повторный approve обычно не нужен.

## Сборка

```bash
pnpm run build
```

Результат в `dist/`:

- `dist/cli.js` — точка входа
- `dist/*.d.ts` — декларации типов
- source maps

Только проверка типов (без эмита):

```bash
pnpm run typecheck
```

## Режим разработки (dev)

Запуск **напрямую из TypeScript** через `tsx` — без предварительной сборки:

```bash
# базовый запуск (10 запросов по умолчанию)
pnpm dev https://images.wallpaperscraft.ru/image/single/gory_ozero_les_1766363_3840x2160.jpg

# с опциями
pnpm dev https://images.wallpaperscraft.ru/image/single/gory_ozero_les_1766363_3840x2160.jpg --requests=20 --timeout-ms=60000 --retries=3
```

Эквивалент без script:

```bash
pnpm exec tsx src/cli.ts https://images.wallpaperscraft.ru/image/single/gory_ozero_les_1766363_3840x2160.jpg --requests=5
```

### Скрипты

| Скрипт | Что делает |
|--------|------------|
| `pnpm dev <url> [opts]` | Dev-запуск через tsx (без `tsc`) |
| `pnpm run build` | Компиляция TypeScript → `dist/` |
| `pnpm start <url> [opts]` | Production-запуск из `dist/cli.js` |
| `pnpm test` | Один прогон тестов |
| `pnpm test:watch` | Тесты в watch-режиме |
| `pnpm run typecheck` | `tsc --noEmit` |
| `pnpm run clean` | Удалить `dist/` и `coverage/` |

## Production-запуск

```bash
pnpm run build
pnpm start https://images.wallpaperscraft.ru/image/single/gory_ozero_les_1766363_3840x2160.jpg --requests=10
# или
node dist/cli.js https://images.wallpaperscraft.ru/image/single/gory_ozero_les_1766363_3840x2160.jpg
```

### Опции CLI

| Опция | По умолчанию | Диапазон | Описание |
|-------|--------------|----------|----------|
| `--requests=N` | 10 | 1…1000 | Число последовательных запросов |
| `--timeout-ms=N` | 30000 | 1000…600000 | Дедлайн на одну попытку (ms) |
| `--retries=N` | 2 | 0…10 | Доп. попытки при transient-ошибках |

## Тесты

```bash
pnpm test
pnpm test:watch
```

| Модуль | Покрытие |
|--------|----------|
| `ip.ts` | IPv4/IPv6, CIDR, blocklist |
| `format.ts` | formatBytes, formatSpeed, round |
| `backoff.ts` | exponential full-jitter |
| `errors.ts` | BenchmarkError, type guard |
| `cli.ts` | parseArgs (валидация флагов) |
| `url-validation.ts` | HTTPS-only, SSRF, DNS, credentials |
| `download.ts` | drainBody, downloadOnce, retries |

DNS и `fetch` в тестах мокаются — сеть не нужна.

## Структура

```
src/
  types.ts           — доменные типы
  errors.ts          — BenchmarkError
  config.ts          — DEFAULTS, BLOCKED_CIDRS
  ip.ts              — IP/CIDR
  url-validation.ts  — HTTPS + SSRF
  backoff.ts         — full-jitter backoff
  download.ts        — drainBody, downloadOnce, downloadWithRetry
  format.ts          — единицы измерения
  cli.ts             — parseArgs + main
tests/
  *.test.ts
```

## Логирование (pino)

Логи идут в **stderr** через [pino](https://github.com/pinojs/pino) v10 + [pino-pretty](https://github.com/pinojs/pino-pretty).

| Режим | Когда | Формат |
|-------|--------|--------|
| Pretty (цвета) | интерактивный TTY и не `NODE_ENV=production` | цветные строки |
| JSON | pipe/CI/`NODE_ENV=production` | одна JSON-строка на событие |

```bash
# цветные логи в терминале (по умолчанию при TTY)
pnpm dev https://example.com/file.bin

# уровень
LOG_LEVEL=debug pnpm dev https://example.com/file.bin

# принудительно
LOG_PRETTY=1 pnpm dev https://example.com/file.bin   # всегда pretty
LOG_PRETTY=0 pnpm dev https://example.com/file.bin   # всегда JSON
```

- **stderr** — логи pino
- **stdout** — человекочитаемый итоговый отчёт бенчмарка

## Особенности

- Только `https:`; блок credentials, localhost, private CIDR, cloud metadata
- `AbortController` + overall timeout
- Bounded retries + full jitter (только 408/429/5xx и сеть)
- Stream drain по чанкам, hard limit 512 MiB
- JSON-логи в stderr; exit codes `0` / `1` / `2` / `3`
- Нет утечек: `releaseLock` / `cancel` / `clearTimeout` в `finally`

## Рекомендации для продакшена

1. Redirects: при недоверенных URL — ручной follow с ре-валидацией каждого hop.
2. DNS rebinding: pin resolved IP через кастомный Agent / lookup hook.
3. Keep-alive: для high-load уберите `Connection: close`, настройте `undici.Agent`.
4. Метрики: отправляйте `speedMiBps`, `avgDurationMs`, `totalBytes` в мониторинг.

## Лицензия

MIT
