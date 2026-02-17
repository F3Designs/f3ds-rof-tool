/**
 * F3DS ROF Tool — Entry Point
 * WordPress-aware initialization for the Rate-of-Fire audio analyzer
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { RateOfFireDetector } from './rof-detector.js';
import { ROFVisualizer } from './visualizer.js';
import Plotly from 'plotly.js-dist-min';
import devCoreURL from '@ffmpeg/core?url';
import devWasmURL from '@ffmpeg/core/wasm?url';

// ── DOM References ─────────────────────────────────────────────
const app = document.getElementById('f3ds-rof-app');
if (!app) throw new Error('[F3DS ROF] #f3ds-rof-app not found');

const dropZone = document.getElementById('f3ds-rof-dropzone');
const fileInput = document.getElementById('f3ds-rof-file-input');
const loading = document.getElementById('f3ds-rof-loading');
const loadingText = document.getElementById('f3ds-rof-loading-text');
const errorDiv = document.getElementById('f3ds-rof-error');
const rofControlsHeader = document.getElementById('f3ds-rof-controls-header');
const rofControlsToggle = document.getElementById('f3ds-rof-controls-toggle');
const rofControlsContent = document.getElementById('f3ds-rof-controls-content');
const rofResults = document.getElementById('f3ds-rof-results');
const rofSummary = document.getElementById('f3ds-rof-summary');
const rofBursts = document.getElementById('f3ds-rof-bursts');
const rofPlot = document.getElementById('f3ds-rof-chart');
const buildDetailsInput = document.getElementById('f3ds-rof-build-details');

const peakThresholdInput = document.getElementById('f3ds-rof-peak-threshold');
const minShotSpacingInput = document.getElementById('f3ds-rof-min-shot-spacing');
const burstGapThresholdInput = document.getElementById('f3ds-rof-burst-gap');
const windowSizeInput = document.getElementById('f3ds-rof-window-size');
const minPeakProminenceInput = document.getElementById('f3ds-rof-min-prominence');
const minBurstCountInput = document.getElementById('f3ds-rof-min-burst-count');

const exportPngBtn = document.getElementById('f3ds-rof-export-jpg');
const exportPdfBtn = document.getElementById('f3ds-rof-export-pdf');

// ── State ──────────────────────────────────────────────────────
let ffmpeg = null;
let detector = null;
let ffmpegLoadPromise = null;
let currentResults = null;
let visualizer = null;
let currentFile = null;
let reanalysisTimeout = null;

// Helpers
const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52C77C',
];
function getBurstColor(index) {
  return COLORS[index % COLORS.length];
}

function getFFmpegURLs() {
  const config = window.F3DS_ROF_CONFIG || {};
  if (config.pluginUrl) {
    const base = config.pluginUrl.replace(/\/$/, '');
    return {
      coreURL: base + '/assets/wasm/ffmpeg-core.js',
      wasmURL: base + '/assets/wasm/ffmpeg-core.wasm',
      workerURL: base + '/assets/js/worker.js',
    };
  }
  return { coreURL: devCoreURL, wasmURL: devWasmURL };
}

// ── Initialization ─────────────────────────────────────────────
async function loadFFmpeg() {
  if (ffmpeg?.loaded) return;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    try {
      ffmpeg = new FFmpeg();
      const urls = getFFmpegURLs();
      await ffmpeg.load({
        coreURL: await toBlobURL(urls.coreURL, 'text/javascript'),
        wasmURL: await toBlobURL(urls.wasmURL, 'application/wasm'),
        classWorkerURL: urls.workerURL ? await toBlobURL(urls.workerURL, 'text/javascript') : undefined,
      });
    } catch (err) {
      ffmpegLoadPromise = null;
      throw err;
    }
  })();
  return ffmpegLoadPromise;
}

loadFFmpeg().catch((err) => console.error('[F3DS ROF] FFmpeg preload failed:', err));

async function handleFile(file) {
  if (!file) return;
  cleanup();
  currentFile = file;

  try {
    if (!ffmpeg?.loaded) {
      loadingText.textContent = 'Loading FFmpeg…';
      loading.classList.add('active');
    }
    await loadFFmpeg();

    loadingText.textContent = 'Analyzing file…';
    loading.classList.add('active');
    rofResults.classList.remove('active');
    errorDiv.classList.remove('active');

    await analyzeRateOfFire(file);
    loading.classList.remove('active');
    rofResults.classList.add('active');
  } catch (err) {
    if (currentFile === file) {
      showError('Error analyzing file: ' + err.message);
      loading.classList.remove('active');
    }
  }
}

function cleanup() {
  if (detector) { try { detector.dispose(); } catch (e) { } detector = null; }
  if (visualizer) { try { visualizer.reset(); } catch (e) { } visualizer = null; }
  currentResults = null;
  rofResults.classList.remove('active');
  errorDiv.classList.remove('active');
  loading.classList.remove('active');
}

async function analyzeRateOfFire(file) {
  const params = {
    peakThresholdStd: parseFloat(peakThresholdInput.value),
    minShotSpacing: parseFloat(minShotSpacingInput.value),
    burstGapThreshold: parseFloat(burstGapThresholdInput.value),
    windowSize: parseFloat(windowSizeInput.value),
    minPeakProminence: parseFloat(minPeakProminenceInput.value),
    minBurstCount: parseInt(minBurstCountInput.value),
  };

  detector = new RateOfFireDetector(params);
  const onProgress = (msg) => { loadingText.textContent = msg; };
  currentResults = await detector.analyze(file, ffmpeg, onProgress);

  displayROFResults(detector, currentResults);

  if (!visualizer) {
    visualizer = new ROFVisualizer(rofPlot);
    visualizer.setupInteractions(onPeakToggle);
  }
  await visualizer.render(detector, currentResults);
  setTimeout(() => visualizer.resize(), 0);
}

async function onPeakToggle(clickedTime) {
  if (!detector || !currentResults) return;
  const tolerance = 0.01;
  const existingPeakIndex = detector.shotTimes.findIndex(t => Math.abs(t - clickedTime) < tolerance);

  if (existingPeakIndex !== -1) detector.shotTimes.splice(existingPeakIndex, 1);
  else detector.shotTimes.push(clickedTime);

  detector.shotTimes.sort((a, b) => a - b);
  const newPeaks = detector.shotTimes.map(t => Math.round(t * detector.sampleRate));

  detector.groupIntoBursts();
  const burstResults = detector.calculateRates();
  const summary = detector.generateSummary(burstResults);

  currentResults = { ...currentResults, summary, bursts: burstResults, peaks: newPeaks };
  displayROFResults(detector, currentResults);
  await visualizer.render(detector, currentResults);
}

// ── Display Logic (Step 8.1 Updates) ───────────────────────────
function displayROFResults(detector, results) {
  const summary = results.summary;
  const items = [];

  if (summary.totalBursts > 0) {
    items.push({
      label: 'Total Shots',
      value: summary.totalShots,
      tooltip: null
    });
    items.push({
      label: 'Total Bursts',
      value: summary.totalBursts,
      tooltip: null
    });
    items.push({
      label: 'Avg RPM',
      value: summary.meanBurstRateRpm.toFixed(1),
      tooltip: 'The average number of rounds fired per minute calculated across all detected burst.'
    });
    items.push({
      label: 'STD Deviation',
      value: (summary.avgStdInterval * 1000).toFixed(2) + ' ms',
      tooltip: 'A measure of the timing consistency between shots; lower numbers indicate a more consistent cycle.'
    });
    items.push({
      label: 'Mean Deviation',
      value: (summary.avgMeanDeviation * 1000).toFixed(2) + ' ms',
      tooltip: 'The average difference between each inter-shot interval and the mean interval'
    });
    let rangeStr = summary.minBurstRateRpm.toFixed(0);
    if (summary.minBurstRateRpm !== summary.maxBurstRateRpm) {
      rangeStr += ' - ' + summary.maxBurstRateRpm.toFixed(0);
    }
    items.push({
      label: 'Rate Range',
      value: rangeStr,
      tooltip: null
    });
  }

  const buildNotes = document.getElementById('f3ds-rof-build-details').value.trim();
  let summaryHTML = `
    <h2>Summary</h2>
    <div id="f3ds-rof-live-notes-container" class="f3ds-rof-summary-notes" style="display: ${buildNotes ? 'block' : 'none'};">
        <strong>Build Notes:</strong> <span id="f3ds-rof-live-notes-content">${buildNotes}</span>
    </div>
    <div class="f3ds-rof-summary-divider"></div>
    <div class="f3ds-signature-summary-container">
  `;

  items.forEach(item => {
    let tooltipHTML = '';
    if (item.tooltip) {
      tooltipHTML = `<span class="f3ds-tooltip-icon">?<span class="f3ds-tooltip-content">${item.tooltip}</span></span>`;
    }

    summaryHTML += `
        <div class="f3ds-signature-item">
            <div class="f3ds-signature-label">
                ${item.label}
                ${tooltipHTML}
            </div>
            <div class="f3ds-signature-value">${item.value}</div>
        </div>
    `;
  });

  // Fill empty slots if < 6
  for (let i = items.length; i < 6; i++) {
    summaryHTML += `<div class="f3ds-signature-item">&nbsp;</div>`;
  }

  summaryHTML += `</div>`; // Close container
  rofSummary.innerHTML = summaryHTML;


  // Strings of Fire
  if (results.bursts && results.bursts.length > 0) {
    let burstsHTML = '<h3 style="text-align: center;">Shot Cadence</h3>';
    results.bursts.forEach((burst, index) => {
      // Dynamic Border Color
      const borderColor = getBurstColor(index);

      // Task 8.2: Filtered Variables & Exact Labels
      burstsHTML += `
        <div class="f3ds-rof-burst-card" style="border-left-color: ${borderColor};">
          <div class="f3ds-rof-burst-content">
            <h4 class="f3ds-rof-burst-label">Burst ${burst.burstNumber}:</h4>
            <div class="f3ds-rof-burst-details">
              <p><strong>Shots</strong> <span>${burst.numShots}</span></p>
              <p><strong>RPM</strong> <span>${burst.rateRpm.toFixed(1)}</span></p>
              <p><strong>Duration</strong> <span>${burst.duration.toFixed(3)}s</span></p>
              <p><strong>STD DEV</strong> <span>${(burst.stdInterval * 1000).toFixed(2)}ms</span></p>
              <p><strong>MEAN DEV</strong> <span>${(burst.meanDeviation * 1000).toFixed(2)}ms</span></p>
            </div>
          </div>
        </div>
      `;
    });
    rofBursts.innerHTML = burstsHTML;
  } else {
    rofBursts.innerHTML = '<p class="f3ds-rof-no-bursts">No bursts detected. Try adjusting parameters.</p>';
  }
}

// ── Re-analysis & Error ────────────────────────────────────────
function scheduleReanalysis() {
  if (!currentFile) return;
  if (reanalysisTimeout) clearTimeout(reanalysisTimeout);
  reanalysisTimeout = setTimeout(async () => {
    try {
      loadingText.textContent = 'Re-analyzing…';
      loading.classList.add('active');
      errorDiv.classList.remove('active');
      await analyzeRateOfFire(currentFile);
      loading.classList.remove('active');
    } catch (err) {
      showError('Error re-analyzing: ' + err.message);
      loading.classList.remove('active');
    }
  }, 500);
}

function showError(msg) {
  errorDiv.textContent = msg;
  errorDiv.classList.add('active');
}

/**
 * Export the report as a PNG image
 */
