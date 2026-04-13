# Zadanie projektu: Simulátor matematického kyvadla

## Úvod
Vytvorte webovú aplikáciu pre real-time simuláciu matematického (rovnoramenného) kyvadla. Aplikácia demonštruje rozdiely medzi analytickým riešením (platné len pre malé uhly) a numerickými metódami (potrebné pre veľké výchylky). Backend v Pythone zabezpečuje fyzikálne výpočty, frontend v JavaScripte vizualizáciu a WebSocket jednosmernú komunikáciu v reálnom čase.

---

## Architektúra komunikácie

### Communication Flow:
```
FÁZA 1: VYTVORENIE KONFIGURÁCIE
1. Používateľ vyplní formulár (dĺžka, hmotnosť, tlmenie, počiatočný uhol, krok, metóda)
   ↓
2. Frontend → REST API: POST /api/pendulum/configurations
   ↓
3. Backend: Validácia parametrov → Výpočet charakteristík → Klasifikácia typu oscilácií
   ↓
4. Backend → Frontend: JSON response (config_id, charakteristiky, varovanie o platnosti analytického riešenia)
   ↓
5. Frontend: Zobrazenie uloženej konfigurácie v zozname

FÁZA 2: SPRÁVA KONFIGURÁCIÍ
6. Frontend → REST API: GET /api/pendulum/configurations
   ↓
7. Backend → Frontend: Zoznam všetkých uložených konfigurácií
   ↓
8. Frontend: Zobrazenie zoznamu s možnosťou výberu

FÁZA 3: SPUSTENIE SIMULÁCIE
9. Používateľ vyberie konfiguráciu a nastaví trvanie simulácie
   ↓
10. Frontend → REST API: POST /api/pendulum/simulations/start
    Body: {"config_id": "conf_abc123", "duration": 20.0}
   ↓
11. Backend: Načítanie konfigurácie → Vytvorenie simulácie → Spustenie na pozadí
   ↓
12. Backend → Frontend: JSON response (simulation_id, websocket_url)
   ↓
13. Frontend: Otvorenie WebSocket spojenia (ws://localhost:8000/ws/{simulation_id})
   ↓
14. Backend → Frontend: Prvá správa (type: "setup")
   ↓
15. Backend → Frontend: Pravidelné správy (type: "data") každých 50ms
   ↓
16. Backend → Frontend: Posledná správa (type: "completed")
   ↓
17. Frontend: Zatvorenie WebSocket spojenia
```

**Kľúčové charakteristiky:**
- **Oddelenie konfigurácie fyzikálneho systému a spustenia simulácie**
- **Demonštrácia rozdielov medzi malými a veľkými osciláciami**
- Konfigurácie obsahujú fyzikálne parametre a numerickú metódu
- Pre malé uhly (θ₀ < 5°): analytické riešenie je presné
- Pre väčšie uhly: nutné numerické metódy (nelineárna rovnica)
- Rovnakú konfiguráciu možno spustiť s rôznym trvaním
- REST API slúži na správu konfigurácií a riadenie simulácií
- WebSocket je **jednosmerný** (server → klient) - prenos simulačných dát

---

## 1. Backend (Python)

### 1.1 Fyzikálny model

Implementujte simulátor matematického kyvadla podľa diferenciálnej rovnice:

**Presná rovnica (nelineárna):**
```
I·θ̈ + c·θ̇ + m·g·L·sin(θ) = 0
```

kde moment zotrvačnosti pre hmotný bod: `I = m·L²`

Zjednodušene:
```
θ̈ + (c/m·L²)·θ̇ + (g/L)·sin(θ) = 0
```

kde:
- `θ` = uhol výchylky od vertikály [radiány]
- `L` = dĺžka kyvadla [m]
- `m` = hmotnosť závažia [kg]
- `g` = gravitačné zrýchlenie (9.81 m/s²)
- `c` = koeficient tlmenia [kg·m²/s]

