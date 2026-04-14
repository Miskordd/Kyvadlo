import uuid
import math
import asyncio
import json
from datetime import datetime, timezone
from typing import Optional, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
from models import (
    SimulationStart, SimulationResponse, SimulationDetail, SimulationListResponse,
    ConfigurationDB, SimulationDB,
)
from physics import (
    step_euler, step_rk2, step_rk4, step_analytical,
    compute_energy, compute_characteristics,
)

router = APIRouter()

# simulation_id -> asyncio.Task
_running_tasks: Dict[str, asyncio.Task] = {}
# simulation_id -> set of WebSocket connections
_ws_connections: Dict[str, set] = {}


def _make_sim_id() -> str:
    return "sim_" + uuid.uuid4().hex[:8]


async def _broadcast(sim_id: str, message: dict):
    conns = _ws_connections.get(sim_id, set())
    dead = set()
    for ws in conns:
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            dead.add(ws)
    for ws in dead:
        conns.discard(ws)


async def _run_simulation(sim_id: str, config: ConfigurationDB, duration: float):
    db = SessionLocal()
    try:
        theta = math.radians(config.initial_angle)
        omega = config.initial_angular_velocity
        dt = config.time_step
        L, m, c = config.length, config.mass, config.damping
        method = config.numerical_method

        chars = compute_characteristics(L, m, c, config.initial_angle, config.initial_angular_velocity)
        initial_energy = compute_energy(theta, omega, L, m)["total_energy"]

        setup_msg = {
            "type": "setup",
            "simulation_id": sim_id,
            "config_id": config.id,
            "parameters": {
                "length": L, "mass": m, "damping": c,
                "initial_angle": config.initial_angle,
                "initial_angular_velocity": omega,
                "time_step": dt,
                "method": method,
            },
            "characteristics": chars,
            "duration": duration,
        }
        await _broadcast(sim_id, setup_msg)

        t = 0.0
        total_steps = 0
        prev_omega = omega
        last_send = 0.0
        SEND_INTERVAL = 0.05

        # turning_point_times[i] je čas i-tého obratu
        # perióda = turning_point_times[i+2] - turning_point_times[i]
        turning_point_times: list[float] = []

        while t <= duration:
            # Check if simulation was stopped
            sim = db.query(SimulationDB).filter(SimulationDB.id == sim_id).first()
            if sim and sim.status == "stopped":
                break

            # Step
            if method == "euler":
                theta, omega = step_euler(theta, omega, dt, L, m, c)
            elif method == "runge_kutta_2":
                theta, omega = step_rk2(theta, omega, dt, L, m, c)
            elif method == "runge_kutta_4":
                theta, omega = step_rk4(theta, omega, dt, L, m, c)
            elif method == "analytical":
                theta, omega = step_analytical(t + dt, math.radians(config.initial_angle), config.initial_angular_velocity, L, m, c)

            t += dt
            total_steps += 1

            # Obrat: omega zmenilo znamienko (prev_omega * omega < 0 vylučuje nulu)
            if prev_omega * omega < 0:
                side = "right" if theta >= 0 else "left"
                await _broadcast(sim_id, {
                    "type": "turning_point",
                    "time": round(t, 4),
                    "max_angle": round(abs(math.degrees(theta)), 4),
                    "side": side,
                })
                turning_point_times.append(t)

            prev_omega = omega

            # Send data at ~50ms intervals
            if t - last_send >= SEND_INTERVAL:
                energy = compute_energy(theta, omega, L, m)
                x = L * math.sin(theta)
                y = -L * math.cos(theta)
                vx = L * omega * math.cos(theta)
                vy = L * omega * math.sin(theta)
                angular_acc = -(c / (m * L ** 2)) * omega - (9.81 / L) * math.sin(theta)

                data_msg = {
                    "type": "data",
                    "time": round(t, 4),
                    "angle": round(math.degrees(theta), 4),
                    "angular_velocity": round(omega, 6),
                    "angular_acceleration": round(angular_acc, 6),
                    "position": {"x": round(x, 6), "y": round(y, 6)},
                    "velocity": {"vx": round(vx, 6), "vy": round(vy, 6)},
                    "kinetic_energy": round(energy["kinetic_energy"], 6),
                    "potential_energy": round(energy["potential_energy"], 6),
                    "total_energy": round(energy["total_energy"], 6),
                    "damping_loss": round(max(0, initial_energy - energy["total_energy"]), 6),
                }
                await _broadcast(sim_id, data_msg)
                last_send = t
                await asyncio.sleep(0)  # yield to event loop

        final_energy = compute_energy(theta, omega, L, m)["total_energy"]
        energy_loss = round(max(0, initial_energy - final_energy), 6)

        # Každé 2 obraty = 1 plná oscilácia
        oscillations_count = len(turning_point_times) // 2
        # Perióda: čas medzi každým i-tým a (i+2)-tým obratom (rovnaká strana)
        periods = [
            turning_point_times[i + 2] - turning_point_times[i]
            for i in range(len(turning_point_times) - 2)
        ]
        avg_period = round(sum(periods) / len(periods), 4) if periods else None

        completed_msg = {
            "type": "completed",
            "total_time": round(t, 4),
            "total_steps": total_steps,
            "oscillations_count": oscillations_count,
            "final_angle": round(math.degrees(theta), 4),
            "final_angular_velocity": round(omega, 6),
            "energy_loss": energy_loss,
            "average_period": avg_period,
        }
        await _broadcast(sim_id, completed_msg)

        # Update DB
        sim = db.query(SimulationDB).filter(SimulationDB.id == sim_id).first()
        if sim and sim.status == "running":
            sim.status = "completed"
            sim.completed_at = datetime.now(timezone.utc)
            sim.total_steps = total_steps
            sim.oscillations_count = oscillations_count
            sim.final_angle = math.degrees(theta)
            sim.final_angular_velocity = omega
            sim.energy_loss = energy_loss
            sim.average_period = avg_period
            db.commit()

    except asyncio.CancelledError:
        sim = db.query(SimulationDB).filter(SimulationDB.id == sim_id).first()
        if sim:
            sim.status = "stopped"
            sim.completed_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()
        _running_tasks.pop(sim_id, None)


