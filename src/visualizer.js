/**
 * Visualization Engine
 * Single-chart Plotly.js waveform with overlaid peak markers and burst regions
 */

import Plotly from 'plotly.js-dist-min';
import * as signal from './signal-processing.js';

export class ROFVisualizer {
  constructor(plotElement) {
    this.plotDiv = plotElement;
  }

  /**
   * Render single waveform chart with peak dots and burst region shapes
   */
  render(detector, results) {
    const sampleRate = detector.sampleRate;
    const audioDuration = results.audioDuration;

    // Downsample waveform for performance
    const maxPoints = 8000;
    const timeArray = this.createTimeArray(detector.audioData.length, sampleRate);
    const waveform = this.downsample(detector.audioData, timeArray, maxPoints);

    const traces = [];

    // ── Trace 1: Raw Waveform ──────────────────────────────────
    traces.push({
      x: waveform.time,
      y: waveform.data,
      type: 'scatter',
      mode: 'lines',
      name: 'Waveform',
      line: { color: '#4682B4', width: 1 },
      hovertemplate: 'Time: %{x:.3f}s<br>Amplitude: %{y:.3f}<extra></extra>',
      // Step 8.2: Custom Hover Styling
      hoverlabel: {
        bgcolor: '#1a1a1a', // Dark BG
        bordercolor: '#4B90FF', // Blue Border
        font: {
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          size: 13,
          color: '#FFFFFF' // White Text for Waveform
        }
      }
    });

    // ── Trace 2: Peak Dots on Waveform ─────────────────────────
    if (results.peaks && results.peaks.length > 0) {
      const peakTimes = results.peaks.map((idx) => idx / sampleRate);
      const peakAmplitudes = results.peaks.map((idx) => detector.audioData[idx]);

      traces.push({
        x: peakTimes,
        y: peakAmplitudes,
        type: 'scatter',
        mode: 'markers',
        name: 'Detected Shots',
        marker: {
          color: '#f95335ff', // F3DS Blue (Step 8.3)
          size: 8,
          symbol: 'circle',
          line: { color: '#ffffff', width: 1 }, // White border for contrast
        },
        hovertemplate: 'Shot at %{x:.3f}s<br>Amplitude: %{y:.3f}<extra></extra>',
        // Step 8.2: Custom Hover Styling for Peaks
        hoverlabel: {
          bgcolor: '#1a1a1a',
          bordercolor: '#4B90FF',
          font: {
            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            size: 13,
            color: '#4B90FF' // Blue Text for Shots
          }
        }
      });
    }

    // ── Burst Regions via Plotly Shapes ─────────────────────────
    const shapes = [];
    if (detector.bursts && detector.bursts.length > 0) {
      const colors = this.generateColors(detector.bursts.length);

      detector.bursts.forEach((burst, i) => {
        const burstData = results.bursts[i];
        shapes.push({
          type: 'rect',
          xref: 'x',
          yref: 'paper',
          x0: burstData.startTime,
          x1: burstData.endTime,
          y0: 0,
          y1: 1,
          fillcolor: colors[i] + '25',
          line: { color: colors[i], width: 1, dash: 'dot' },
          layer: 'below',
        });
      });
    }

    // ── Layout ─────────────────────────────────────────────────
    const audioMin = signal.min(detector.audioData);
    const audioMax = signal.max(detector.audioData);

    const layout = {
      showlegend: true,
      legend: {
        orientation: 'h',
        yanchor: 'bottom',
        y: -0.3,
        xanchor: 'center',
        x: 0.5,
        font: { color: '#ffffff' }
      },
      hovermode: 'closest',
      shapes,
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      xaxis: {
        title: { text: 'Time (s)', font: { color: '#ffffff' } },
        showgrid: true,
        gridcolor: 'rgba(75, 144, 255, 0.1)',
        zeroline: false,
        tickfont: { color: 'rgba(255, 255, 255, 0.8)' }
      },
      yaxis: {
        title: { text: 'Amplitude', font: { color: '#ffffff' } },
        showgrid: true,
        gridcolor: 'rgba(75, 144, 255, 0.1)',
        zeroline: true,
        zerolinecolor: 'rgba(75, 144, 255, 0.2)',
        fixedrange: true,
        range: [audioMin * 1.1, audioMax * 1.1],
        tickfont: { color: 'rgba(255, 255, 255, 0.8)' }
      },
      autosize: true,
      height: 256, // Reduced by 20% from 320 (Step 8.3)
      margin: { l: 55, r: 20, t: 20, b: 80 },
    };

    const config = {
      responsive: true,
      displayModeBar: false, // Hide toolbar
      // modeBarButtonsToRemove: ['lasso2d', 'select2d'], // Not needed if modeBar is hidden
      displaylogo: false,
      toImageButtonOptions: {
        format: 'png',
        filename: 'rof_analysis',
        height: 1200,
        width: 1600,
        scale: 2,
      },
      scrollZoom: false, // Prevent scroll hijacking
    };

    // Return promise so we can chain if needed
    return Plotly.newPlot(this.plotDiv, traces, layout, config);
  }

  /**
   * Setup interaction handlers (e.g. clicking to add/remove peaks)
   * @param {Function} onTimeClick - Callback(timeInSeconds)
   */
  setupInteractions(onTimeClick) {
    if (!this.plotDiv || typeof this.plotDiv.on !== 'function') return;

    // Use Plotly's event system
    this.plotDiv.on('plotly_click', (data) => {
      // If no points clicked, we might still want the x-coordinate of the click
      // But Plotly usually returns points if we click on the graph area
      if (!data || !data.points || data.points.length === 0) return;

      // Get the x-value (time) of the click
      // We prioritize the click on the waveform or existing peaks
      const point = data.points[0];
      const time = point.x;

      if (typeof time === 'number' && onTimeClick) {
        onTimeClick(time);
      }
    });
  }

  /**
   * Create a time array for data
   */
  createTimeArray(length, sampleRate) {
    const times = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      times[i] = i / sampleRate;
    }
    return times;
  }

  /**
   * Downsample data for performance
   */
  downsample(data, timeArray, maxPoints) {
    if (data.length <= maxPoints) {
      return { data: Array.from(data), time: Array.from(timeArray) };
    }

    const step = Math.floor(data.length / maxPoints);
    const downsampled = [];
    const downsampledTime = [];

    for (let i = 0; i < data.length; i += step) {
      downsampled.push(data[i]);
      downsampledTime.push(timeArray[i]);
    }

    return { data: downsampled, time: downsampledTime };
  }

  /**
   * Generate distinct colors for bursts
   */
  generateColors(count) {
    const baseColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
      '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52C77C',
    ];

    const colors = [];
    for (let i = 0; i < count; i++) {
      colors.push(baseColors[i % baseColors.length]);
    }

    return colors;
  }

  /**
   * Export plot as PNG
   */
  async exportPNG() {
    const imgData = await Plotly.toImage(this.plotDiv, {
      format: 'png',
      width: 1600,
      height: 1200,
      scale: 2,
    });

    const response = await fetch(imgData);
    return await response.blob();
  }

  /**
   * Get plot image as Data URL (for PDF export)
   */
  async getDataURL() {
    return await Plotly.toImage(this.plotDiv, {
      format: 'png',
      width: 1600,
      height: 1200,
      scale: 2,
    });
  }

  /**
   * Reset/Purge chart
   */
  reset() {
    Plotly.purge(this.plotDiv);
  }

  /**
   * Resize plot (call when container size changes)
   */
  resize() {
    Plotly.Plots.resize(this.plotDiv);
  }
}
