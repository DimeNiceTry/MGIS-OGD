#!/bin/bash
set -e

# Установка зависимостей
pip install --upgrade pip
pip install -r requirements.txt

# Создание необходимых директорий
mkdir -p backend/staticfiles

# Копирование файлов в правильную структуру
cp -r backend/* .
rm -rf backend

# Сборка статических файлов
python manage.py collectstatic --noinput

# Запуск приложения
gunicorn wsgi:application 