@router.post("/simulations/start", response_model=SimulationResponse, status_code=201)
async def start_simulation(data: SimulationStart, db: Session = Depends(get_db)):
    cfg = db.query(ConfigurationDB).filter(ConfigurationDB.id == data.config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="Konfigurácia nenájdená")

    sim_id = _make_sim_id()
    sim = SimulationDB(
        id=sim_id,
        config_id=cfg.id,
        status="running",
        duration=data.duration,
        started_at=datetime.now(timezone.utc),
    )
    db.add(sim)
    db.commit()
    db.refresh(sim)

    _ws_connections[sim_id] = set()
    task = asyncio.create_task(_run_simulation(sim_id, cfg, data.duration))
    _running_tasks[sim_id] = task

    return SimulationResponse(
        simulation_id=sim_id,
        config_id=cfg.id,
        config_name=cfg.name,
        websocket_url=f"ws://localhost:8000/ws/{sim_id}",
        status="running",
        duration=data.duration,
        oscillation_type=cfg.oscillation_type,
        method=cfg.numerical_method,
        started_at=sim.started_at,
    )


@router.get("/simulations", response_model=SimulationListResponse)
def list_simulations(
    status: Optional[str] = Query(None),
    config_id: Optional[str] = Query(None),
    oscillation_type: Optional[str] = Query(None),
    limit: Optional[int] = Query(None, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(SimulationDB)
    if status:
        q = q.filter(SimulationDB.status == status)
    if config_id:
        q = q.filter(SimulationDB.config_id == config_id)
    if oscillation_type:
        q = q.join(ConfigurationDB, SimulationDB.config_id == ConfigurationDB.id)\
             .filter(ConfigurationDB.oscillation_type == oscillation_type)
    q = q.order_by(SimulationDB.started_at.desc())
    if limit:
        q = q.limit(limit)
    sims = q.all()
    return SimulationListResponse(simulations=[
        SimulationDetail(
            simulation_id=s.id, config_id=s.config_id, status=s.status, duration=s.duration,
            started_at=s.started_at, completed_at=s.completed_at, total_steps=s.total_steps,
            oscillations_count=s.oscillations_count, final_angle=s.final_angle,
            final_angular_velocity=s.final_angular_velocity, energy_loss=s.energy_loss,
            average_period=s.average_period,
        ) for s in sims
    ])


@router.get("/simulations/{simulation_id}", response_model=SimulationDetail)
def get_simulation(simulation_id: str, db: Session = Depends(get_db)):
    sim = db.query(SimulationDB).filter(SimulationDB.id == simulation_id).first()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulácia nenájdená")
    return SimulationDetail(
        simulation_id=sim.id, config_id=sim.config_id, status=sim.status, duration=sim.duration,
        started_at=sim.started_at, completed_at=sim.completed_at, total_steps=sim.total_steps,
        oscillations_count=sim.oscillations_count, final_angle=sim.final_angle,
        final_angular_velocity=sim.final_angular_velocity, energy_loss=sim.energy_loss,
        average_period=sim.average_period,
    )


@router.delete("/simulations/{simulation_id}", status_code=204)
async def stop_simulation(simulation_id: str, db: Session = Depends(get_db)):
    sim = db.query(SimulationDB).filter(SimulationDB.id == simulation_id).first()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulácia nenájdená")

    task = _running_tasks.get(simulation_id)
    if task:
        task.cancel()

    if sim.status == "running":
        sim.status = "stopped"
        sim.completed_at = datetime.now(timezone.utc)
        db.commit()


async def handle_websocket(websocket: WebSocket, simulation_id: str, db: Session):
    await websocket.accept()

    sim = db.query(SimulationDB).filter(SimulationDB.id == simulation_id).first()
    if not sim:
        await websocket.send_text(json.dumps({"type": "error", "message": "Simulácia nenájdená"}))
        await websocket.close()
        return

    if simulation_id not in _ws_connections:
        _ws_connections[simulation_id] = set()
    _ws_connections[simulation_id].add(websocket)

    try:
        # Keep connection open until client disconnects or sim ends
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
            except asyncio.TimeoutError:
                # Check if simulation finished
                db.expire(sim)
                sim = db.query(SimulationDB).filter(SimulationDB.id == simulation_id).first()
                if sim and sim.status in ("completed", "stopped"):
                    # Give a moment for final messages to flush, then close
                    await asyncio.sleep(0.2)
                    break
    except WebSocketDisconnect:
        pass
    finally:
        _ws_connections.get(simulation_id, set()).discard(websocket)
        await websocket.close(code=1000)