**Aproximácia pre malé uhly (θ < 5° ≈ 0.087 rad):**
```
sin(θ) ≈ θ

θ̈ + (c/m·L²)·θ̇ + (g/L)·θ = 0
```
Táto lineárna rovnica má analytické riešenie!

**Analytické riešenie pre malé uhly (netlmené):**
```
θ(t) = θ₀·cos(ω₀·t + φ)
kde ω₀ = √(g/L) - prirodzená frekvencia
```

**Analytické riešenie pre malé uhly (tlmené, podkritické):**
```
θ(t) = θ₀·exp(-γ·t)·cos(ω_d·t + φ)
kde:
  γ = c/(2m·L²) - koeficient útlmu
  ω_d = √(ω₀² - γ²) - tlmená frekvencia
```

**Pre veľké uhly (θ₀ ≥ 5°):**
- Analytické riešenie neexistuje v uzavretom tvare
- Nutné použiť numerické metódy (Euler, RK4)
- Perióda závisí od amplitúdy (neizochronizmus)
- Približný vzorec pre periódu s veľkou amplitúdou:
  ```
  T ≈ T₀·[1 + (1/4)·sin²(θ₀/2) + (9/64)·sin⁴(θ₀/2) + ...]
  kde T₀ = 2π√(L/g)
  ```

### 1.2 Požiadavky na implementáciu

- Implementujte minimálne **3 rôzne metódy riešenia**:
  1. **Eulerova metóda** - jednoduchá, 1. rád presnosti
  2. **Runge-Kutta 4. rádu** - presnejšia, 4. rád presnosti
  3. **Analytická metóda** - najpresnejšia **iba pre θ₀ < 5°**
  
- **Dôležité:** Pri vytvorení konfigurácie s θ₀ ≥ 5° a analytickou metódou:
  - Backend vráti **WARNING**: "Analytické riešenie nie je presné pre uhly ≥ 5°"
  - Ponúkne odporúčanie použiť RK4
  - Ak používateľ trvá na analytickej metóde, backend ju použije (ale výsledky nebudú presné)

- Časový krok simulácie: konfigurovateľný (odporúčané: 0.001 - 0.05s)

- Validácia vstupných parametrov:
  - `L > 0` a `L ≤ 10m` (realistická dĺžka)
  - `m > 0` a `m ≤ 100kg` (realistická hmotnosť)
  - `c ≥ 0` (tlmenie nemôže byť záporné)
  - `|θ₀| ≤ 180°` (fyzikálne možné uhly)
  - `-10 ≤ ω₀ ≤ 10 rad/s` (počiatočná uhlová rýchlosť)
  - `0.001 ≤ time_step ≤ 0.05` (stabilita numeriky)
  - `duration > 0` a `duration ≤ 120s`

- Výpočet charakteristík systému:
  - **Perióda pre malé oscilace**: T₀ = 2π√(L/g)
  - **Frekvencia**: f₀ = 1/T₀
  - **Typ oscilácií**:
    - "small_angle" (θ₀ < 5°) - linearizovaný systém
    - "large_angle" (θ₀ ≥ 5°) - nelineárny systém
  - **Typ tlmenia**:
    - Netlmené (c = 0)
    - Podkritické (γ < ω₀)
    - Kritické (γ = ω₀)
    - Nadkritické (γ > ω₀)
  - **Koeficient tlmenia**: γ = c/(2m·L²)
  - **Energia systému**: E = (1/2)·m·L²·ω² + m·g·L·(1 - cos(θ))
  - **Približná perióda pre veľké uhly** (ak θ₀ ≥ 5°)

- Asynchrónny beh simulácie (background task po spustení cez REST API)

### 1.3 REST API - Správa konfigurácií

#### `POST /api/pendulum/configurations`
Vytvorí a uloží novú konfiguráciu kyvadla. **Nespúšťa simuláciu**, len validuje a ukladá parametre.

**Request:**
```json
{
  "name": "Veľká výchylka 30°",
  "description": "Demonštrácia neizochronizmu pre veľké uhly",
  "length": 1.0,
  "mass": 1.0,
  "damping": 0.1,
  "initial_angle": 30.0,
  "initial_angular_velocity": 0.0,
  "time_step": 0.01,
  "numerical_method": "runge_kutta_4"
}
```

