import os
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()

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

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
                json={
                    "chat_id": CHAT_ID,
                    "text": text,
                    "parse_mode": "HTML",
                },
            )
            if resp.status_code != 200:
                return JSONResponse(
                    status_code=500,
                    content={"error": "Ошибка отправки в Telegram"},
                )
    except Exception as e:
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
