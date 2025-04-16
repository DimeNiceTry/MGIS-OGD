# FastAPI Бэкенд для МГИС ОГД

Этот бэкенд предоставляет API для работы со слоями карты и НСПД.

## Возможности

- Управление статичными слоями карты
- Управление представлениями карты
- Проксирование запросов к НСПД с кэшированием

## Установка и запуск

### Локально

1. Клонируйте репозиторий
2. Создайте и активируйте виртуальное окружение:
   ```
   python -m venv venv
   source venv/bin/activate  # Для Linux/MacOS
   venv\Scripts\activate     # Для Windows
   ```
3. Установите зависимости:
   ```
   pip install -r requirements.txt
   ```
4. Создайте файл .env с настройками:
   ```
   DATABASE_URL=sqlite:///./app.db
   ```
5. Запустите приложение:
   ```
   uvicorn main:app --reload
   ```

### Docker

1. Соберите контейнер:
   ```
   docker build -t mgis-backend .
   ```
2. Запустите контейнер:
   ```
   docker run -p 8000:8000 mgis-backend
   ```

## Документация API

После запуска API доступна документация Swagger по адресу:
- http://localhost:8000/docs

## Примеры использования

### Получение списка слоев карты

```bash
curl -X GET "http://localhost:8000/api/maps/layers/"
```

### Поиск в НСПД

```bash
curl -X POST "http://localhost:8000/api/nspd/thematic-search/" \
  -H "Content-Type: application/json" \
  -d '{"query": "Москва", "thematic_search": "admin_del"}'
``` 