**Podporované numerické metódy:**
- `"euler"` - Eulerova metóda
- `"runge_kutta_2"` - RK2
- `"runge_kutta_4"` - RK4 (odporúčaná pre veľké uhly)
- `"analytical"` - analytická metóda (presná len pre θ₀ < 5°)

**Odpoveď:**
```json
{
  "config_id": "conf_abc123",
  "name": "Veľká výchylka 30°",
  "description": "Demonštrácia neizochronizmu pre veľké uhly",
  "parameters": {
    "length": 1.0,
    "mass": 1.0,
    "damping": 0.1,
    "initial_angle": 30.0,
    "initial_angular_velocity": 0.0,
    "time_step": 0.01,
    "numerical_method": "runge_kutta_4"
  },
  "characteristics": {
    "small_angle_period": 2.006,
    "small_angle_frequency": 0.499,
    "oscillation_type": "large_angle",
    "approximate_period": 2.095,
    "damping_type": "underdamped",
    "damping_coefficient": 0.05,
    "natural_frequency": 3.132,
    "initial_energy": 1.296
  },
  "warnings": [
    "Veľká počiatočná výchylka (30.0°) - nelineárne správanie",
    "Perióda bude závisieť od amplitúdy (neizochronizmus)",
    "Odporúčaná metóda: runge_kutta_4"
  ],
  "created_at": "2025-11-08T10:30:00Z"
}
```

**Príklad s malým uhlom a analytickou metódou:**
```json
{
  "name": "Malá výchylka 3°",
  "length": 1.0,
  "mass": 1.0,
  "damping": 0.0,
  "initial_angle": 3.0,
  "initial_angular_velocity": 0.0,
  "time_step": 0.01,
  "numerical_method": "analytical"
}
```

**Odpoveď:**
```json
{
  "config_id": "conf_def456",
  "name": "Malá výchylka 3°",
  "parameters": {...},
  "characteristics": {
    "small_angle_period": 2.006,
    "small_angle_frequency": 0.499,
    "oscillation_type": "small_angle",
    "damping_type": "undamped",
    "natural_frequency": 3.132,
    "initial_energy": 0.013
  },
  "warnings": [],
  "info": [
    "Malá výchylka (3.0°) - linearizácia je platná",
    "Analytické riešenie bude presné",
    "Perióda nezávisí od amplitúdy (izochronizmus)"
  ],
  "created_at": "2025-11-08T10:35:00Z"
}
```

**Príklad s varovným prípadom (veľký uhol + analytická metóda):**
```json
{
  "name": "Nesprávne nastavenie",
  "length": 1.0,
  "mass": 1.0,
  "damping": 0.0,
  "initial_angle": 45.0,
  "initial_angular_velocity": 0.0,
  "time_step": 0.01,
  "numerical_method": "analytical"
}
```

**Odpoveď:**
```json
{
  "config_id": "conf_ghi789",
  "name": "Nesprávne nastavenie",
  "parameters": {...},
  "characteristics": {...},
  "warnings": [
    "⚠️ KRITICKÉ: Analytické riešenie nie je presné pre θ₀ = 45.0° (≥ 5°)",
    "Výsledky simulácie budú obsahovať významné chyby",
    "Silne odporúčame zmeniť metódu na 'runge_kutta_4'",
    "Aproximácia sin(θ) ≈ θ má chybu ~20% pri 45°"
  ],
  "created_at": "2025-11-08T10:40:00Z"
}
```

#### `GET /api/pendulum/configurations`
Vráti zoznam všetkých uložených konfigurácií.

**Query parametre:**
- `oscillation_type` - filter: "small_angle" / "large_angle"
- `method` - filter podľa metódy

