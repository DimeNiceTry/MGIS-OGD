from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from app.api.endpoints import maps, nspd
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

app = FastAPI(
    title="MGIS OGD API",
    description="API для работы с НСПД и статичными слоями",
    version="1.0.0"
)

# Монтируем статические файлы из разных возможных директорий
static_dirs = [
    Path("static"),
    Path("fastapi_backend/static"),
    Path("/app/static"),
    Path("/app/fastapi_backend/static")
]

static_dir = None
for path in static_dirs:
    if path.exists():
        static_dir = path
        logger.info(f"Найдена статическая директория: {static_dir}")
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
        break
else:
    logger.warning("Статическая директория не найдена!")
    # Создаем пустую директорию для статических файлов
    os.makedirs("static", exist_ok=True)
    app.mount("/static", StaticFiles(directory="static"), name="static")

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Можно указать конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Обработчик ошибок валидации
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    logger.error(f"Ошибка валидации запроса: {str(exc)}")
    return JSONResponse(
        status_code=400,
        content={
            "type": "FeatureCollection",
            "features": [],
            "message": f"Некорректные параметры запроса: {str(exc)}"
        }
    )

# Обработчик HTTP ошибок
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    logger.error(f"HTTP ошибка: {exc.status_code}, {str(exc.detail)}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "type": "FeatureCollection",
            "features": [],
            "message": str(exc.detail)
        }
    )

# Обработчик всех остальных исключений
@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.exception(f"Необработанное исключение: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "type": "FeatureCollection",
            "features": [],
            "message": "Внутренняя ошибка сервера. Пожалуйста, попробуйте позже."
        }
    )

# Подключаем роуты
app.include_router(maps.router, prefix="/api")
app.include_router(nspd.router, prefix="/api")

@app.get("/health")
async def health_check():
    """
    Простой эндпоинт для проверки работоспособности API
    """
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True) 