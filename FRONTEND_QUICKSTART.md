# Быстрый старт фронтенда

## Шаг 1: Установка зависимостей

```bash
cd frontend
npm install
```

Ожидаемое время: 2-3 минуты в зависимости от интернета

## Шаг 2: Запуск dev сервера

```bash
npm run dev
```

Вы увидите:
```
  VITE v5.0.8  ready in 234 ms

  ➜  Local:   http://localhost:3000/
  ➜  press h to show help
```

## Шаг 3: Откройте браузер

Перейдите на http://localhost:3000 и войдите с демо учетными данными:
- Username: `admin`
- Password: `admin`

## Требования к бэкенду

Убедитесь что бэкенд API запущен:

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Фронтенд автоматически проксирует запросы на `http://localhost:8000/api/v1`

## Полезные команды

| Команда | Описание |
|---------|---------|
| `npm run dev` | Запуск dev сервера с hot reload |
| `npm run build` | Production сборка |
| `npm run preview` | Preview production сборки |
| `npm run type-check` | Проверить TypeScript типы |
| `npm run lint` | Lint код |

## Структура файлов

```
src/
  components/        - React компоненты
  pages/            - Страницы приложения (маршруты)
  services/         - API услуги и проекты
  types/            - TypeScript интерфейсы
  hooks/            - Custom React hooks
  utils/            - Утилиты
  App.tsx           - Главный компонент (routing)
  main.tsx          - Точка входа
  index.css         - Глобальные стили
```

## Развертывание

### Docker

```bash
# Сборка
docker build -t project-manager-frontend .

# Запуск
docker run -p 3000:3000 project-manager-frontend
```

### Netlify / Vercel

```bash
npm run build
# Загрузите папку dist
```

## Troubleshooting

**Ошибка: Cannot find module '@services/auth'**
- Проверьте что файлы находятся в правильных папках
- Перезагрузите dev сервер

**Ошибка CORS от API**
- Убедитесь что бэкенд запущен
- Проверьте VITE_API_BASE_URL в .env

**Белый экран на localhost:3000**
- Откройте консоль браузера (F12) для ошибок
- Проверьте что node_modules установлены
- Перезагрузите страницу

## Контакты

Вопросы по фронтенду? Проверьте:
- [React документация](https://react.dev)
- [TypeScript handbook](https://www.typescriptlang.org/docs/)
- [Vite guide](https://vitejs.dev/guide/)
