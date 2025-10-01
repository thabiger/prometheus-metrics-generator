// Utility functions
function showMessage(message, type = 'success') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `status-message status-${type}`;
    messageDiv.textContent = message;
    
    // Insert at the top of the main content
    const mainContent = document.querySelector('.main-content');
    mainContent.insertBefore(messageDiv, mainContent.firstChild);
    
    // Remove message after 5 seconds
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showMessage('Copied to clipboard!', 'success');
    }).catch(() => {
        showMessage('Failed to copy to clipboard', 'error');
    });
}

// Global variable to track modal mode
let modalMode = 'create'; // 'create' or 'edit'
let currentMetricName = null;

// Handle waveform type changes
function handleWaveformTypeChange() {
    const waveformType = document.getElementById('waveform_type').value;
    
    // Get form groups for parameters that should be hidden for static
    const amplitudeGroup = document.getElementById('amplitude').closest('.form-group');
    const periodGroup = document.getElementById('period').closest('.form-group');
    const phaseOffsetGroup = document.getElementById('phase_offset').closest('.form-group');
    
    if (waveformType === 'static') {
        // Hide irrelevant parameters for static waveform
        amplitudeGroup.style.display = 'none';
        periodGroup.style.display = 'none';
        phaseOffsetGroup.style.display = 'none';
        
        // Set default values for hidden fields
        document.getElementById('amplitude').value = 0;
        document.getElementById('period').value = 60;
        document.getElementById('phase_offset').value = 0;
    } else {
        // Show all parameters for other waveforms
        amplitudeGroup.style.display = 'block';
        periodGroup.style.display = 'block';
        phaseOffsetGroup.style.display = 'block';
    }
    
    // Update preview
    updatePreview();
}

// Create metric function
function createMetric() {
    modalMode = 'create';
    currentMetricName = null;
    
    // Update modal title and button
    document.getElementById('modal-title').textContent = '➕ Create New Metric';
    document.getElementById('submit-button').textContent = 'Create Metric';
    
    // Show metric name field for creation
    document.getElementById('metric-name-group').style.display = 'block';
    
    // Reset form with default values
    document.getElementById('metric-form').reset();
    document.getElementById('waveform_type').value = 'sinusoidal';
    document.getElementById('base_value').value = 0;
    document.getElementById('amplitude').value = 20;
    document.getElementById('period').value = 60;
    document.getElementById('phase_offset').value = 0;
    document.getElementById('update_interval').value = 1;
    
    // Add event listeners for real-time updates
    document.getElementById('waveform_type').addEventListener('change', handleWaveformTypeChange);
    
    // Set initial waveform state
    handleWaveformTypeChange();
    
    // Show modal
    document.getElementById('metric-modal').style.display = 'block';
}

// Edit metric function
async function editMetric(metricName) {
    modalMode = 'edit';
    currentMetricName = metricName;
    
    // Update modal title and button
    document.getElementById('modal-title').textContent = '✏️ Edit Metric';
    document.getElementById('submit-button').textContent = 'Update Metric';
    
    // Hide metric name field for editing (read-only)
    document.getElementById('metric-name-group').style.display = 'none';
    
    try {
        // Fetch current configuration
        const response = await fetch('/config');
        const config = await response.json();
        
        const metricConfig = config.metrics[metricName];
        if (!metricConfig) {
            showMessage('Metric configuration not found', 'error');
            return;
        }
        
        // Populate form with current values
        const displayName = metricName.startsWith('generator_') ? 
            metricName.substring(10) : metricName; // Strip prefix for display
        document.getElementById('metric_name').value = displayName;
        document.getElementById('waveform_type').value = metricConfig.waveform_type || 'sinusoidal';
        document.getElementById('base_value').value = metricConfig.base_value;
        document.getElementById('amplitude').value = metricConfig.amplitude;
        document.getElementById('period').value = metricConfig.period;
        document.getElementById('phase_offset').value = metricConfig.phase_offset;
        document.getElementById('update_interval').value = metricConfig.update_interval;
        
        // Set waveform state based on current selection (with small delay to ensure DOM is updated)
        setTimeout(() => {
            handleWaveformTypeChange();
        }, 10);
        
        // Add event listener for waveform type changes (in case it wasn't added)
        const waveformSelect = document.getElementById('waveform_type');
        // Remove any existing listeners to avoid duplicates
        waveformSelect.removeEventListener('change', handleWaveformTypeChange);
        // Add the listener
        waveformSelect.addEventListener('change', handleWaveformTypeChange);
        
        // Show modal
        document.getElementById('metric-modal').style.display = 'block';
        
    } catch (error) {
        showMessage('Error loading metric configuration: ' + error.message, 'error');
    }
}

