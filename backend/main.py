from fastapi import FastAPI, WebSocket, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import engine, Base, get_db
from api.configurations import router as config_router
from api.simulations import router as sim_router, handle_websocket
import models  # ensure ORM models are registered before create_all

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Pendulum Simulator API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:8000",
        "null",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config_router, prefix="/api/pendulum")
app.include_router(sim_router, prefix="/api/pendulum")


@app.websocket("/ws/{simulation_id}")
async def websocket_endpoint(websocket: WebSocket, simulation_id: str, db: Session = Depends(get_db)):
    await handle_websocket(websocket, simulation_id, db)


@app.get("/api/info")
def server_info():
    return {
        "name": "Pendulum Simulator API",
        "version": "1.0.0",
        "methods": ["euler", "runge_kutta_2", "runge_kutta_4", "analytical"],
        "websocket_endpoint": "ws://localhost:8000/ws/{simulation_id}",
    }