**Odpoveď:**
```json
{
  "configurations": [
    {
      "config_id": "conf_abc123",
      "name": "Veľká výchylka 30°",
      "description": "Demonštrácia neizochronizmu",
      "parameters": {
        "length": 1.0,
        "mass": 1.0,
        "initial_angle": 30.0,
        "numerical_method": "runge_kutta_4"
      },
      "characteristics": {
        "oscillation_type": "large_angle",
        "approximate_period": 2.095
      },
      "created_at": "2025-11-08T10:30:00Z",
      "times_simulated": 5
    },
    {
      "config_id": "conf_def456",
      "name": "Malá výchylka 3°",
      "parameters": {
        "initial_angle": 3.0,
        "numerical_method": "analytical"
      },
      "characteristics": {
        "oscillation_type": "small_angle",
        "small_angle_period": 2.006
      },
      "created_at": "2025-11-08T10:35:00Z",
      "times_simulated": 3
    }
  ]
}
```

#### `GET /api/pendulum/configurations/{config_id}`
Vráti detail konkrétnej konfigurácie.

#### `PUT /api/pendulum/configurations/{config_id}`
Aktualizuje existujúcu konfiguráciu.

#### `DELETE /api/pendulum/configurations/{config_id}`
Zmaže konfiguráciu.

#### `POST /api/pendulum/configurations/validate`
Real-time validácia (pre frontend feedback).

### 1.4 REST API - Správa simulácií

#### `POST /api/pendulum/simulations/start`
Spustí simuláciu na základe existujúcej konfigurácie.

**Request:**
```json
{
  "config_id": "conf_abc123",
  "duration": 20.0
}
```

**Odpoveď:**
```json
{
  "simulation_id": "sim_xyz789",
  "config_id": "conf_abc123",
  "config_name": "Veľká výchylka 30°",
  "websocket_url": "ws://localhost:8000/ws/sim_xyz789",
  "status": "running",
  "duration": 20.0,
  "oscillation_type": "large_angle",
  "method": "runge_kutta_4",
  "started_at": "2025-11-08T10:45:00Z"
}
```

#### `GET /api/pendulum/simulations`
Vráti zoznam všetkých simulácií.

**Query parametre:**
- `status` - "running" / "completed" / "stopped"
- `config_id` - filter podľa konfigurácie
- `oscillation_type` - "small_angle" / "large_angle"
- `limit` - max počet výsledkov

#### `GET /api/pendulum/simulations/{simulation_id}`
Detail simulácie.

#### `DELETE /api/pendulum/simulations/{simulation_id}`
Zastaví bežiacu simuláciu.

#### Ďalšie endpointy:
- `GET /api/pendulum/configurations/{config_id}/history` - história simulácií
- `GET /api/pendulum/configurations/{config_id}/compare` - porovnanie metód
- `GET /api/pendulum/presets` - prednastavené konfigurácie:
  - "simple_harmonic" (θ₀=3°, netlmené, analytical)
  - "damped_small" (θ₀=5°, tlmené, analytical)
  - "large_swing" (θ₀=30°, netlmené, RK4)
  - "extreme_swing" (θ₀=90°, netlmené, RK4)
  - "near_vertical" (θ₀=179°, netlmené, RK4)
- `GET /api/info` - server info

### 1.5 WebSocket server (jednosmerný)
- Framework: `websockets` alebo `socket.io`
- Endpoint: `ws://localhost:8000/ws/{simulation_id}`
- **Iba jednostranná komunikácia:** server → klient

**Prvá správa (setup):**
```json
{
  "type": "setup",
  "simulation_id": "sim_xyz789",
  "config_id": "conf_abc123",
  "parameters": {
    "length": 1.0,
    "mass": 1.0,
    "damping": 0.1,
    "initial_angle": 30.0,
    "initial_angular_velocity": 0.0,
    "time_step": 0.01,
    "method": "runge_kutta_4"
  },
  "characteristics": {
    "oscillation_type": "large_angle",
    "approximate_period": 2.095,
    "damping_type": "underdamped",
    "initial_energy": 1.296
  },
  "duration": 20.0
}
```

