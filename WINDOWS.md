# Инструкция по запуску MGIS OGD PWA в Windows

Данная инструкция поможет запустить проект MGIS OGD PWA на компьютере с Windows.

## Предварительные требования

В Windows вам потребуется установить:

1. [Docker Desktop для Windows](https://www.docker.com/products/docker-desktop/)
2. [WSL 2 (Windows Subsystem for Linux)](https://docs.microsoft.com/ru-ru/windows/wsl/install)

## Шаги по установке

### 1. Установка Docker Desktop

1. Скачайте Docker Desktop с официального сайта: https://www.docker.com/products/docker-desktop/
2. Установите Docker Desktop, следуя инструкциям установщика.
3. Запустите Docker Desktop и дождитесь, пока он полностью загрузится.
4. Убедитесь, что Docker использует WSL 2. Это можно проверить в Settings > General > Use WSL 2 based engine.

### 2. Клонирование и подготовка проекта

1. Скачайте проект как ZIP-архив или клонируйте через Git:
```powershell
git clone <URL-РЕПОЗИТОРИЯ> C:\path\to\mgis-ogd
cd C:\path\to\mgis-ogd
```

2. Откройте PowerShell в папке проекта (можно нажать правой кнопкой мыши на папке, удерживая Shift, и выбрать "Открыть окно PowerShell здесь").

### 3. Запуск проекта

В PowerShell выполните следующие команды:

```powershell
# Проверьте, что Docker запущен и работает
docker --version

# Запустите контейнеры
docker-compose up -d --build
```

Если все прошло успешно, вы увидите, что контейнеры создаются и запускаются.

### 4. Доступ к приложению

После успешного запуска проект будет доступен по адресу:
- http://localhost

### 5. Запуск скрипта развертывания (альтернативный способ)

Если у вас установлен Git Bash или WSL, вы можете использовать скрипт `deploy.sh`:

#### С использованием Git Bash:
```bash
bash deploy.sh
```

#### С использованием WSL:
```powershell
wsl bash deploy.sh
```

### 6. Управление контейнерами

- **Остановка контейнеров**:
```powershell
docker-compose down
```

- **Просмотр логов**:
```powershell
docker-compose logs -f
```

- **Перезапуск контейнеров**:
```powershell
docker-compose restart
```

## Устранение неполадок

### Проблема: Docker не запускается
**Решение**: Убедитесь, что WSL 2 правильно установлен и настроен. Может потребоваться перезагрузка компьютера после установки.

### Проблема: Порт 80 уже занят
**Решение**: Остановите службы, использующие порт 80 (например, IIS), или измените порт в файле `docker-compose.yml`:
```yaml
services:
  nginx:
    ports:
      - "8080:80"  # Изменение с "80:80" на "8080:80"
```

После этого доступ будет по адресу http://localhost:8080

### Проблема: Недостаточно памяти/CPU
**Решение**: Увеличьте ресурсы, выделенные для Docker в Docker Desktop Settings > Resources. 