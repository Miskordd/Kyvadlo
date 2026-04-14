import math
import numpy as np
from typing import Literal

G = 9.81
SMALL_ANGLE_THRESHOLD_DEG = 5.0
SMALL_ANGLE_THRESHOLD_RAD = math.radians(SMALL_ANGLE_THRESHOLD_DEG)


def derivatives(theta: float, omega: float, L: float, m: float, c: float) -> tuple[float, float]:
    I = m * L ** 2
    dtheta = omega
    domega = -(c / I) * omega - (G / L) * math.sin(theta)
    return dtheta, domega


def step_euler(theta: float, omega: float, dt: float, L: float, m: float, c: float) -> tuple[float, float]:
    dtheta, domega = derivatives(theta, omega, L, m, c)
    return theta + dtheta * dt, omega + domega * dt


def step_rk2(theta: float, omega: float, dt: float, L: float, m: float, c: float) -> tuple[float, float]:
    k1_t, k1_w = derivatives(theta, omega, L, m, c)
    k2_t, k2_w = derivatives(theta + k1_t * dt, omega + k1_w * dt, L, m, c)
    return theta + dt * (k1_t + k2_t) / 2, omega + dt * (k1_w + k2_w) / 2


def step_rk4(theta: float, omega: float, dt: float, L: float, m: float, c: float) -> tuple[float, float]:
    k1_t, k1_w = derivatives(theta, omega, L, m, c)
    k2_t, k2_w = derivatives(theta + k1_t * dt / 2, omega + k1_w * dt / 2, L, m, c)
    k3_t, k3_w = derivatives(theta + k2_t * dt / 2, omega + k2_w * dt / 2, L, m, c)
    k4_t, k4_w = derivatives(theta + k3_t * dt, omega + k3_w * dt, L, m, c)
    new_theta = theta + dt * (k1_t + 2 * k2_t + 2 * k3_t + k4_t) / 6
    new_omega = omega + dt * (k1_w + 2 * k2_w + 2 * k3_w + k4_w) / 6
    return new_theta, new_omega


def step_analytical(
    t: float, theta0: float, omega0_init: float, L: float, m: float, c: float
) -> tuple[float, float]:
    """Analytical solution for small angles. Returns (theta, omega) at time t."""
    omega0 = math.sqrt(G / L)
    gamma = c / (2 * m * L ** 2)

    disc = omega0 ** 2 - gamma ** 2

    if abs(gamma) < 1e-12:
        # Undamped
        theta = theta0 * math.cos(omega0 * t)
        omega = -theta0 * omega0 * math.sin(omega0 * t)
    elif disc > 0:
        # Underdamped
        omega_d = math.sqrt(disc)
        A = theta0
        B = (omega0_init + gamma * theta0) / omega_d
        exp_part = math.exp(-gamma * t)
        theta = exp_part * (A * math.cos(omega_d * t) + B * math.sin(omega_d * t))
        omega = exp_part * (
            (-gamma * A + omega_d * B) * math.cos(omega_d * t)
            + (-gamma * B - omega_d * A) * math.sin(omega_d * t)
        )
    elif abs(disc) < 1e-12:
        # Critically damped
        exp_part = math.exp(-gamma * t)
        theta = exp_part * (theta0 + (omega0_init + gamma * theta0) * t)
        omega = exp_part * (
            (omega0_init + gamma * theta0) - gamma * (theta0 + (omega0_init + gamma * theta0) * t)
        )
    else:
        # Overdamped
        r = math.sqrt(-disc)
        r1, r2 = -gamma + r, -gamma - r
        A = (omega0_init - r2 * theta0) / (r1 - r2)
        B = theta0 - A
        theta = A * math.exp(r1 * t) + B * math.exp(r2 * t)
        omega = A * r1 * math.exp(r1 * t) + B * r2 * math.exp(r2 * t)

    return theta, omega