**Následné správy (dáta simulácie)** - každých 50ms:
```json
{
  "type": "data",
  "time": 5.25,
  "angle": 18.5,
  "angular_velocity": -2.15,
  "angular_acceleration": 4.82,
  "position": {
    "x": 0.32,
    "y": -0.95
  },
  "velocity": {
    "vx": 2.04,
    "vy": 0.69
  },
  "kinetic_energy": 2.31,
  "potential_energy": 0.48,
  "total_energy": 2.79,
  "damping_loss": 0.52
}
```

**Správa o zmene smeru (voliteľné):**
```json
{
  "type": "turning_point",
  "time": 1.048,
  "max_angle": 29.8,
  "side": "right"
}
```

**Posledná správa:**
```json
{
  "type": "completed",
  "total_time": 20.0,
  "total_steps": 2000,
  "oscillations_count": 9,
  "final_angle": 5.2,
  "final_angular_velocity": -1.15,
  "energy_loss": 2.45,
  "average_period": 2.11
}
```

---

## 2. Frontend (JavaScript/HTML/CSS)

### 2.1 Používateľské rozhranie

**Sekcia 1: Správa konfigurácií**
- Formulár na vytvorenie novej konfigurácie:
  - Názov konfigurácie
  - Popis (voliteľné)
  - Dĺžka kyvadla (m) - slider 0.1-5m, default 1.0
  - Hmotnosť závaží (kg) - slider 0.1-10kg, default 1.0
  - Koeficient tlmenia (kg·m²/s) - slider 0-2.0, default 0.0
  - **Počiatočný uhol (°)** - slider -180° až 180°, default 10°
    - **Vizuálny indikátor:**
      - Zelená zóna: |θ| < 5° (analytické riešenie platné)
      - Žltá zóna: 5° ≤ |θ| < 30° (mierne nelineárne)
      - Oranžová zóna: 30° ≤ |θ| < 90° (výrazne nelineárne)
      - Červená zóna: |θ| ≥ 90° (extrémne výchylky)
  - Počiatočná uhlová rýchlosť (rad/s) - default 0.0
  - Časový krok (s) - default 0.01
  - **Numerická metóda** - dropdown s odporúčaním:
    - Euler
    - RK2
    - RK4 (odporúčané pre θ > 5°)
    - Analytical (platné len pre θ < 5°)
- **Real-time warning system:**
  - Ak θ ≥ 5° a metóda je "analytical": zobraz červené varovanie
  - Ponúkni tlačidlo "Zmeniť na RK4"
- Tlačidlo "Uložiť konfiguráciu"
- Zobrazenie vypočítaných charakteristík
- Validácia na strane klienta

**Sekcia 2: Zoznam konfigurácií**
- Tabuľka/karty s konfiguráciami
- Filter: Malé uhly / Veľké uhly / Všetky
- Farebné značenie:
  - 🟢 Malé uhly (analytical platná)
  - 🟡 Stredné uhly
  - 🔴 Veľké uhly
- Pre každú konfiguráciu:
  - Názov, popis
  - Základné parametre (L, m, θ₀)
  - Typ oscilácií
  - Počet spustení
  - Tlačidlá: "Spustiť", "Upraviť", "Zmazať", "Duplikovať", "Porovnať metódy"

**Sekcia 3: Porovnanie metód** (špeciálna funkcia)
- Možnosť spustiť rovnakú konfiguráciu s rôznymi metódami súčasne
- Vizuálne zobrazenie všetkých trajektórií na jednom grafe
- Pre veľké uhly: ukázať rozdiely medzi analytical a RK4
- Pre malé uhly: ukázať, že všetky metódy dávajú podobné výsledky

**Sekcia 4: Nastavenie simulácie**
- Výber konfigurácie
- Nastavenie trvania (s) - default 20.0
- Tlačidlo "Spustiť simuláciu"

**Sekcia 5: Vizualizácia simulácie**
- **Canvas animácia kyvadla:**
  - Pohľad zboku
  - Tyč kyvadla
  - Závažie (guľa)
  - Stopa trajektórie (oblúk)
  - Značka rovnovážnej polohy
  - Grid s uhlami (každých 15°)
