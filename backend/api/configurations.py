import uuid
import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import (
    ConfigurationCreate,
    ConfigurationUpdate,
    ConfigurationValidate,
    ConfigurationDB,
    SimulationDB,
    ConfigurationResponse,
    ConfigurationListResponse,
    ConfigurationListItem,
    PendulumParameters,
    PendulumCharacteristics,
)
from physics import compute_characteristics, build_warnings_and_info

router = APIRouter()

PRESETS = [
    {
        "name": "Simple Harmonic",
        "description": "Malá výchylka pre presné analytické riešenie",
        "length": 1.0, "mass": 1.0, "damping": 0.0,
        "initial_angle": 3.0, "initial_angular_velocity": 0.0,
        "time_step": 0.01, "numerical_method": "analytical",
    },
    {
        "name": "Damped Small",
        "description": "Malá výchylka s tlmením",
        "length": 1.0, "mass": 1.0, "damping": 0.1,
        "initial_angle": 5.0, "initial_angular_velocity": 0.0,
        "time_step": 0.01, "numerical_method": "analytical",
    },
    {
        "name": "Large Swing",
        "description": "Veľká výchylka - nelineárne správanie",
        "length": 1.0, "mass": 1.0, "damping": 0.0,
        "initial_angle": 30.0, "initial_angular_velocity": 0.0,
        "time_step": 0.01, "numerical_method": "runge_kutta_4",
    },
    {
        "name": "Extreme Swing",
        "description": "Extrémna výchylka",
        "length": 1.0, "mass": 1.0, "damping": 0.0,
        "initial_angle": 90.0, "initial_angular_velocity": 0.0,
        "time_step": 0.005, "numerical_method": "runge_kutta_4",
    },
    {
        "name": "Near Vertical",
        "description": "Takmer vertikálna poloha",
        "length": 1.0, "mass": 1.0, "damping": 0.0,
        "initial_angle": 179.0, "initial_angular_velocity": 0.0,
        "time_step": 0.001, "numerical_method": "runge_kutta_4",
    },
]


def _make_config_id() -> str:
    return "conf_" + uuid.uuid4().hex[:8]


def _db_to_response(db_cfg: ConfigurationDB, warnings: list, info: list) -> ConfigurationResponse:
    params = PendulumParameters(
        length=db_cfg.length, mass=db_cfg.mass, damping=db_cfg.damping,
        initial_angle=db_cfg.initial_angle,
        initial_angular_velocity=db_cfg.initial_angular_velocity,
        time_step=db_cfg.time_step, numerical_method=db_cfg.numerical_method,
    )
    chars = PendulumCharacteristics(
        small_angle_period=db_cfg.small_angle_period,
        small_angle_frequency=round(1.0 / db_cfg.small_angle_period, 4) if db_cfg.small_angle_period else 0,
        natural_frequency=db_cfg.natural_frequency,
        oscillation_type=db_cfg.oscillation_type,
        damping_type=db_cfg.damping_type,
        damping_coefficient=db_cfg.damping_coefficient,
        initial_energy=db_cfg.initial_energy,
        approximate_period=db_cfg.approximate_period,
    )
    return ConfigurationResponse(
        config_id=db_cfg.id, name=db_cfg.name, description=db_cfg.description,
        parameters=params, characteristics=chars, warnings=warnings, info=info,
        created_at=db_cfg.created_at,
    )


def _create_db_entry(config_id: str, data: ConfigurationCreate, chars: dict) -> ConfigurationDB:
    return ConfigurationDB(
        id=config_id, name=data.name, description=data.description,
        length=data.length, mass=data.mass, damping=data.damping,
        initial_angle=data.initial_angle,
        initial_angular_velocity=data.initial_angular_velocity,
        time_step=data.time_step, numerical_method=data.numerical_method,
        oscillation_type=chars["oscillation_type"],
        small_angle_period=chars["small_angle_period"],
        approximate_period=chars.get("approximate_period"),
        damping_type=chars["damping_type"],
        damping_coefficient=chars["damping_coefficient"],
        natural_frequency=chars["natural_frequency"],
        initial_energy=chars["initial_energy"],
    )