// Close metric modal
function closeMetricModal() {
    document.getElementById('metric-modal').style.display = 'none';
    modalMode = 'create';
    currentMetricName = null;
}

// Metric form handling (unified for create and edit)
document.getElementById('metric-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    // Convert numeric fields
    data.waveform_type = data.waveform_type;
    data.base_value = parseFloat(data.base_value);
    data.amplitude = parseFloat(data.amplitude);
    data.period = parseFloat(data.period);
    data.phase_offset = parseFloat(data.phase_offset);
    data.update_interval = parseFloat(data.update_interval);
    
    // Strip generator_ prefix from metric name for backend processing
    if (data.metric_name.startsWith('generator_')) {
        data.metric_name = data.metric_name.substring(10); // Remove 'generator_' prefix
    }
    
    try {
        let endpoint, successMessage;
        
        if (modalMode === 'create') {
            endpoint = '/add_metric';
            successMessage = 'Metric created successfully';
        } else {
            endpoint = '/update_metric';
            successMessage = 'Metric updated successfully';
        }
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showMessage(result.message, 'success');
            closeMetricModal();
            // Reload page to show changes
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            showMessage(result.message, 'error');
        }
    } catch (error) {
        const action = modalMode === 'create' ? 'creating' : 'updating';
        showMessage(`Error ${action} metric: ` + error.message, 'error');
    }
});

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('metric-modal');
    if (event.target === modal) {
        closeMetricModal();
    }
}

// Remove metric function
async function removeMetric(metricName) {
    if (!confirm(`Are you sure you want to remove the metric "${metricName}"?`)) {
        return;
    }
    
    try {
        // Strip generator_ prefix for backend processing
        const backendName = metricName.startsWith('generator_') ? 
            metricName.substring(10) : metricName;
        
        const response = await fetch('/remove_metric', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ metric_name: backendName })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showMessage(result.message, 'success');
            // Remove the metric card immediately
            const metricCard = document.querySelector(`[data-metric="${metricName}"]`);
            if (metricCard) {
                metricCard.style.animation = 'fadeOut 0.5s ease-out';
                setTimeout(() => {
                    metricCard.remove();
                }, 500);
            }
        } else {
            showMessage(result.message, 'error');
        }
    } catch (error) {
        showMessage('Error removing metric: ' + error.message, 'error');
    }
}

// Global storage for time scopes
const metricTimeScopes = {};

// Set time scope for a metric
function setTimeScope(metricName, timeWindow) {
    console.log(`Setting time scope for ${metricName} to ${timeWindow}s`);
    metricTimeScopes[metricName] = timeWindow;
    
    // Update button states
    const metricCard = document.querySelector(`[data-metric="${metricName}"]`);
    if (metricCard) {
        const buttons = metricCard.querySelectorAll('.btn-time-scope');
        buttons.forEach(btn => {
            btn.classList.remove('active');
            const btnTimeWindow = parseInt(btn.textContent.replace('m', '')) * 60;
            if (btnTimeWindow === timeWindow) {
                btn.classList.add('active');
            }
        });
        
        // Redraw preview with new time scope
        updateMetricPreview(metricName);
    }
}

