FROM python:3.10-slim

WORKDIR /app

# Установка зависимостей
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копирование проекта Django
COPY . /app/

# Создаем директории для статических и медиа файлов
RUN mkdir -p /app/staticfiles /app/media

# Выводим содержимое директории для отладки
RUN ls -la /app/

# Экспозиция порта
EXPOSE 8000

# Запуск сервера gunicorn с указанием полного пути к wsgi модулю
CMD ["gunicorn", "backend.wsgi:application", "--bind", "0.0.0.0:8000"] 