@router.post("/configurations", response_model=ConfigurationResponse, status_code=201)
def create_configuration(data: ConfigurationCreate, db: Session = Depends(get_db)):
    chars = compute_characteristics(
        data.length, data.mass, data.damping,
        data.initial_angle, data.initial_angular_velocity,
    )
    warnings, info = build_warnings_and_info(data.initial_angle, data.numerical_method, chars)
    config_id = _make_config_id()
    db_cfg = _create_db_entry(config_id, data, chars)
    db.add(db_cfg)
    db.commit()
    db.refresh(db_cfg)
    return _db_to_response(db_cfg, warnings, info)


@router.get("/configurations", response_model=ConfigurationListResponse)
def list_configurations(
    oscillation_type: Optional[str] = Query(None),
    method: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(ConfigurationDB)
    if oscillation_type:
        q = q.filter(ConfigurationDB.oscillation_type == oscillation_type)
    if method:
        q = q.filter(ConfigurationDB.numerical_method == method)
    configs = q.order_by(ConfigurationDB.created_at.desc()).all()

    items = []
    for cfg in configs:
        sim_count = db.query(func.count(SimulationDB.id)).filter(SimulationDB.config_id == cfg.id).scalar()
        params = PendulumParameters(
            length=cfg.length, mass=cfg.mass, damping=cfg.damping,
            initial_angle=cfg.initial_angle,
            initial_angular_velocity=cfg.initial_angular_velocity,
            time_step=cfg.time_step, numerical_method=cfg.numerical_method,
        )
        chars = PendulumCharacteristics(
            small_angle_period=cfg.small_angle_period,
            small_angle_frequency=round(1.0 / cfg.small_angle_period, 4) if cfg.small_angle_period else 0,
            natural_frequency=cfg.natural_frequency,
            oscillation_type=cfg.oscillation_type,
            damping_type=cfg.damping_type,
            damping_coefficient=cfg.damping_coefficient,
            initial_energy=cfg.initial_energy,
            approximate_period=cfg.approximate_period,
        )
        items.append(ConfigurationListItem(
            config_id=cfg.id, name=cfg.name, description=cfg.description,
            parameters=params, characteristics=chars,
            created_at=cfg.created_at, times_simulated=sim_count,
        ))
    return ConfigurationListResponse(configurations=items)


@router.get("/configurations/{config_id}", response_model=ConfigurationResponse)
def get_configuration(config_id: str, db: Session = Depends(get_db)):
    cfg = db.query(ConfigurationDB).filter(ConfigurationDB.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="Konfigurácia nenájdená")
    chars = compute_characteristics(cfg.length, cfg.mass, cfg.damping, cfg.initial_angle, cfg.initial_angular_velocity)
    warnings, info = build_warnings_and_info(cfg.initial_angle, cfg.numerical_method, chars)
    return _db_to_response(cfg, warnings, info)


@router.put("/configurations/{config_id}", response_model=ConfigurationResponse)
def update_configuration(config_id: str, data: ConfigurationUpdate, db: Session = Depends(get_db)):
    cfg = db.query(ConfigurationDB).filter(ConfigurationDB.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="Konfigurácia nenájdená")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(cfg, field, value)

    chars = compute_characteristics(cfg.length, cfg.mass, cfg.damping, cfg.initial_angle, cfg.initial_angular_velocity)
    cfg.oscillation_type = chars["oscillation_type"]
    cfg.small_angle_period = chars["small_angle_period"]
    cfg.approximate_period = chars.get("approximate_period")
    cfg.damping_type = chars["damping_type"]
    cfg.damping_coefficient = chars["damping_coefficient"]
    cfg.natural_frequency = chars["natural_frequency"]
    cfg.initial_energy = chars["initial_energy"]

    db.commit()
    db.refresh(cfg)
    warnings, info = build_warnings_and_info(cfg.initial_angle, cfg.numerical_method, chars)
    return _db_to_response(cfg, warnings, info)


@router.delete("/configurations/{config_id}", status_code=204)
def delete_configuration(config_id: str, db: Session = Depends(get_db)):
    cfg = db.query(ConfigurationDB).filter(ConfigurationDB.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="Konfigurácia nenájdená")
    db.delete(cfg)
    db.commit()


@router.post("/configurations/validate")
def validate_configuration(data: ConfigurationValidate):
    chars = compute_characteristics(
        data.length, data.mass, data.damping,
        data.initial_angle, data.initial_angular_velocity,
    )
    warnings, info = build_warnings_and_info(data.initial_angle, data.numerical_method, chars)
    return {"valid": True, "characteristics": chars, "warnings": warnings, "info": info}


@router.get("/configurations/{config_id}/history")
def config_history(config_id: str, db: Session = Depends(get_db)):
    cfg = db.query(ConfigurationDB).filter(ConfigurationDB.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="Konfigurácia nenájdená")
    sims = db.query(SimulationDB).filter(SimulationDB.config_id == config_id).order_by(SimulationDB.started_at.desc()).all()
    return {"config_id": config_id, "simulations": [
        {
            "simulation_id": s.id, "status": s.status, "duration": s.duration,
            "started_at": s.started_at, "completed_at": s.completed_at,
            "oscillations_count": s.oscillations_count, "energy_loss": s.energy_loss,
        } for s in sims
    ]}


@router.get("/configurations/{config_id}/compare")
def compare_methods(config_id: str, db: Session = Depends(get_db)):
    cfg = db.query(ConfigurationDB).filter(ConfigurationDB.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="Konfigurácia nenájdená")
    methods = ["euler", "runge_kutta_2", "runge_kutta_4", "analytical"]
    result = {}
    for m in methods:
        chars = compute_characteristics(cfg.length, cfg.mass, cfg.damping, cfg.initial_angle, cfg.initial_angular_velocity)
        warnings, info = build_warnings_and_info(cfg.initial_angle, m, chars)
        result[m] = {"warnings": warnings, "info": info, "characteristics": chars}
    return {"config_id": config_id, "comparison": result}


@router.post("/configurations/{config_id}/duplicate", response_model=ConfigurationResponse, status_code=201)
def duplicate_configuration(config_id: str, db: Session = Depends(get_db)):
    cfg = db.query(ConfigurationDB).filter(ConfigurationDB.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="Konfigurácia nenájdená")
    chars = compute_characteristics(cfg.length, cfg.mass, cfg.damping, cfg.initial_angle, cfg.initial_angular_velocity)
    warnings, info = build_warnings_and_info(cfg.initial_angle, cfg.numerical_method, chars)
    new_id = _make_config_id()
    dup = ConfigurationDB(
        id=new_id,
        name=f"{cfg.name} (kópia)",
        description=cfg.description,
        length=cfg.length, mass=cfg.mass, damping=cfg.damping,
        initial_angle=cfg.initial_angle,
        initial_angular_velocity=cfg.initial_angular_velocity,
        time_step=cfg.time_step, numerical_method=cfg.numerical_method,
        oscillation_type=chars["oscillation_type"],
        small_angle_period=chars["small_angle_period"],
        approximate_period=chars.get("approximate_period"),
        damping_type=chars["damping_type"],
        damping_coefficient=chars["damping_coefficient"],
        natural_frequency=chars["natural_frequency"],
        initial_energy=chars["initial_energy"],
    )
    db.add(dup)
    db.commit()
    db.refresh(dup)
    return _db_to_response(dup, warnings, info)


@router.get("/presets")
def get_presets():
    result = []
    for p in PRESETS:
        chars = compute_characteristics(p["length"], p["mass"], p["damping"], p["initial_angle"], p["initial_angular_velocity"])
        warnings, info = build_warnings_and_info(p["initial_angle"], p["numerical_method"], chars)
        result.append({**p, "characteristics": chars, "warnings": warnings, "info": info})
    return {"presets": result}
