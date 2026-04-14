from __future__ import annotations
from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from database import Base


# ---------------------------------------------------------------------------
# SQLAlchemy ORM models
# ---------------------------------------------------------------------------

class ConfigurationDB(Base):
    __tablename__ = "configurations"

    id = Column(String(50), primary_key=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    length = Column(Float, nullable=False)
    mass = Column(Float, nullable=False)
    damping = Column(Float, nullable=False)
    initial_angle = Column(Float, nullable=False)
    initial_angular_velocity = Column(Float, nullable=False)
    time_step = Column(Float, nullable=False)
    numerical_method = Column(String(50), nullable=False)
    oscillation_type = Column(String(20), nullable=False)
    small_angle_period = Column(Float, nullable=True)
    approximate_period = Column(Float, nullable=True)
    damping_type = Column(String(20), nullable=True)
    damping_coefficient = Column(Float, nullable=True)
    natural_frequency = Column(Float, nullable=True)
    initial_energy = Column(Float, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SimulationDB(Base):
    __tablename__ = "simulations"

    id = Column(String(50), primary_key=True)
    config_id = Column(String(50), ForeignKey("configurations.id"), nullable=False)
    status = Column(String(20), nullable=False, default="running")
    duration = Column(Float, nullable=False)
    started_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)
    total_steps = Column(Integer, nullable=True)
    oscillations_count = Column(Integer, nullable=True)
    final_angle = Column(Float, nullable=True)
    final_angular_velocity = Column(Float, nullable=True)
    energy_loss = Column(Float, nullable=True)
    average_period = Column(Float, nullable=True)


# ---------------------------------------------------------------------------
# Pydantic request/response schemas
# ---------------------------------------------------------------------------

NumericalMethod = Literal["euler", "runge_kutta_2", "runge_kutta_4", "analytical"]


class ConfigurationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    length: float = Field(..., gt=0, le=10)
    mass: float = Field(..., gt=0, le=100)
    damping: float = Field(..., ge=0)
    initial_angle: float = Field(..., ge=-180, le=180)
    initial_angular_velocity: float = Field(0.0, ge=-10, le=10)
    time_step: float = Field(..., ge=0.001, le=0.05)
    numerical_method: NumericalMethod


class ConfigurationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    length: Optional[float] = Field(None, gt=0, le=10)
    mass: Optional[float] = Field(None, gt=0, le=100)
    damping: Optional[float] = Field(None, ge=0)
    initial_angle: Optional[float] = Field(None, ge=-180, le=180)
    initial_angular_velocity: Optional[float] = Field(None, ge=-10, le=10)
    time_step: Optional[float] = Field(None, ge=0.001, le=0.05)
    numerical_method: Optional[NumericalMethod] = None


class ConfigurationValidate(ConfigurationCreate):
    pass


class PendulumParameters(BaseModel):
    length: float
    mass: float
    damping: float
    initial_angle: float
    initial_angular_velocity: float
    time_step: float
    numerical_method: str


class PendulumCharacteristics(BaseModel):
    small_angle_period: float
    small_angle_frequency: float
    natural_frequency: float
    oscillation_type: str
    damping_type: str
    damping_coefficient: float
    initial_energy: float
    approximate_period: Optional[float] = None


class ConfigurationResponse(BaseModel):
    config_id: str
    name: str
    description: Optional[str]
    parameters: PendulumParameters
    characteristics: PendulumCharacteristics
    warnings: List[str]
    info: List[str] = []
    created_at: datetime

    class Config:
        from_attributes = True


class ConfigurationListItem(BaseModel):
    config_id: str
    name: str
    description: Optional[str]
    parameters: PendulumParameters
    characteristics: PendulumCharacteristics
    created_at: datetime
    times_simulated: int = 0

    class Config:
        from_attributes = True


class ConfigurationListResponse(BaseModel):
    configurations: List[ConfigurationListItem]


class SimulationStart(BaseModel):
    config_id: str
    duration: float = Field(..., gt=0, le=120)


class SimulationResponse(BaseModel):
    simulation_id: str
    config_id: str
    config_name: str
    websocket_url: str
    status: str
    duration: float
    oscillation_type: str
    method: str
    started_at: datetime

    class Config:
        from_attributes = True


class SimulationDetail(BaseModel):
    simulation_id: str
    config_id: str
    status: str
    duration: float
    started_at: datetime
    completed_at: Optional[datetime]
    total_steps: Optional[int]
    oscillations_count: Optional[int]
    final_angle: Optional[float]
    final_angular_velocity: Optional[float]
    energy_loss: Optional[float]
    average_period: Optional[float]

    class Config:
        from_attributes = True


class SimulationListResponse(BaseModel):
    simulations: List[SimulationDetail]