- **Real-time hodnoty:**
  - Čas (s)
  - Uhol (°)
  - Uhlová rýchlosť (rad/s)
  - Uhlová akcelerácia (rad/s²)
  - Kinetická energia (J)
  - Potenciálna energia (J)
  - Celková energia (J)
  - Strata energie tlmením (J)
- **Grafy (Chart.js/D3.js):**
  - **Uhol vs. čas** - hlavný graf
  - **Uhlová rýchlosť vs. čas**
  - **Fázový diagram** (θ vs. ω) - kruh pre netlmené, špirála pre tlmené
  - **Energia vs. čas** - tri krivky (Ek, Ep, Etotal)
  - **Perióda vs. čas** - ukázať zmeny periódy pri veľkých uhloch
- **Špeciálne vizualizácie:**
  - Porovnanie sin(θ) vs. θ (pre demonštráciu aproximácie)
  - Animovaný rozdiel medzi linearizovaným a presným riešením
- Tlačidlá: Stop, Reset, Porovnať s analytical
- Plynulá animácia (60 FPS)

**Sekcia 6: História a porovnania**
- História simulácií
- Porovnanie výsledkov rôznych metód
- Export dát

- Responzívny dizajn

### 2.2 Workflow používateľa

**Typický experimentálny workflow:**

1. **Experiment 1: Malé uhly (θ₀ = 3°)**
   - Vytvoriť konfiguráciu s analytical metódou
   - Spustiť simuláciu
   - Pozorovanie: perióda konštantná, analytical riešenie presné

2. **Experiment 2: Stredné uhly (θ₀ = 15°)**
   - Vytvoriť konfiguráciu s RK4
   - Spustiť simuláciu
   - Použiť funkciu "Porovnať s analytical"
   - Pozorovanie: analytical má malé chyby, perióda mierne dlhšia

3. **Experiment 3: Veľké uhly (θ₀ = 60°)**
   - Vytvoriť konfiguráciu s RK4
   - Spustiť simuláciu
   - Použiť "Porovnať s analytical"
   - Pozorovanie: analytical úplne nepresné, výrazný neizochronizmus

4. **Experiment 4: Extrémna výchylka (θ₀ = 170°)**
   - Takmer vertikálna pozícia
   - Ukázať, že kyvadlo môže spraviť "looping" ak má dostatok energie

### 2.3 Príklad implementácie

```javascript
// Vytvorenie konfigurácie s real-time validáciou
async function saveConfiguration() {
    const angle = parseFloat(document.getElementById('initialAngle').value);
    const method = document.getElementById('method').value;
    
    // Real-time warning
    if (Math.abs(angle) >= 5 && method === 'analytical') {
        showWarning('⚠️ Analytické riešenie nie je presné pre θ ≥ 5°. Odporúčame RK4.');
    }
    
    const configData = {
        name: document.getElementById('configName').value,
        description: document.getElementById('configDesc').value,
        length: parseFloat(document.getElementById('length').value),
        mass: parseFloat(document.getElementById('mass').value),
        damping: parseFloat(document.getElementById('damping').value),
        initial_angle: angle,
        initial_angular_velocity: parseFloat(document.getElementById('angVelocity').value),
        time_step: parseFloat(document.getElementById('timeStep').value),
        numerical_method: method
    };
    
    const response = await fetch('/api/pendulum/configurations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData)
    });
    
    const config = await response.json();
    
    // Zobraz warnings z backendu
    if (config.warnings && config.warnings.length > 0) {
        displayWarnings(config.warnings);
    }
    
    displayCharacteristics(config.characteristics);
    addConfigToList(config);
}

// Vizualizácia s dôrazom na nelineárne efekty
function updateVisualization(data) {
    // Nakresli kyvadlo
    drawPendulum(data.angle, data.position);
    
    // Aktualizuj grafy
    addDataToChart('angle', data.time, data.angle);
    addDataToChart('angular_velocity', data.time, data.angular_velocity);
    updatePhaseSpace(data.angle, data.angular_velocity);
    
    // Graf energií
    updateEnergyChart(data.time, {
        kinetic: data.kinetic_energy,
        potential: data.potential_energy,
        total: data.total_energy
    });
    
    // Vypočítaj aktuálnu periódu (pre demonštráciu neizochronizmu)
    if (data.type === 'turning_point') {
        calculateAndDisplayPeriod(data.time);
    }
}

// Špeciálna funkcia: Porovnanie s analytickým riešením
async function compareWithAnalytical(configId) {
    // Spusť rovnakú konfiguráciu s analytical metódou
    const analyticalConfigId = await createAnalyticalVersion(configId);
    
    // Spusť obe simulácie paralelne
    const numericalWs = await startSimulation(configId);
    const analyticalWs = await startSimulation(analyticalConfigId);
    
    // Vizualizuj obe trajektórie na jednom grafe
    displayComparison(numericalWs, analyticalWs);
}

// Vizualizácia aproximácie sin(θ) ≈ θ
function drawSineApproximation(angle) {
    const angleRad = angle * Math.PI / 180;
    const sinValue = Math.sin(angleRad);
    const linearValue = angleRad;
    const error = Math.abs(sinValue - linearValue) / sinValue * 100;
    
    // Nakresli porovnanie
    displayApproximationError(angle, error);
}
```

