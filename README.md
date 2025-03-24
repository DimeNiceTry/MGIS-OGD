# MGIS OGD PWA

PWA приложение для работы с картами, использующее React, Django и MapLibre GL JS.

## Установка

### Бэкенд (Django)

1. Создайте виртуальное окружение:
```bash
python -m venv venv
source venv/bin/activate  # для Linux/Mac
venv\Scripts\activate     # для Windows
```

2. Установите зависимости:
```bash
pip install -r requirements.txt
```

3. Примените миграции:
```bash
python manage.py migrate
```

4. Запустите сервер разработки:
```bash
python manage.py runserver
```

### Фронтенд (React)

1. Перейдите в директорию frontend:
```bash
cd frontend
```

2. Установите зависимости:
```bash
npm install
```

3. Запустите сервер разработки:
```bash
npm start
```

## Технологии

- Backend: Django 5.0.2
- Frontend: React 18
- Карты: MapLibre GL JS
- PWA функциональность 