def compute_energy(theta: float, omega: float, L: float, m: float) -> dict:
    kinetic = 0.5 * m * L ** 2 * omega ** 2
    potential = m * G * L * (1 - math.cos(theta))
    return {
        "kinetic_energy": kinetic,
        "potential_energy": potential,
        "total_energy": kinetic + potential,
    }


def classify_oscillation(initial_angle_deg: float) -> Literal["small_angle", "large_angle"]:
    return "small_angle" if abs(initial_angle_deg) < SMALL_ANGLE_THRESHOLD_DEG else "large_angle"


def small_angle_period(L: float) -> float:
    return 2 * math.pi * math.sqrt(L / G)


def approximate_large_angle_period(theta0_rad: float, L: float) -> float:
    T0 = small_angle_period(L)
    k = math.sin(theta0_rad / 2) ** 2
    return T0 * (1 + 0.25 * k + (9 / 64) * k ** 2)


def compute_characteristics(
    length: float,
    mass: float,
    damping: float,
    initial_angle_deg: float,
    initial_angular_velocity: float,
) -> dict:
    theta0_rad = math.radians(initial_angle_deg)
    T0 = small_angle_period(length)
    f0 = 1.0 / T0
    omega0 = math.sqrt(G / length)
    gamma = damping / (2 * mass * length ** 2)
    osc_type = classify_oscillation(initial_angle_deg)

    initial_energy = compute_energy(theta0_rad, initial_angular_velocity, length, mass)["total_energy"]

    # Damping classification
    disc = omega0 ** 2 - gamma ** 2
    if damping == 0:
        damping_type = "undamped"
    elif disc > 1e-9:
        damping_type = "underdamped"
    elif abs(disc) <= 1e-9:
        damping_type = "critically_damped"
    else:
        damping_type = "overdamped"

    result = {
        "small_angle_period": round(T0, 4),
        "small_angle_frequency": round(f0, 4),
        "natural_frequency": round(omega0, 4),
        "oscillation_type": osc_type,
        "damping_type": damping_type,
        "damping_coefficient": round(gamma, 6),
        "initial_energy": round(initial_energy, 6),
    }

    if osc_type == "large_angle":
        result["approximate_period"] = round(approximate_large_angle_period(theta0_rad, length), 4)

    return result


def build_warnings_and_info(
    initial_angle_deg: float,
    numerical_method: str,
    characteristics: dict,
) -> tuple[list[str], list[str]]:
    warnings = []
    info = []
    osc_type = characteristics["oscillation_type"]

    if osc_type == "large_angle":
        warnings.append(f"Veľká počiatočná výchylka ({initial_angle_deg}°) - nelineárne správanie")
        warnings.append("Perióda bude závisieť od amplitúdy (neizochronizmus)")
        if numerical_method != "runge_kutta_4":
            warnings.append("Odporúčaná metóda: runge_kutta_4")
        if numerical_method == "analytical":
            err_pct = abs(math.sin(math.radians(initial_angle_deg)) - math.radians(initial_angle_deg)) / abs(math.sin(math.radians(initial_angle_deg))) * 100 if initial_angle_deg != 0 else 0
            warnings.insert(0, f"⚠️ KRITICKÉ: Analytické riešenie nie je presné pre θ₀ = {initial_angle_deg}° (≥ 5°)")
            warnings.append("Výsledky simulácie budú obsahovať významné chyby")
            warnings.append("Silne odporúčame zmeniť metódu na 'runge_kutta_4'")
            warnings.append(f"Aproximácia sin(θ) ≈ θ má chybu ~{err_pct:.0f}% pri {initial_angle_deg}°")
    else:
        info.append(f"Malá výchylka ({initial_angle_deg}°) - linearizácia je platná")
        if numerical_method == "analytical":
            info.append("Analytické riešenie bude presné")
        info.append("Perióda nezávisí od amplitúdy (izochronizmus)")

    return warnings, info