// Draw sinusoidal preview on canvas
function drawSinusoidalPreview(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.log(`Canvas not found: ${canvasId}`);
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    console.log(`Drawing preview for ${canvasId}:`, config);
    console.log(`Canvas dimensions: ${width}x${height}`);
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Set up drawing parameters
    const baseValue = config.base_value || 0;
    const amplitude = config.amplitude || 20;
    const period = config.period || 60;
    const phaseOffset = config.phase_offset || 0;
    const waveformType = config.waveform_type || 'sinusoidal';
    
    // Get time window for this metric (default to 120s)
    const metricName = canvasId.replace('preview-', '');
    const timeWindow = metricTimeScopes[metricName] || 120;
    
    // Calculate range
    const minValue = baseValue - amplitude;
    const maxValue = baseValue + amplitude;
    const range = maxValue - minValue;
    
    // Draw grid lines
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    
    // Draw horizontal grid lines (value lines)
    const horizontalLines = 8; // Number of horizontal lines
    for (let i = 0; i <= horizontalLines; i++) {
        const y = (i / horizontalLines) * height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    
    // Draw vertical grid lines (time lines)
    const verticalLines = 12; // Number of vertical lines
    for (let i = 0; i <= verticalLines; i++) {
        const x = (i / verticalLines) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    
    // Draw main axes with slightly thicker lines
    ctx.strokeStyle = '#b0b0b0';
    ctx.lineWidth = 2;
    
    // Horizontal axis (time) - center line
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    
    // Vertical axis (value) - center line
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
    
    // Draw sinusoidal wave
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const points = 200; // More points for better waveform detail
    for (let i = 0; i <= points; i++) {
        const x = (i / points) * width;
        const time = (i / points) * timeWindow; // Use dynamic time window
        
        // Calculate waveform value based on type
        const frequency = 2 * Math.PI / period;
        const phase = frequency * time + phaseOffset;
        
        let waveformComponent;
        if (waveformType === 'sinusoidal') {
            waveformComponent = amplitude * Math.sin(phase);
        } else if (waveformType === 'square') {
            waveformComponent = amplitude * ((phase % (2 * Math.PI)) < Math.PI ? 1 : -1);
        } else if (waveformType === 'triangle') {
            const normalizedPhase = (phase % (2 * Math.PI)) / (2 * Math.PI);
            if (normalizedPhase < 0.5) {
                waveformComponent = amplitude * (2 * normalizedPhase - 0.5);
            } else {
                waveformComponent = amplitude * (1.5 - 2 * normalizedPhase);
            }
        } else if (waveformType === 'sawtooth') {
            const normalizedPhase = (phase % (2 * Math.PI)) / (2 * Math.PI);
            waveformComponent = amplitude * (2 * normalizedPhase - 1);
        } else if (waveformType === 'static') {
            waveformComponent = 0; // Static value, no variation
        } else {
            waveformComponent = amplitude * Math.sin(phase); // Default to sinusoidal
        }
        
        const value = baseValue + waveformComponent;
        
        // Convert value to y coordinate
        const y = height - ((value - minValue) / range) * height;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    
    ctx.stroke();
    
    // Draw value labels
    ctx.fillStyle = '#2c3e50';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(maxValue.toFixed(1), 5, 15);
    ctx.fillText(minValue.toFixed(1), 5, height - 5);
    
    // Base value line
    const baseY = height - ((baseValue - minValue) / range) * height;
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.lineTo(width, baseY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Base value label
    ctx.fillStyle = '#e74c3c';
    ctx.fillText(`Base: ${baseValue.toFixed(1)}`, width - 80, baseY - 5);
    
    // Draw time labels
    ctx.fillStyle = '#2c3e50';
    ctx.textAlign = 'center';
    ctx.font = '10px Arial';
    
    const timeLabels = 6; // Number of time labels to show
    
    for (let i = 0; i <= timeLabels; i++) {
        const x = (i / timeLabels) * width;
        const timeValue = (i / timeLabels) * timeWindow;
        const timeText = `${timeValue.toFixed(0)}s`;
        
        ctx.fillText(timeText, x, height - 20); // Move time labels up to avoid overlap
    }
}

// Initialize previews for existing metrics
document.addEventListener('DOMContentLoaded', function() {
    // Get metric configurations from the page
    const metricCards = document.querySelectorAll('.metric-card');
    
    metricCards.forEach(card => {
        const metricName = card.dataset.metric;
        const canvasId = `preview-${metricName}`;
        
        // Extract config from the new parameter structure
        const parameterItems = card.querySelectorAll('.parameter-item');
        const config = {};
        
        parameterItems.forEach(item => {
            const label = item.querySelector('.parameter-label');
            const value = item.querySelector('.parameter-value');
            
            if (label && value) {
                const labelText = label.textContent;
                if (labelText.includes('Waveform')) {
                    config.waveform_type = value.textContent;
                } else if (labelText.includes('Base Value')) {
                    config.base_value = parseFloat(value.textContent);
                } else if (labelText.includes('Amplitude')) {
                    config.amplitude = parseFloat(value.textContent);
                } else if (labelText.includes('Period')) {
                    config.period = parseFloat(value.textContent.replace('s', ''));
                } else if (labelText.includes('Phase Offset')) {
                    config.phase_offset = parseFloat(value.textContent);
                } else if (labelText.includes('Update Interval')) {
                    config.update_interval = parseFloat(value.textContent.replace('s', ''));
                }
            }
        });
        
        // Initialize default time scope for this metric
        if (!metricTimeScopes[metricName]) {
            metricTimeScopes[metricName] = 120; // Default to 2 minutes
        }
        
        // Set active button state
        const buttons = card.querySelectorAll('.btn-time-scope');
        buttons.forEach(btn => {
            btn.classList.remove('active');
            const btnTimeWindow = parseInt(btn.textContent.replace('m', '')) * 60;
            if (btnTimeWindow === metricTimeScopes[metricName]) {
                btn.classList.add('active');
            }
        });
        
        // Draw preview
        drawSinusoidalPreview(canvasId, config);
    });
});

// Add fadeOut animation
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from {
            opacity: 1;
            transform: translateY(0);
        }
        to {
            opacity: 0;
            transform: translateY(-20px);
        }
    }
`;
document.head.appendChild(style);

// Real-time metric value updates (optional)
function startRealTimeUpdates() {
    setInterval(async () => {
        try {
            const response = await fetch('/config');
            const config = await response.json();
            
            // Update metric cards with current values
            // This would require additional backend endpoint for current values
        } catch (error) {
            console.log('Error fetching config:', error);
        }
    }, 5000); // Update every 5 seconds
}

// Real-time metric value updates
function startRealTimeUpdates() {
    setInterval(async () => {
        try {
            const response = await fetch('/config');
            const config = await response.json();
            
            // Update metric cards with current values and redraw previews
            Object.keys(config.metrics).forEach(metricName => {
                const metricCard = document.querySelector(`[data-metric="${metricName}"]`);
                if (metricCard) {
                    const metricConfig = config.metrics[metricName];
                    
                    // Update parameter values
                    const parameterItems = metricCard.querySelectorAll('.parameter-item');
                    parameterItems.forEach(item => {
                        const label = item.querySelector('.parameter-label');
                        const value = item.querySelector('.parameter-value');
                        
                        if (label && value) {
                            const labelText = label.textContent;
                            if (labelText.includes('Waveform')) {
                                value.textContent = metricConfig.waveform_type || 'sinusoidal';
                            } else if (labelText.includes('Base Value')) {
                                value.textContent = metricConfig.base_value;
                            } else if (labelText.includes('Amplitude')) {
                                value.textContent = metricConfig.amplitude;
                            } else if (labelText.includes('Period')) {
                                value.textContent = `${metricConfig.period}s`;
                            } else if (labelText.includes('Phase Offset')) {
                                value.textContent = metricConfig.phase_offset;
                            } else if (labelText.includes('Update Interval')) {
                                value.textContent = `${metricConfig.update_interval}s`;
                            }
                        }
                    });
                    
                    // Update range display
                    const rangeMin = metricCard.querySelector('.range-min');
                    const rangeMax = metricCard.querySelector('.range-max');
                    const rangeText = metricCard.querySelector('.range-text');
                    
                    if (rangeMin && rangeMax && rangeText) {
                        const minValue = (metricConfig.base_value - metricConfig.amplitude).toFixed(1);
                        const maxValue = (metricConfig.base_value + metricConfig.amplitude).toFixed(1);
                        
                        rangeMin.textContent = minValue;
                        rangeMax.textContent = maxValue;
                        rangeText.innerHTML = `<strong>Min:</strong> ${minValue} | <strong>Max:</strong> ${maxValue}`;
                    }
                    
                    // Redraw preview
                    const canvasId = `preview-${metricName}`;
                    drawSinusoidalPreview(canvasId, metricConfig);
                }
            });
            
        } catch (error) {
            console.log('Error fetching config:', error);
        }
    }, 5000); // Update every 5 seconds
}

// Start real-time updates

// Value adjustment functions
function adjustValue(inputId, delta) {
    const input = document.getElementById(inputId);
    const currentValue = parseFloat(input.value) || 0;
    const step = parseFloat(input.step) || 0.1;
    const min = parseFloat(input.min) || -Infinity;
    const max = parseFloat(input.max) || Infinity;
    
    // Calculate new value
    let newValue = currentValue + delta;
    
    // Apply step rounding
    newValue = Math.round(newValue / step) * step;
    
    // Clamp to min/max
    newValue = Math.max(min, Math.min(max, newValue));
    
    // Update input value
    input.value = newValue;
    
    // Trigger preview update
    updatePreview();
}

// Real-time preview update function
function updatePreview() {
    // Get current form values
    const config = {
        waveform_type: document.getElementById('waveform_type').value,
        base_value: parseFloat(document.getElementById('base_value').value) || 50,
        amplitude: parseFloat(document.getElementById('amplitude').value) || 20,
        period: parseFloat(document.getElementById('period').value) || 60,
        phase_offset: parseFloat(document.getElementById('phase_offset').value) || 0,
        update_interval: parseFloat(document.getElementById('update_interval').value) || 1
    };
    
    // Find the preview canvas in the modal
    const modal = document.getElementById('metric-modal');
    const canvas = modal.querySelector('canvas');
    
    if (canvas) {
        const canvasId = canvas.id;
        drawSinusoidalPreview(canvasId, config);
    }
}

// Adjust metric value in main view
async function adjustMetricValue(metricName, parameter, delta) {
    console.log(`adjustMetricValue called: ${metricName}, ${parameter}, ${delta}`);
    try {
        // Get current configuration from the page
        const metricCard = document.querySelector(`[data-metric="${metricName}"]`);
        if (!metricCard) {
            console.error(`Metric card not found: ${metricName}`);
            return;
        }
        
        // Find the current value
        const parameterItem = metricCard.querySelector(`[onclick*="${parameter}"]`).closest('.parameter-item');
        const valueSpan = parameterItem.querySelector('.parameter-value');
        const currentValue = parseFloat(valueSpan.textContent.replace('s', ''));
        
        // Calculate new value
        let newValue = currentValue + delta;
        
        // Apply constraints based on parameter
        if (parameter === 'amplitude') {
            newValue = Math.max(0, newValue);
        } else if (parameter === 'period') {
            newValue = Math.max(1, newValue);
        } else if (parameter === 'update_interval') {
            newValue = Math.max(0.1, newValue);
        }
        
        // Round to appropriate precision
        if (parameter === 'phase_offset' || parameter === 'update_interval') {
            newValue = Math.round(newValue * 10) / 10;
        } else if (parameter === 'base_value' || parameter === 'amplitude') {
            newValue = Math.round(newValue * 10) / 10;
        } else {
            newValue = Math.round(newValue);
        }
        
        // Update the display
        const displayValue = parameter === 'period' || parameter === 'update_interval' ? 
            `${newValue}s` : newValue.toString();
        valueSpan.textContent = displayValue;
        
        // Update the backend
        await updateMetricParameter(metricName, parameter, newValue);
        
        // Update the preview
        console.log(`About to call updateMetricPreview for ${metricName}`);
        updateMetricPreview(metricName);
        console.log(`updateMetricPreview called for ${metricName}`);
        
    } catch (error) {
        console.error('Error adjusting metric value:', error);
        showMessage('Error updating metric parameter', 'error');
    }
}

// Update metric parameter on backend
async function updateMetricParameter(metricName, parameter, value) {
    // Strip generator_ prefix for backend
    const backendName = metricName.startsWith('generator_') ? 
        metricName.substring(10) : metricName;
    
    const response = await fetch('/update_metric', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            metric_name: backendName,
            [parameter]: value
        })
    });
    
    const result = await response.json();
    if (!result.success) {
        throw new Error(result.message);
    }
}

// Update metric preview in main view
function updateMetricPreview(metricName) {
    console.log(`Updating preview for metric: ${metricName}`);
    
    const metricCard = document.querySelector(`[data-metric="${metricName}"]`);
    if (!metricCard) {
        console.error(`Metric card not found: ${metricName}`);
        return;
    }
    
    // Extract current configuration from the card
    const config = {};
    const parameterItems = metricCard.querySelectorAll('.parameter-item');
    
    parameterItems.forEach(item => {
        const label = item.querySelector('.parameter-label');
        const value = item.querySelector('.parameter-value');
        
        if (label && value) {
            const labelText = label.textContent;
            if (labelText.includes('Waveform')) {
                config.waveform_type = value.textContent;
            } else if (labelText.includes('Base Value')) {
                config.base_value = parseFloat(value.textContent);
            } else if (labelText.includes('Amplitude')) {
                config.amplitude = parseFloat(value.textContent);
            } else if (labelText.includes('Period')) {
                config.period = parseFloat(value.textContent.replace('s', ''));
            } else if (labelText.includes('Phase Offset')) {
                config.phase_offset = parseFloat(value.textContent);
            } else if (labelText.includes('Update Interval')) {
                config.update_interval = parseFloat(value.textContent.replace('s', ''));
            }
        }
    });
    
    console.log(`Extracted config:`, config);
    
    // Draw updated preview
    const canvasId = `preview-${metricName}`;
    console.log(`Looking for canvas with ID: ${canvasId}`);
    
    // Check if canvas exists
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas not found: ${canvasId}`);
        // Let's also check what canvas elements actually exist
        const allCanvases = document.querySelectorAll('canvas');
        console.log('Available canvas elements:', Array.from(allCanvases).map(c => c.id));
        return;
    }
    
    drawSinusoidalPreview(canvasId, config);
}