### 2.4 Špeciálne vizualizácie pre demonštráciu

**1. Vizualizácia aproximácie:**
```
Graf zobrazujúci:
- y = sin(θ) (presná funkcia)
- y = θ (lineárna aproximácia)
- Zvýraznená oblasť θ < 5° kde sú takmer identické
- Číslo ukazujúce % chybu pri aktuálnom uhle
```

**2. Neizochronizmus:**
```
Graf periódy vs. amplitúdy
- Ukázať, že pre malé uhly je perióda konštantná
- Pre veľké uhly perióda rastie
```

**3. Porovnanie metód:**
```
Jeden graf s tromi krivkami:
- Analytical (zelená) - presná pre malé uhly
- Euler (červená) - najmenej presná
- RK4 (modrá) - najpresnejšia
```

---

## 3. Minimálne požiadavky na funkcionalitu

### Backend musí:
1. Implementovať nelineárnu rovnicu kyvadla s minimálne 3 metódami
2. **Správne rozlišovať malé a veľké uhly**
3. **Implementovať analytické riešenie pre θ < 5°**
4. **Poskytovať varovania pri nesprávnom použití analytical metódy**
5. Poskytovať API pre správu konfigurácií (CRUD)
6. Poskytovať API pre správu simulácií
7. Ukladať do databázy s typom oscilácií
8. Generovať unikátne IDs
9. Asynchrónny beh simulácií
10. WebSocket komunikácia so všetkými potrebnými dátami
11. Výpočet energie systému
12. Detekcia obratov (turning points)

### Frontend musí:
1. Formulár s vizuálnymi indikátormi pre uhly
2. **Real-time warning systém** pri θ ≥ 5° a analytical
3. Zoznam konfigurácií s farebným kódovaním
4. **Funkcia porovnania metód**
5. Volať správne API endpointy
6. WebSocket pripojenie
7. **Vizualizácia kyvadla s uhlovou stupnicou**
8. Grafy: uhol, rýchlosť, fázový diagram, energia
9. **Demonštrácia aproximácie sin(θ) ≈ θ**
10. **Vizualizácia neizochronizmu**
11. Export dát a porovnaní
12. Responzívny dizajn

### Edukačné prvky musí obsahovať:
1. **Tooltip vysvetlenia:**
   - Čo je linearizácia
   - Prečo sin(θ) ≈ θ pre malé uhly
   - Čo je neizochronizmus
2. **Interaktívne demonštrácie:**
   - Slider uhla s real-time aktualizáciou chyby aproximácie
   - Animácia porovnania linearizovaného a presného riešenia
