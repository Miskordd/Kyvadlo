import asyncio
import websockets
import json
import sys

SIM_ID = sys.argv[1] if len(sys.argv) > 1 else "sim_XXXXXXXX"

async def test():
    url = f"ws://localhost:8000/ws/{SIM_ID}"
    print(f"Pripájam sa na {url}")
    async with websockets.connect(url) as ws:
        async for msg in ws:
            d = json.loads(msg)
            if d["type"] == "setup":
                print(f"SETUP:  {d['simulation_id']}  trvanie={d['duration']}s")
            elif d["type"] == "data":
                print(f"  t={d['time']:6.2f}  uhol={d['angle']:7.3f}°  E={d['total_energy']:.4f}J")
            elif d["type"] == "turning_point":
                print(f"  >> OBRAT  t={d['time']}  max={d['max_angle']}°  strana={d['side']}")
            elif d["type"] == "completed":
                print(f"KONIEC  oscilacii={d['oscillations_count']}  avg_perioda={d['average_period']}s")

asyncio.run(test())
