# Фронтенд - Система управления проектами

Веб-интерфейс для системы управления строительными проектами. Со встроенной системой ролей, управлением задачами и отслеживанием прогресса.

## Стек технологий

- **React** 18.2.0 - UI библиотека
- **TypeScript** 5.3.3 - Language
- **Vite** 5.0.8 - Build tool и dev server
- **React Router** 6.20.0 - Routing
- **Axios** 1.6.2 - HTTP клиент

## Структура проекта

```
frontend/
├── src/
│   ├── components/        # Переиспользуемые компоненты
│   │   └── Layout.tsx    # Основной layout с навигацией
│   ├── pages/            # Страницы приложения
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   └── ProjectsPage.tsx
│   ├── services/         # API и сервисы
│   │   ├── auth.ts      # Сервис аутентификации
│   │   └── api.ts       # API клиенты для проектов и задач
│   ├── types/           # TypeScript типы
│   │   └── index.ts
│   ├── hooks/           # Custom React hooks
│   ├── utils/           # Утилиты
│   ├── App.tsx          # Главный компонент
│   ├── main.tsx         # Точка входа
│   └── index.css        # Глобальные стили
├── vite.config.ts       # Конфигурация Vite
├── tsconfig.json        # TypeScript конфиг
├── package.json         # Зависимости и скрипты
└── index.html           # HTML шаблон
```

## Установка

### 1. Установите зависимости

```bash
npm install
```

Или если используете yarn:

```bash
yarn install
```

### 2. Создайте .env файл

Скопируйте `.env.example` в `.env`:

```bash
cp .env.example .env
```

Убедитесь, что `VITE_API_BASE_URL` указывает на стартующий бэкенд.

## Запуск

### Development сервер

```bash
npm run dev
```

Приложение откроется на `http://localhost:3000`

### Сборка для production

```bash
npm run build
```

### Preview production сборки локально

```bash
npm run preview
```

### Проверка типов

```bash
npm run type-check
```

### Lint код

```bash
npm run lint
```

## Функциональность

### Аутентификация

- Вход через username/password
- JWT токены в localStorage
- Автоматический редирект на /login для неавторизованных пользователей

### Ролевая система

Три типа ролей:

- **Admin** - полный доступ к системе
- **Engineer** (Главный инженер) - управление проектами и назначение прорабов
- **Foreman** (Прораб) - просмотр назначенных проектов и управление задачами

### Основные страницы

1. **Login** - Страница входа с демо учетными данными
2. **Dashboard** - Статистика и последние проекты
3. **Projects** - Список типов проектов и их задач

## Тестовые учетные данные

```
Admin:
  Username: admin
  Password: admin

Инженер:
  Username: engineer
  Password: engineer

Прораб:
  Username: foreman
  Password: foreman
```

## API интеграция

Приложение взаимодействует с бэкенд API по следующим маршрутам:

```
POST   /login                      - Вход
GET    /projects                   - Список проектов
GET    /projects/{id}              - Детали проекта
POST   /projects                   - Создание проекта
PUT    /projects/{id}              - Обновление проекта
DELETE /projects/{id}              - Удаление проекта

GET    /projects/{id}/tasks        - Задачи проекта
POST   /projects/{id}/tasks        - Создание задачи
PUT    /projects/{id}/tasks/{id}   - Обновление задачи
DELETE /projects/{id}/tasks/{id}   - Удаление задачи
```

## Стили и компоненты

- CSS Modules для изоляции стилей
- Адаптивный дизайн (мобильные устройства поддерживаются)
- Темная тема по умолчанию

## Деплой

### Статический хостинг

```bash
npm run build
# Загрузите содержимое папки dist на ваш хостинг
```

### Docker

Можно добавить Dockerfile:

```dockerfile
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
```

## Разработка

### Добавление нового компонента

1. Создайте `.tsx` файл в `src/components/`
2. Добавьте соответствующий `.module.css` файл
3. Экспортируйте компонент

### Добавление новой страницы

1. Создайте `.tsx` файл в `src/pages/`
2. Добавьте маршрут в `App.tsx`
3. Добавьте навигационную ссылку в `Layout.tsx`

### Добавление нового API сервиса

1. Создайте функции в `src/services/api.ts`
2. Используйте их в компонентах через `useEffect`

## Решение проблем

### Ошибка CORS

Убедитесь, что бэкенд запущен и правильно настроены CORS headers.

### Токен истек

Приложение перенаправит на login если токен истек.

### API не отвечает

Проверьте:
- Бэкенд запущен на порту 8000
- `VITE_API_BASE_URL` правильно сконфигурирован
- Сетевое соединение

## Лицензия

MIT
