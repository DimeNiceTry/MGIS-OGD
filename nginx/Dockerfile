FROM nginx:stable-alpine

# Удаляем стандартную конфигурацию
RUN rm /etc/nginx/conf.d/default.conf

# Копируем нашу упрощенную конфигурацию
COPY simple_nginx.conf /etc/nginx/nginx.conf

# Создаем директории для статических файлов и медиа
RUN mkdir -p /app/staticfiles /app/media

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"] 