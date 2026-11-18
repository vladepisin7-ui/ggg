import os
import httpx
import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Раздаём статические файлы (CSS, JS) из корня
@app.middleware("http")
async def serve_static(request, call_next):
    path = request.url.path.lstrip("/")
    if path in ["style.css", "script.js"]:
        filepath = os.path.join(os.path.dirname(__file__), path)
        if os.path.exists(filepath):
            with open(filepath, "rb") as f:
                content = f.read()
            mime = "text/css" if path.endswith(".css") else "application/javascript"
            return Response(content=content, media_type=mime)
    return await call_next(request)

# Разрешаем запросы с твоего сайта
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене замени на точный домен сайта
    allow_methods=["*"],
    allow_headers=["*"],
)

# Токен бота и ID чата, куда слать заказы
BOT_TOKEN = os.getenv("TG_BOT_TOKEN", "")
CHAT_ID = os.getenv("TG_CHAT_ID", "")


class OrderData(BaseModel):
    mode: str  # pickup, delivery, booking, contact
    time: str
    guests: int = 2
    address: str = ""
    items: list = []
    comment: str = ""
    total: int = 0
    name: str = ""
    phone: str = ""


@app.post("/order")
async def handle_order(data: OrderData):
    try:
        logger.info(f"Received order: mode={data.mode}, total={data.total}")
        logger.info(f"BOT_TOKEN set: {bool(BOT_TOKEN)}, CHAT_ID set: {bool(CHAT_ID)}")
        
        if not BOT_TOKEN or not CHAT_ID:
            return JSONResponse(
                status_code=500,
                content={"error": "Бот не настроен на сервере"},
            )

        if data.mode == "contact":
            text = (
                "📩 <b>Заявка с сайта</b>\n"
                f"👤 Имя: {data.name}\n"
                f"📱 Телефон: {data.phone}\n"
                f"💬 Комментарий: {data.comment}\n"
                f"🕐 Время: {data.time}"
            )
        else:
            mode_name = {"pickup": "Самовывоз", "delivery": "Доставка", "booking": "Бронь столика"}[data.mode]
            is_booking = data.mode == "booking"

            lines = [
                "🛒 <b>Новый заказ!</b>",
                f"📦 Режим: {mode_name}",
                f"📱 Телефон: {data.phone}",
                f"🕐 Время: {data.time}",
            ]
            if is_booking:
                lines.append(f"👥 Гостей: {data.guests}")
            if data.address:
                lines.append(f"🏠 Адрес: {data.address}")
            lines.append("")
            lines.append("<b>Состав заказа:</b>")
            for item in data.items:
                lines.append(f"• {item['name']} × {item['qty']} — {item['price'] * item['qty']} ₽")
            if data.comment:
                lines.append(f"\n💬 Комментарий: {data.comment}")
            if data.total > 0:
                lines.append(f"\n💰 <b>Итого: {data.total} ₽</b>")

            text = "\n".join(lines)

        async with httpx.AsyncClient(timeout=10) as client:
            tg_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
            logger.info(f"Sending to Telegram: {tg_url}")
            resp = await client.post(
                tg_url,
                json={
                    "chat_id": CHAT_ID,
                    "text": text,
                    "parse_mode": "HTML",
                },
            )
            logger.info(f"Telegram response: {resp.status_code} {resp.text}")
            if resp.status_code != 200:
                return JSONResponse(
                    status_code=500,
                    content={"error": "Ошибка отправки в Telegram", "details": resp.text},
                )
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": str(e)},
        )

    return JSONResponse(content={"ok": True})


@app.get("/")
async def serve_index():
    return FileResponse("ggg.html")


@app.get("/health")
async def health():
    return {"status": "ok"}
