# API сервера

Типы и zod-схемы — в `shared/src/api.ts` (REST) и `shared/src/protocol.ts` (WebSocket).
Все времена — миллисекунды Unix epoch. Тела запросов и ответов — JSON.

## Ошибки

Любая ошибка возвращает `ApiError`:

```json
{ "error": "validation", "message": "Проверьте поля", "issues": [{ "path": "name", "message": "..." }] }
```

| Статус | `error`        | Когда                                              |
|--------|----------------|----------------------------------------------------|
| 400    | `validation`   | тело не прошло схему (`issues` — список полей)     |
| 401    | `unauthorized` | нет/неверный токен, неверный пароль                |
| 404    | `not_found`    | ресурса нет или он принадлежит другому аккаунту    |
| 409    | `conflict`     | e-mail занят; сеть уже привязана к другому заведению |
| 429    | `rate_limited` | слишком много попыток входа                        |

## Авторизация владельца заведения

Токен передаётся заголовком `Authorization: Bearer <token>`. Срок жизни — 30 дней.

| Метод | Путь                  | Тело          | Ответ                         |
|-------|-----------------------|---------------|-------------------------------|
| POST  | `/api/auth/register`  | `Credentials` | `201 AuthResponse`            |
| POST  | `/api/auth/login`     | `Credentials` | `200 AuthResponse`            |
| POST  | `/api/auth/logout`    | —             | `204`                         |
| GET   | `/api/auth/me`        | —             | `200 { account: Account }`    |

## Кабинет (нужен токен)

| Метод  | Путь                                              | Тело           | Ответ                                |
|--------|---------------------------------------------------|----------------|--------------------------------------|
| GET    | `/api/cabinet/venues`                             | —              | `{ venues: Venue[] }`                |
| POST   | `/api/cabinet/venues`                             | `VenueInput`   | `201 Venue`                          |
| GET    | `/api/cabinet/venues/:id`                         | —              | `Venue`                              |
| PUT    | `/api/cabinet/venues/:id`                         | `VenueInput`   | `Venue`                              |
| DELETE | `/api/cabinet/venues/:id`                         | —              | `204`                                |
| GET    | `/api/cabinet/venues/:id/networks`                | —              | `{ networks: VenueNetwork[] }`       |
| POST   | `/api/cabinet/venues/:id/networks`                | `NetworkInput` | `201 VenueNetwork`                   |
| DELETE | `/api/cabinet/venues/:id/networks/:networkId`     | —              | `204`                                |
| GET    | `/api/cabinet/venues/:id/events`                  | —              | `{ events: VenueEvent[] }` (по `startsAt`) |
| POST   | `/api/cabinet/venues/:id/events`                  | `EventInput`   | `201 VenueEvent`                     |
| PUT    | `/api/cabinet/venues/:id/events/:eventId`         | `EventInput`   | `VenueEvent`                         |
| DELETE | `/api/cabinet/venues/:id/events/:eventId`         | —              | `204`                                |
| GET    | `/api/cabinet/venues/:id/stats`                   | —              | `VenueStats`                         |

`NetworkInput.address = null` — сервер возьмёт адрес, с которого пришёл запрос. Так владелец
привязывает Wi‑Fi, просто открыв кабинет, находясь в сети заведения.
`NetworkInput.ssid` — название Wi‑Fi сети. Если указано, гости с другим SSID за тем же адресом
не будут считаться гостями заведения (если приложение гостя смогло прочитать SSID).

`VenueStats.online` и `.interests` равны `null`, если в сети меньше `minGroup` (по умолчанию 3) человек.

## Публичные

| Метод | Путь                     | Ответ                                        |
|-------|--------------------------|----------------------------------------------|
| GET   | `/api/whoami`            | `WhoAmIResponse` — ключ сети запроса         |
| GET   | `/api/venues?bbox=a,b,c,d` | `PublicVenuesResponse` — опубликованные заведения с координатами в рамке `minLon,minLat,maxLon,maxLat` (не больше 2°×4°) |
| GET   | `/api/venues/:id`        | `PublicVenue`                                |
| GET   | `/api/health`            | `{ ok: true, online: number }`               |

## WebSocket `/ws`

Протокол описан в `shared/src/protocol.ts`:

1. сервер присылает `challenge`;
2. клиент отвечает `hello` (id устройства, ключ шифрования, подписи, хэш SSID, профиль, видимость,
   локальные списки блокировок и контактов); на `hello` отводится 10 секунд;
3. сервер отвечает `welcome` с описанием зоны (заведение, события) и списком людей в той же сети.

После этого клиент может слать `profile`, `visibility`, `location`, `map_query`, `get_profile`,
`dm`, `contact`, `block`, `report`, `ping`. Сервер шлёт `peer`, `peer_left`, `peers`, `zone`, `map`,
`profile`, `dm`, `dm_status`, `error`, `pong`.

Правила видимости:

* **в зоне** — одинаковый ключ сети (публичный IPv4, IPv6 /64 или частная /24) и совместимый SSID
  (совпадает или неизвестен хотя бы у одного), оба не в режиме «невидимка», никто никого не заблокировал;
* **на карте** — человек выбрал режим `map` и прислал огрублённые координаты не позже 30 минут назад;
  смотреть людей на карте может только тот, кто сам показывается на карте (взаимность);
* **личные сообщения** — можно писать тому, кого видишь в зоне или на карте, а также взаимным контактам
  (оба устройства прислали друг друга в `contacts`). Сервер не хранит сообщения: если адресат не в сети,
  отправитель получит `dm_status: offline`.