3. **Prednastavené experimenty:**
   - "Malé oscilace" - ukázať presnosť analytical
   - "Veľké oscilace" - ukázať potrebu numerických metód
   - "Looping" - extrémne výchylky

### Security, DevOps - štandardné požiadavky

---

## 4. Príklady použitia API

### 1. Vytvorenie konfigurácie (malý uhol)
```bash
curl -X POST http://localhost:8000/api/pendulum/configurations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jednoduchý harmonický pohyb",
    "description": "Malá výchylka pre presné analytické riešenie",
    "length": 1.0,
    "mass": 1.0,
    "damping": 0.0,
    "initial_angle": 3.0,
    "initial_angular_velocity": 0.0,
    "time_step": 0.01,
    "numerical_method": "analytical"
  }'
```

### 2. Vytvorenie konfigurácie (veľký uhol)
```bash
curl -X POST http://localhost:8000/api/pendulum/configurations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nelineárne kyvadlo",
    "description": "Veľká výchylka vyžadujúca numerickú metódu",
    "length": 1.5,
    "mass": 2.0,
    "damping": 0.2,
    "initial_angle": 45.0,
    "initial_angular_velocity": 0.0,
    "time_step": 0.01,
    "numerical_method": "runge_kutta_4"
  }'
```

### 3. Získanie prednastavených konfigurácií
```bash
curl -X GET http://localhost:8000/api/pendulum/presets
```

### 4. Porovnanie metód pre konfiguráciu
```bash
curl -X GET http://localhost:8000/api/pendulum/configurations/conf_abc123/compare
```

---

## 5. Dátový model

### Tabuľka: configurations
```sql
CREATE TABLE configurations (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    length FLOAT NOT NULL,
    mass FLOAT NOT NULL,
    damping FLOAT NOT NULL,
    initial_angle FLOAT NOT NULL,
    initial_angular_velocity FLOAT NOT NULL,
    time_step FLOAT NOT NULL,
    numerical_method VARCHAR(50) NOT NULL,
    oscillation_type VARCHAR(20) NOT NULL, -- 'small_angle' or 'large_angle'
    small_angle_period FLOAT,
    approximate_period FLOAT,
    damping_type VARCHAR(20),
    damping_coefficient FLOAT,
    initial_energy FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Tabuľka: simulations
```sql
CREATE TABLE simulations (
    id VARCHAR(50) PRIMARY KEY,
    config_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    duration FLOAT NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    total_steps INTEGER,
    oscillations_count INTEGER,
    final_angle FLOAT,
    energy_loss FLOAT,
    average_period FLOAT,
    FOREIGN KEY (config_id) REFERENCES configurations(id)
);
```

---

## Tipy a odporúčania

### Pre backend:
- **Implementácia derivácií:**
  ```python
  def derivatives(state, t, L, m, g, c):
      theta, omega = state
      I = m * L**2
      dtheta_dt = omega
      domega_dt = -(c/I)*omega - (g/L)*np.sin(theta)
      return [dtheta_dt, domega_dt]
  ```

- **Analytické riešenie (netlmené):**
  ```python
  def analytical_solution(t, theta0, L, g):
      omega0 = np.sqrt(g/L)
      return theta0 * np.cos(omega0 * t)
  ```

- **Detekcia typu oscilácií:**
  ```python
  def classify_oscillation(theta0_deg):
      return "small_angle" if abs(theta0_deg) < 5 else "large_angle"
  ```

- **Približná perióda pre veľké uhly (prvý člen rozvoja):**
  ```python
  def approximate_period(theta0_rad, L, g):
      T0 = 2 * np.pi * np.sqrt(L/g)
      k = np.sin(theta0_rad/2)**2
      return T0 * (1 + 0.25*k + 9/64*k**2)
  ```

### Pre frontend:
- Použiť gradient farby pre slider uhla (zelená → žltá → červená)
- Animovať prechod z malých na veľké uhly
- Tooltip s matematickými vzorcami
- Interaktívny graf sin(θ) vs θ s posuvníkom

---

**Veľa úspechov pri realizácii tohto edukačného projektu! 🎓📐**