async function exportROFToPNG() {
  const resultsArea = document.getElementById('f3ds-rof-results');
  if (!resultsArea) return;
  // 1. Create a clone to modify for the image
  const clone = resultsArea.cloneNode(true);
  clone.style.width = "1200px";
  clone.style.padding = "40px";
  clone.style.background = "var(--f3ds-app-bg, #0b0e14)";
  clone.style.position = "absolute";
  clone.style.left = "-9999px";
  clone.style.border = "none"; // Task: No blue border
  document.body.appendChild(clone);
  // 2. Adjust clone elements (remove tooltips, hide export buttons)
  clone.querySelectorAll('.f3ds-tooltip-icon, .f3ds-rof-download-buttons').forEach(el => el.remove());

  const footer = document.createElement('div');
  footer.style.cssText = `
        display: flex; 
        justify-content: space-between; 
        align-items: center; 
        margin-top: 20px; 
        padding-top: 15px;
        border-top: 1px solid rgba(255,255,255,0.1);
        color: #fff;
    `;
  footer.innerHTML = `
        <span style="font-size: 1.2rem; font-weight: 700; color: #4B90FF;">F3DS RATE OF FIRE ANALYZER</span>
        <span style="font-size: 1rem; color: #4B90FF; font-weight: 600;">WWW.F3DS.COM</span>
    `;
  clone.appendChild(footer);

  try {
    const canvas = await html2canvas(clone, {
      useCORS: true,
      backgroundColor: null,
      scale: 2
    });
    const link = document.createElement('a');
    link.download = `${getROFFileName()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    console.error("Export failed:", err);
  } finally {
    document.body.removeChild(clone);
  }
}
/**
 * Export a printable PDF with ink-saver colors and custom header
 */
async function exportROFToPDF() {
  const resultsArea = document.getElementById('f3ds-rof-results');
  if (!resultsArea) return;

  const clone = resultsArea.cloneNode(true);
  clone.style.width = "1000px";
  clone.style.padding = "40px";
  clone.style.background = "#ffffff";
  clone.style.color = "#000000";
  clone.style.position = "absolute";
  clone.style.left = "-9999px";
  document.body.appendChild(clone);

  clone.querySelectorAll('.f3ds-tooltip-icon, .f3ds-rof-download-buttons').forEach(el => el.remove());

  clone.querySelectorAll('*').forEach(el => {
    el.style.setProperty('color', '#000000', 'important');
    el.style.setProperty('opacity', '1', 'important');
    el.style.setProperty('background-color', 'transparent', 'important');
  });

  clone.querySelectorAll('.f3ds-rof-summary, .f3ds-rof-visualization, .f3ds-rof-bursts').forEach(el => {
    el.style.cssText = `
        background: #ffffff; 
        border: 1px solid #000000; 
        border-radius: 12px; 
        padding: 25px; 
        margin-bottom: 20px;
        display: block;
        height: auto;       
        min-height: 0;      
    `;
  });

  clone.querySelectorAll('.f3ds-signature-item').forEach((item, idx, arr) => {
    item.style.padding = "10px";

    item.querySelectorAll('*').forEach(child => {
      child.style.setProperty('color', '#000000', 'important');
      child.style.setProperty('opacity', '1', 'important');
    });

    if (idx < arr.length - 1) {
      item.style.borderRight = "0.5pt solid #000000";
    }
  });

  // 5.1. Transform Burst Cards into clean Table Rows (Ink-Saver style)
  const burstContainer = clone.querySelector('#f3ds-rof-bursts');
  if (burstContainer) {
    const burstHeader = burstContainer.querySelector('h3');
    if (burstHeader) {
      burstHeader.style.cssText = "text-align: center; color: #000000; font-size: 16pt; margin-bottom: 20px; font-weight: 800; text-transform: uppercase;";
      burstHeader.textContent = "STRINGS OF FIRE";
    }

    clone.querySelectorAll('.f3ds-rof-burst-card').forEach((card) => {
      card.style.cssText = "background: transparent; border: none; border-bottom: 0.5pt solid #eeeeee; padding: 12px 0; margin: 0; display: block; border-radius: 0;";

      const content = card.querySelector('.f3ds-rof-burst-content');
      if (content) {
        content.style.display = "flex";
        content.style.justifyContent = "space-between";
        content.style.alignItems = "center";
        content.querySelectorAll('p').forEach((p) => {
          p.style.flex = "1";
          p.style.textAlign = "center";
          p.style.margin = "0";
        });
        // Keep the first column (Burst #) left-aligned for structure
        const firstCol = content.querySelector('p:first-child');
        if (firstCol) firstCol.style.textAlign = "left";
      }
    });

    // Cleanup labels for the PDF
    clone.querySelectorAll('.f3ds-rof-no-bursts').forEach(el => el.style.color = "#999");
  }

  // 4. Create the Printer-Friendly Header (Flexbox for Left/Right layout)
  const buildNotesText = document.getElementById('f3ds-rof-build-details').value.trim();
  const pdfHeader = document.createElement('div');
  pdfHeader.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 0 0 15px 0;
    margin-bottom: 25px;
    border-bottom: 2pt solid #000000;
  `;

  pdfHeader.innerHTML = `
    <div style="text-align: left;">
      <div style="font-size: 18pt; font-weight: 800; color: #1a1a1a;">F3DS RATE OF FIRE ANALYZER</div>
      <div style="font-size: 10pt; color: #4B90FF;">www.F3DS.com</div>
    </div>
    <div style="text-align: right; max-width: 450px;">
      <strong style="text-transform: uppercase; font-size: 0.8rem; color: #666;">Build Notes:</strong>
      <div style="font-size: 0.95rem; color: #333; margin-top: 4px;">${buildNotesText || 'N/A'}</div>
    </div>
  `;

  const oldH2 = clone.querySelector('h2');
  if (oldH2) {
    oldH2.style.cssText = "text-align: center; color: #000000; font-size: 16pt; margin: 0 0 20px 0; font-weight: 800; text-transform: uppercase;";
    oldH2.textContent = "ANALYSIS SUMMARY";
    const oldNotes = clone.querySelector('.f3ds-rof-summary-notes');
    if (oldNotes) oldNotes.remove();
  }

  // Inject the new header at the very top
  clone.prepend(pdfHeader);

  // 4b. Handle Chart for Printing (Blue Waveform & Proportional Height)
  const realChart = document.getElementById('f3ds-rof-chart');
  const cloneChartContainer = clone.querySelector('#f3ds-rof-chart');

  if (realChart && realChart.data) {
    const bgDiv = document.createElement('div');
    // Reduced height to 350px to match website feel
    bgDiv.style.cssText = "position:absolute; left:-9999px; width:1200px; height:350px;";
    document.body.appendChild(bgDiv);

    const lightData = realChart.data.map(trace => {
      const t = { ...trace };
      if (t.name === 'Waveform') {
        t.line = { color: '#4682B4', width: 1.5 }; // RESTORED BLUE
      } else if (t.name === 'Detected Shots') {
        t.marker = { color: '#ff0000', size: 6, symbol: 'circle' };
      }
      return t;
    });

    const lightAnnotations = [];
    const lightShapes = (realChart.layout.shapes || []).map((shape, i) => {
      lightAnnotations.push({
        x: shape.x0, y: 1, yref: 'paper', text: `B${i + 1}`,
        showarrow: false, font: { size: 10, color: '#000000', weight: 'bold' },
        xanchor: 'left', yanchor: 'bottom'
      });
      return {
        ...shape,
        fillcolor: 'rgba(0,0,0,0.05)',
        line: { color: '#000000', width: 1, dash: 'dash' }
      };
    });

    const lightLayout = {
      ...realChart.layout,
      height: 350,
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#ffffff',
      font: { color: '#000000', family: 'Arial, sans-serif' },
      shapes: lightShapes,
      annotations: lightAnnotations,
      margin: { l: 70, r: 30, t: 30, b: 70 }, // Increased margins to fit titles

      xaxis: {
        ...realChart.layout.xaxis,
        gridcolor: '#eeeeee',
        linecolor: '#000000',
        tickfont: { color: '#000000', size: 10 },
        title: { text: 'Time (s)', font: { color: '#000000', size: 12, weight: 'bold' } }
      },
      yaxis: {
        ...realChart.layout.yaxis,
        gridcolor: '#eeeeee',
        linecolor: '#000000',
        tickfont: { color: '#000000', size: 10 },
        title: { text: 'Amplitude', font: { color: '#000000', size: 12, weight: 'bold' } }
      },
      legend: {
        ...realChart.layout.legend,
        font: { color: '#000000', size: 10 },
        bgcolor: 'rgba(255,255,255,0)'
      }
    };

    await Plotly.newPlot(bgDiv, lightData, lightLayout, { displayModeBar: false });
    const lightChartData = await Plotly.toImage(bgDiv, { format: 'png', width: 1200, height: 350 });

    Plotly.purge(bgDiv);
    document.body.removeChild(bgDiv);

    if (cloneChartContainer) {
      cloneChartContainer.style.minHeight = "0";
      cloneChartContainer.style.height = "auto";
      cloneChartContainer.style.padding = "0";
      cloneChartContainer.style.margin = "0";
      cloneChartContainer.style.background = "transparent";
      cloneChartContainer.innerHTML = `<img src="${lightChartData}" style="width:100%; height:auto;">`;
    }
  }

  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true
    });

    const imgData = canvas.toDataURL('image/png');
    const doc = new jsPDF('p', 'mm', 'a4');
    const leftMargin = 25.4;  // 1.0" Gutter
    const rightMargin = 12.7; // 0.5" Edge
    const topMargin = 12.7;   // 0.5" Top
    const printableWidth = doc.internal.pageSize.getWidth() - leftMargin - rightMargin;
    const scaledHeight = (canvas.height * printableWidth) / canvas.width;
    const totalPages = doc.internal.getNumberOfPages();
    doc.addImage(imgData, 'PNG', leftMargin, topMargin, printableWidth, scaledHeight);
    doc.save(`${getROFFileName()}.pdf`);

  } catch (err) {
    console.error("PDF Export failed:", err);
  } finally {
    document.body.removeChild(clone);
  }
}

function getROFFileName() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');

  return `ROF-Report_${mm}-${dd}-${yyyy}_${hh}${min}`;
}

// ── Event Logic ──────────────────────────────────────────────
rofControlsHeader.addEventListener('click', () => {
  const isExpanded = rofControlsContent.classList.contains('expanded');
  rofControlsContent.classList.toggle('expanded', !isExpanded);
  rofControlsToggle.classList.toggle('expanded', !isExpanded);
});

[peakThresholdInput, minShotSpacingInput, burstGapThresholdInput, windowSizeInput, minPeakProminenceInput, minBurstCountInput]
  .forEach(input => {
    input.addEventListener('input', scheduleReanalysis);
    input.addEventListener('blur', scheduleReanalysis);
  });

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

exportPngBtn.addEventListener('click', exportROFToPNG);
exportPdfBtn.addEventListener('click', exportROFToPDF);

document.getElementById('f3ds-rof-build-details').addEventListener('input', (e) => {
  const val = e.target.value.trim();
  const container = document.getElementById('f3ds-rof-live-notes-container');
  const content = document.getElementById('f3ds-rof-live-notes-content');

  if (content) content.textContent = val;
  if (container) container.style.display = val ? 'block' : 'none';
});