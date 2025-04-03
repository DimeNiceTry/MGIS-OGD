FROM node:18-alpine

WORKDIR /app

# Копирование файлов зависимостей
COPY package.json package-lock.json ./

# Установка зависимостей
RUN npm ci

# Копирование исходников
COPY . .

# Очистка кэша и временных файлов
RUN npm cache clean --force
RUN rm -rf build

# Добавляем явный вывод для отладки
RUN echo "Building frontend application..."

# Установка переменных окружения для сборки
ENV PUBLIC_URL=""
ENV GENERATE_SOURCEMAP=false

# Сборка приложения
RUN npm run build

# Проверяем, что файлы сборки созданы
RUN ls -la /app/build
RUN ls -la /app/build/static 2>/dev/null || echo "Static folder not found!"

# Команда по умолчанию - просто держать контейнер запущенным
CMD ["sh", "-c", "echo 'Frontend build completed!' && tail -f /dev/null"] 