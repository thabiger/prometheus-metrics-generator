import os
import time
import threading
import json
from datetime import datetime
from typing import Dict, List
import math

from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from prometheus_client import start_http_server, Gauge, Counter
import uvicorn

app = FastAPI(title="Metrics Generator")

# Mount static files and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Global storage for metrics configuration
metrics_config: Dict[str, Dict] = {}
metrics_gauges: Dict[str, Gauge] = {}
metrics_threads: Dict[str, threading.Thread] = {}
running = True

# Prometheus metrics
metrics_count = Counter('generator_metrics_total', 'Total number of metrics created')
metrics_active = Gauge('generator_metrics_active', 'Number of active metrics')

def load_config():
    """Load configuration from file"""
    try:
        with open('config.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"metrics": {}}

def save_config():
    """Save configuration to file"""
    config = {"metrics": metrics_config}
    with open('config.json', 'w') as f:
        json.dump(config, f, indent=2)

def generate_waveform_value(metric_config: Dict, timestamp: float) -> float:
    """Generate waveform value based on configuration"""
    base_value = metric_config.get('base_value', 0)
    amplitude = metric_config.get('amplitude', 10)
    period = metric_config.get('period', 60)  # seconds
    phase_offset = metric_config.get('phase_offset', 0)
    waveform_type = metric_config.get('waveform_type', 'sinusoidal')
    
    # Calculate phase
    frequency = 2 * math.pi / period
    phase = frequency * timestamp + phase_offset
    
    # Generate different waveform types
    if waveform_type == 'sinusoidal':
        waveform_component = amplitude * math.sin(phase)
    elif waveform_type == 'square':
        # Square wave: +amplitude for first half, -amplitude for second half
        waveform_component = amplitude if (phase % (2 * math.pi)) < math.pi else -amplitude
    elif waveform_type == 'triangle':
        # Triangle wave: linear ramp up and down
        normalized_phase = (phase % (2 * math.pi)) / (2 * math.pi)
        if normalized_phase < 0.5:
            waveform_component = amplitude * (2 * normalized_phase - 0.5)
        else:
            waveform_component = amplitude * (1.5 - 2 * normalized_phase)
    elif waveform_type == 'sawtooth':
        # Sawtooth wave: linear ramp up, then reset
        normalized_phase = (phase % (2 * math.pi)) / (2 * math.pi)
        waveform_component = amplitude * (2 * normalized_phase - 1)
    elif waveform_type == 'static':
        # Static value: no variation, just return base value
        waveform_component = 0
    else:
        # Default to sinusoidal
        waveform_component = amplitude * math.sin(phase)
    
    return base_value + waveform_component

def metric_generator_thread(metric_name: str, metric_config: Dict):
    """Thread that continuously generates metric values"""
    gauge = metrics_gauges[metric_name]
    
    while running and metric_name in metrics_config:
        try:
            current_time = time.time()
            value = generate_waveform_value(metric_config, current_time)
            
            # Update Prometheus gauge
            gauge.set(value)
            
            # Sleep for update interval
            update_interval = metric_config.get('update_interval', 1.0)
            time.sleep(update_interval)
            
        except Exception as e:
            print(f"Error generating metric {metric_name}: {e}")
            time.sleep(1)

def create_metric(metric_name: str, config: Dict):
    """Create a new metric"""
    # Ensure metric name has generator_ prefix
    if not metric_name.startswith('generator_'):
        metric_name = f'generator_{metric_name}'
    
    if metric_name in metrics_config:
        return False, "Metric already exists"
    
    # Create Prometheus gauge
    gauge = Gauge(metric_name, f'Metric: {metric_name}')
    metrics_gauges[metric_name] = gauge
    
    # Store configuration
    metrics_config[metric_name] = config
    
    # Start generation thread
    thread = threading.Thread(
        target=metric_generator_thread,
        args=(metric_name, config),
        daemon=True
    )
    thread.start()
    metrics_threads[metric_name] = thread
    
    # Update Prometheus counters
    metrics_count.inc()
    metrics_active.set(len(metrics_config))
    
    return True, "Metric created successfully"

def remove_metric(metric_name: str):
    """Remove a metric"""
    # Ensure metric name has generator_ prefix for lookup
    if not metric_name.startswith('generator_'):
        metric_name = f'generator_{metric_name}'
    
    if metric_name not in metrics_config:
        return False, "Metric does not exist"
    
    # Remove from configuration
    del metrics_config[metric_name]
    
    # Remove gauge (Prometheus will handle cleanup)
    if metric_name in metrics_gauges:
        del metrics_gauges[metric_name]
    
    # Thread will stop automatically when metric_name is removed from metrics_config
    
    # Update Prometheus counters
    metrics_active.set(len(metrics_config))
    
    return True, "Metric removed successfully"

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Main page"""
    return templates.TemplateResponse("index.html", {
        "request": request,
        "metrics": metrics_config
    })

@app.post("/add_metric")
async def add_metric(
    metric_name: str = Form(...),
    waveform_type: str = Form("sinusoidal"),
    base_value: float = Form(0),
    amplitude: float = Form(10),
    period: float = Form(60),
    phase_offset: float = Form(0),
    update_interval: float = Form(1.0)
):
    """Add a new metric"""
    config = {
        "waveform_type": waveform_type,
        "base_value": base_value,
        "amplitude": amplitude,
        "period": period,
        "phase_offset": phase_offset,
        "update_interval": update_interval
    }
    
    success, message = create_metric(metric_name, config)
    
    if success:
        save_config()
    
    return JSONResponse({
        "success": success,
        "message": message
    })

@app.post("/update_metric")
async def update_metric(
    metric_name: str = Form(...),
    waveform_type: str = Form(None),
    base_value: float = Form(None),
    amplitude: float = Form(None),
    period: float = Form(None),
    phase_offset: float = Form(None),
    update_interval: float = Form(None)
):
    """Update an existing metric"""
    # Ensure metric name has generator_ prefix for lookup
    if not metric_name.startswith('generator_'):
        metric_name = f'generator_{metric_name}'
    
    if metric_name not in metrics_config:
        return JSONResponse({
            "success": False,
            "message": "Metric does not exist"
        })
    
    # Update only provided fields
    update_data = {}
    if waveform_type is not None:
        update_data["waveform_type"] = waveform_type
    if base_value is not None:
        update_data["base_value"] = base_value
    if amplitude is not None:
        update_data["amplitude"] = amplitude
    if period is not None:
        update_data["period"] = period
    if phase_offset is not None:
        update_data["phase_offset"] = phase_offset
    if update_interval is not None:
        update_data["update_interval"] = update_interval
    
    # Update configuration
    metrics_config[metric_name].update(update_data)
    
    save_config()
    
    return JSONResponse({
        "success": True,
        "message": "Metric updated successfully"
    })

@app.post("/remove_metric")
async def remove_metric_endpoint(metric_name: str = Form(...)):
    """Remove a metric"""
    success, message = remove_metric(metric_name)
    
    if success:
        save_config()
    
    return JSONResponse({
        "success": success,
        "message": message
    })

@app.get("/config")
async def get_config():
    """Get current configuration"""
    return {"metrics": metrics_config}

@app.get("/metrics")
async def prometheus_metrics():
    """Prometheus metrics endpoint"""
    # This will be handled by prometheus_client
    pass

def main():
    """Main function"""
    global running
    
    # Load existing configuration
    config = load_config()
    metrics_config.update(config.get("metrics", {}))
    
    # Create existing metrics
    for metric_name, metric_config in metrics_config.items():
        # Skip if metric already has generator_ prefix (avoid double prefixing)
        if not metric_name.startswith('generator_'):
            # Remove from config and recreate with proper prefix
            del metrics_config[metric_name]
            create_metric(metric_name, metric_config)
        else:
            # Metric already has proper prefix, just create the gauge
            gauge = Gauge(metric_name, f'Metric: {metric_name}')
            metrics_gauges[metric_name] = gauge
            
            # Start generation thread
            thread = threading.Thread(
                target=metric_generator_thread,
                args=(metric_name, metric_config),
                daemon=True
            )
            thread.start()
            metrics_threads[metric_name] = thread
    
    # Start Prometheus metrics server
    prometheus_port = int(os.getenv('PROMETHEUS_PORT', 9100))
    start_http_server(prometheus_port)
    print(f"Prometheus metrics server started on port {prometheus_port}")
    
    # Start FastAPI server
    web_port = int(os.getenv('WEB_PORT', 8001))
    print(f"Starting web server on port {web_port}")
    
    try:
        uvicorn.run(app, host="0.0.0.0", port=web_port)
    except KeyboardInterrupt:
        print("Shutting down...")
        running = False

if __name__ == "__main__":
    main()
