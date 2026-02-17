<div id="f3ds-rof-app" class="f3ds-rof-container">

    <!-- Drop Zone -->
    <div class="f3ds-rof-dropzone" id="f3ds-rof-dropzone">
        <div class="f3ds-rof-dropzone-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="12" y1="18" x2="12" y2="12"></line>
                <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
        </div>
        <div class="f3ds-rof-dropzone-text">Drop a media file here or click to browse</div>
        <div class="f3ds-rof-dropzone-subtext">Supports video and audio files</div>
    </div>
    <input type="file" id="f3ds-rof-file-input" accept="video/*,audio/*" style="display:none;">

    <!-- Analysis Settings -->
    <div class="f3ds-rof-controls" id="f3ds-rof-controls">
        <div class="f3ds-rof-controls-header" id="f3ds-rof-controls-header" style="justify-content: center;">
            <h3>Analysis Settings</h3>
            <span class="f3ds-rof-controls-toggle" id="f3ds-rof-controls-toggle"
                style="position: absolute; right: 25px;">&#9660;</span>
        </div>
        <div class="f3ds-rof-controls-content" id="f3ds-rof-controls-content">
            <div class="f3ds-rof-controls-inner">
                <div class="f3ds-rof-control-group">
                    <label for="f3ds-rof-peak-threshold">Peak Threshold <span class="f3ds-tooltip-icon">?<span
                                class="f3ds-tooltip-content">Standard deviations above mean level.<br>Lower = more
                                sensitive.</span></span></label>
                    <input type="number" id="f3ds-rof-peak-threshold" value="1.2" step="0.1" min="0.1" max="5">
                </div>
                <div class="f3ds-rof-control-group">
                    <label for="f3ds-rof-min-shot-spacing">Min Shot Spacing (s) <span class="f3ds-tooltip-icon">?<span
                                class="f3ds-tooltip-content">Minimum time between shots.<br>0.05s = max ~1200
                                RPM.</span></span></label>
                    <input type="number" id="f3ds-rof-min-shot-spacing" value="0.05" step="0.01" min="0.01" max="1">
                </div>
                <div class="f3ds-rof-control-group">
                    <label for="f3ds-rof-burst-gap">Burst Gap Threshold (s) <span class="f3ds-tooltip-icon">?<span
                                class="f3ds-tooltip-content">Max gap allowed within a single
                                burst.</span></span></label>
                    <input type="number" id="f3ds-rof-burst-gap" value="0.2" step="0.05" min="0.05" max="2">
                </div>
                <div class="f3ds-rof-control-group">
                    <label for="f3ds-rof-window-size">Window Size (s) <span class="f3ds-tooltip-icon">?<span
                                class="f3ds-tooltip-content">Envelope smoothing window.<br>Smaller preserves
                                transients.</span></span></label>
                    <input type="number" id="f3ds-rof-window-size" value="0.002" step="0.001" min="0.001" max="0.01">
                </div>
                <div class="f3ds-rof-control-group">
                    <label for="f3ds-rof-min-prominence">Min Peak Prominence <span class="f3ds-tooltip-icon">?<span
                                class="f3ds-tooltip-content">Relative height required for a peak.<br>Higher = sharper
                                peaks
                                only.</span></span></label>
                    <input type="number" id="f3ds-rof-min-prominence" value="0.1" step="0.01" min="0.01" max="1">
                </div>
                <div class="f3ds-rof-control-group">
                    <label for="f3ds-rof-min-burst-count">Min Burst Count <span class="f3ds-tooltip-icon">?<span
                                class="f3ds-tooltip-content">Minimum shots required to count as a
                                burst.</span></span></label>
                    <input type="number" id="f3ds-rof-min-burst-count" value="5" step="1" min="1" max="50">
                </div>
            </div>
        </div>
    </div>

    <!-- Build Details -->
    <div class="f3ds-input-group" style="margin-bottom: 2rem;">
        <label for="f3ds-rof-build-details">Build Notes:</label>
        <textarea id="f3ds-rof-build-details" class="f3ds-input" rows="1"
            placeholder="Enter firearm details (e.g. 11.5&quot; Carbine, H2 Buffer)..."></textarea>
    </div>

    <!-- Loading Spinner -->
    <div class="f3ds-rof-loading" id="f3ds-rof-loading">
        <div class="f3ds-rof-spinner"></div>
        <div id="f3ds-rof-loading-text">Loading FFmpeg&hellip;</div>
    </div>

    <!-- Error -->
    <div class="f3ds-rof-error" id="f3ds-rof-error"></div>

    <!-- Results -->
    <div class="f3ds-rof-results" id="f3ds-rof-results">

        <div class="f3ds-rof-summary" id="f3ds-rof-summary"></div>

        <div class="f3ds-rof-visualization">
            <h3 style="text-align: center;">Rate of Fire Analysis</h3>
            <div id="f3ds-rof-chart"></div>
        </div>

        <div class="f3ds-rof-bursts" id="f3ds-rof-bursts"></div>

        <!-- Export Buttons (Moved here) -->
        <div class="f3ds-rof-download-buttons">
            <button class="f3ds-rof-download-btn" id="f3ds-rof-export-jpg">Export Report (PNG)</button>
            <button class="f3ds-rof-download-btn" id="f3ds-rof-export-pdf">Export Report (PDF)</button>
        </div>

    </div>

</div>