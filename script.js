/**
 * South Florida School Decision Platform
 * Main Application Script
 * 
 * Modular JavaScript application for school and community decision making
 * Extracted and restructured from schools.html with enhanced error handling
 */

// Application Constants
const CONFIG = {
    DATA_URL: './data.json',
    MAP_TILE_URL: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    LEAFLET_CDN: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
    DEBOUNCE_DELAY: 300,
    MAP_CENTER: [26.0200, -80.2200],
    MAP_ZOOM: 11
};

// Global application state
let appData = null;
let appWeights = {};
let appRankings = [];
let appMap = null;
let appMapMarkers = {
    elementary: [],
    middle: [],
    community: [],
    swimming: [],
    luxury: []
};

/**
 * Main Application Class
 * Coordinates all modules and manages application lifecycle
 */
class SchoolDecisionApp {
    constructor() {
        this.initialized = false;
        this.mapInitialized = false;
    }

    /**
     * Initialize the application
     * @returns {Promise<void>}
     */
    async init() {
        try {
            console.log('Initializing School Decision App...');
            
            await this.loadData();
            this.initializeWeights();
            this.initializeUI();
            this.bindEvents();
            this.updateDisplay();
            
            this.initialized = true;
            console.log('School Decision App initialized successfully');
            
        } catch (error) {
            ErrorHandler.handle(error, 'Application initialization');
        }
    }

    /**
     * Load application data
     * @returns {Promise<void>}
     */
    async loadData() {
        try {
            appData = await DataManager.loadConfiguration();
        } catch (error) {
            ErrorHandler.handle(error, 'Data loading');
            throw error;
        }
    }

    /**
     * Initialize default weights from data
     */
    initializeWeights() {
        try {
            WeightManager.initializeWeights(appData.weights.factors);
        } catch (error) {
            ErrorHandler.handle(error, 'Weight initialization');
        }
    }

    /**
     * Initialize UI components
     */
    initializeUI() {
        try {
            UIManager.updateDashboard(appData.dashboard.metrics);
            UIManager.updateWeightSliders(appWeights);
        } catch (error) {
            ErrorHandler.handle(error, 'UI initialization');
        }
    }

    /**
     * Bind event handlers
     */
    bindEvents() {
        try {
            // Debounced weight update handler
            const debouncedUpdateWeights = UIManager.debounce(() => {
                WeightManager.updateAllWeights();
                this.updateDisplay();
            }, CONFIG.DEBOUNCE_DELAY);

            // Bind weight slider events
            appData.weights.factors.forEach(factor => {
                const slider = document.getElementById(`${factor.id}-weight`);
                if (slider) {
                    slider.addEventListener('input', debouncedUpdateWeights);
                }
            });

        } catch (error) {
            ErrorHandler.handle(error, 'Event binding');
        }
    }

    /**
     * Update all display components
     */
    updateDisplay() {
        try {
            // Update days left counter
            Utils.updateDaysLeft(appData.metadata.moveDate);
            
            // Generate new rankings
            appRankings = RankingEngine.generateRankings(appData.locations, appWeights);
            
            // Update UI
            UIManager.updateRankingCards(appRankings);
            
        } catch (error) {
            ErrorHandler.handle(error, 'Display update');
        }
    }
}

/**
 * Data Management Module
 * Handles loading, validation, and caching of application data
 */
const DataManager = {
    /**
     * Load and validate configuration data
     * @returns {Promise<Object>} Application data
     */
    async loadConfiguration() {
        try {
            console.log('Loading configuration from:', CONFIG.DATA_URL);
            
            const response = await fetch(CONFIG.DATA_URL);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!this.validateData(data)) {
                throw new Error('Invalid data structure');
            }
            
            this.cacheData(data);
            console.log('Configuration loaded successfully');
            
            return data;
            
        } catch (error) {
            console.error('Data loading failed:', error);
            
            // Attempt to use cached data as fallback
            const cachedData = this.getCachedData();
            if (cachedData) {
                console.warn('Using cached data as fallback');
                return cachedData;
            }
            
            throw new Error(`Failed to load configuration: ${error.message}`);
        }
    },

    /**
     * Validate data structure
     * @param {Object} data - Data to validate
     * @returns {boolean} True if valid
     */
    validateData(data) {
        try {
            // Check required top-level properties
            const requiredProps = ['metadata', 'locations', 'weights'];
            for (const prop of requiredProps) {
                if (!data[prop]) {
                    console.error(`Missing required property: ${prop}`);
                    return false;
                }
            }

            // Validate locations structure
            if (!data.locations || typeof data.locations !== 'object') {
                console.error('Invalid locations structure');
                return false;
            }

            // Validate each location has required properties
            for (const [key, location] of Object.entries(data.locations)) {
                if (!location.name || !location.coordinates || !location.scores) {
                    console.error(`Invalid location structure for: ${key}`);
                    return false;
                }
            }

            return true;

        } catch (error) {
            console.error('Data validation error:', error);
            return false;
        }
    },

    /**
     * Cache data for offline use
     * @param {Object} data - Data to cache
     */
    cacheData(data) {
        try {
            localStorage.setItem('schoolDecisionData', JSON.stringify({
                data: data,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.warn('Failed to cache data:', error);
        }
    },

    /**
     * Retrieve cached data
     * @returns {Object|null} Cached data or null
     */
    getCachedData() {
        try {
            const cached = localStorage.getItem('schoolDecisionData');
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                
                // Use cached data if less than 24 hours old
                const maxAge = 24 * 60 * 60 * 1000; // 24 hours
                if (Date.now() - timestamp < maxAge) {
                    return data;
                }
            }
        } catch (error) {
            console.warn('Failed to retrieve cached data:', error);
        }
        return null;
    }
};

/**
 * Weight Management Module
 * Handles weight initialization, updates, and presets
 */
const WeightManager = {
    /**
     * Initialize weights with default values
     * @param {Array} factors - Weight factors configuration
     */
    initializeWeights(factors) {
        try {
            appWeights = {};
            factors.forEach(factor => {
                appWeights[factor.id] = factor.default;
            });
            console.log('Weights initialized:', appWeights);
        } catch (error) {
            ErrorHandler.handle(error, 'Weight initialization');
        }
    },

    /**
     * Apply a preset configuration
     * @param {string} presetName - Name of preset to apply
     */
    setPreset(presetName) {
        try {
            if (!appData?.weights?.presets?.[presetName]) {
                throw new Error(`Preset not found: ${presetName}`);
            }

            const preset = appData.weights.presets[presetName];
            
            Object.keys(preset).forEach(key => {
                if (appWeights.hasOwnProperty(key)) {
                    appWeights[key] = preset[key];
                    
                    // Update UI slider
                    const slider = document.getElementById(`${key}-weight`);
                    const valueDisplay = document.getElementById(`${key}-value`);
                    
                    if (slider) slider.value = preset[key];
                    if (valueDisplay) valueDisplay.textContent = preset[key] + '%';
                }
            });

            console.log('Preset applied:', presetName, preset);
            
        } catch (error) {
            ErrorHandler.handle(error, `Applying preset: ${presetName}`);
        }
    },

    /**
     * Update individual weight value
     * @param {string} factorId - Factor ID to update
     * @param {number} value - New weight value
     */
    updateWeight(factorId, value) {
        try {
            const numValue = Utils.validateInput(value, 'number');
            if (numValue >= 0 && numValue <= 100) {
                appWeights[factorId] = numValue;
            } else {
                throw new Error(`Invalid weight value: ${value}`);
            }
        } catch (error) {
            ErrorHandler.handle(error, `Updating weight: ${factorId}`);
        }
    },

    /**
     * Update all weights from UI sliders
     */
    updateAllWeights() {
        try {
            Object.keys(appWeights).forEach(key => {
                const slider = document.getElementById(`${key}-weight`);
                const valueDisplay = document.getElementById(`${key}-value`);
                
                if (slider) {
                    const value = parseInt(slider.value);
                    appWeights[key] = value;
                    
                    if (valueDisplay) {
                        valueDisplay.textContent = value + '%';
                    }
                }
            });
        } catch (error) {
            ErrorHandler.handle(error, 'Updating all weights');
        }
    },

    /**
     * Get current weights
     * @returns {Object} Current weight values
     */
    getWeights() {
        return { ...appWeights };
    }
};

/**
 * Ranking Engine Module
 * Handles score calculation and ranking generation
 */
const RankingEngine = {
    /**
     * Calculate weighted score for a location
     * @param {Object} location - Location data
     * @param {Object} weights - Current weight values
     * @returns {number} Calculated score (0-100)
     */
    calculateScore(location, weights) {
        try {
            let totalScore = 0;
            let totalWeight = 0;
            
            Object.keys(weights).forEach(key => {
                if (location.scores && location.scores[key] !== undefined) {
                    totalScore += (location.scores[key] * weights[key]);
                    totalWeight += weights[key];
                }
            });
            
            return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
            
        } catch (error) {
            ErrorHandler.handle(error, 'Score calculation');
            return 0;
        }
    },

    /**
     * Generate rankings for all locations
     * @param {Object} locations - All location data
     * @param {Object} weights - Current weight values
     * @returns {Array} Sorted rankings array
     */
    generateRankings(locations, weights) {
        try {
            const rankings = Object.keys(locations).map(key => ({
                key: key,
                ...locations[key],
                totalScore: this.calculateScore(locations[key], weights)
            })).sort((a, b) => b.totalScore - a.totalScore);

            return rankings;
            
        } catch (error) {
            ErrorHandler.handle(error, 'Ranking generation');
            return [];
        }
    }
};

/**
 * UI Management Module
 * Handles all user interface updates and interactions
 */
const UIManager = {
    /**
     * Update dashboard metrics
     * @param {Array} metrics - Dashboard metrics data
     */
    updateDashboard(metrics) {
        try {
            metrics.forEach(metric => {
                if (metric.id) {
                    const element = document.getElementById(metric.id);
                    if (element) {
                        element.textContent = metric.value;
                    }
                }
            });
        } catch (error) {
            ErrorHandler.handle(error, 'Dashboard update');
        }
    },

    /**
     * Update ranking cards display
     * @param {Array} rankings - Sorted rankings data
     */
    updateRankingCards(rankings) {
        try {
            const rankingGrid = document.getElementById('rankingGrid');
            if (!rankingGrid) return;

            rankingGrid.innerHTML = '';

            rankings.forEach((location, index) => {
                const rankCard = this.createRankingCard(location, index + 1);
                rankingGrid.appendChild(rankCard);
            });

            // Update comparison table scores
            this.updateComparisonScores(rankings);
            
        } catch (error) {
            ErrorHandler.handle(error, 'Ranking cards update');
        }
    },

    /**
     * Create a ranking card element
     * @param {Object} location - Location data
     * @param {number} rank - Ranking position
     * @returns {HTMLElement} Ranking card element
     */
    createRankingCard(location, rank) {
        const rankCard = document.createElement('div');
        rankCard.className = 'ranking-card';
        rankCard.onclick = () => this.selectLocation(location.key);

        const tuitionInfo = this.getTuitionInfo(location);
        const schoolAssignment = this.getSchoolAssignment(location);
        const programHighlights = this.getProgramHighlights(location);

        rankCard.innerHTML = `
            <div class="rank-number">${rank}</div>
            <div class="ranking-content">
                <div class="ranking-title">${location.name}</div>
                <div class="ranking-subtitle">${location.demographics?.population || 'Community'} • ${location.safety?.crimeRate || 'Safe area'}</div>
                
                ${tuitionInfo}
                
                <div class="score-bar">
                    <div class="score-fill" style="width: ${location.totalScore}%">${location.totalScore}%</div>
                </div>
                
                <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin: 15px 0;">
                    <strong style="color: #1976d2;">📚 School Assignment for Your Children:</strong>
                    ${schoolAssignment}
                </div>
                
                <div class="score-details">
                    <div class="score-item">
                        <div class="score-item-label">Academic</div>
                        <div class="score-item-value">${location.scores?.academic || 0}%</div>
                    </div>
                    <div class="score-item">
                        <div class="score-item-label">Community</div>
                        <div class="score-item-value">${location.scores?.community || 0}%</div>
                    </div>
                    <div class="score-item">
                        <div class="score-item-label">Tuition Value</div>
                        <div class="score-item-value">${location.scores?.tuition || 0}%</div>
                    </div>
                    <div class="score-item">
                        <div class="score-item-label">Safety</div>
                        <div class="score-item-value">${location.scores?.safety || 0}%</div>
                    </div>
                </div>
                
                <div style="margin-top: 15px;">
                    <strong>Key Programs:</strong> ${programHighlights}<br>
                    <strong>Home Prices:</strong> ${location.housing?.buyRange || 'Contact for pricing'}<br>
                    <strong>Commute:</strong> ${location.details?.commute || 'Varies by destination'}
                </div>
            </div>
        `;

        return rankCard;
    },

    /**
     * Get tuition information HTML
     * @param {Object} location - Location data
     * @returns {string} HTML string for tuition info
     */
    getTuitionInfo(location) {
        if (!location.tuition) return '';

        const tuition = location.tuition;
        let badgeClass = 'badge-tuition';
        let displayText = tuition.display || 'Contact for pricing';

        if (tuition.amount === 0) {
            badgeClass = 'badge-tuition';
            displayText = 'FREE';
        } else if (tuition.amount > 50000) {
            displayText = `<span class="tuition-amount">${tuition.display}</span>`;
        }

        return `<div class="tuition-highlight"><strong>💵 Tuition:</strong> <span class="${badgeClass}">${displayText}</span></div>`;
    },

    /**
     * Get school assignment information
     * @param {Object} location - Location data
     * @returns {string} HTML string for school assignment
     */
    getSchoolAssignment(location) {
        if (!location.schools) return 'School information not available';

        const elementary = location.schools.elementary?.[0];
        const middle = location.schools.middle?.[0];

        if (elementary && middle && elementary.name === middle.name) {
            // Same school for both
            return `
                <div style="margin-top: 10px;">
                    <div style="margin-bottom: 8px;">
                        <strong>👦 Both Children:</strong> <span style="color: #e91e63;"><a href="${elementary.link || '#'}" target="_blank" class="external-link">${elementary.name}</a></span>
                    </div>
                    <div style="margin-top: 8px; padding: 8px; background-color: #d4edda; border-radius: 4px;">
                        ✅ <strong>SAME SCHOOL!</strong> One drop-off, unified schedule<br>
                        🌍 <strong>${location.county} County</strong><br>
                        💰 <strong>${location.tuition?.display || 'Contact for pricing'}</strong>
                    </div>
                </div>
            `;
        } else {
            // Different schools
            return `
                <div style="margin-top: 10px;">
                    <div style="margin-bottom: 8px;">
                        <strong>👦 9-year-old:</strong> <span style="color: #2e7d32;"><a href="${elementary?.link || '#'}" target="_blank" class="external-link">${elementary?.name || 'Elementary School'}</a></span>
                    </div>
                    <div>
                        <strong>👦 13-year-old:</strong> <span style="color: #1976d2;"><a href="${middle?.link || '#'}" target="_blank" class="external-link">${middle?.name || 'Middle School'}</a></span>
                    </div>
                    <div style="margin-top: 8px; padding: 8px; background-color: #fff3cd; border-radius: 4px;">
                        ⚠️ <strong>Two different schools, same district (${location.county})</strong>
                    </div>
                </div>
            `;
        }
    },

    /**
     * Get program highlights
     * @param {Object} location - Location data
     * @returns {string} Program highlights text
     */
    getProgramHighlights(location) {
        return location.details?.highlights || 'Various programs available';
    },

    /**
     * Update weight sliders to match current weights
     * @param {Object} weights - Current weight values
     */
    updateWeightSliders(weights) {
        try {
            Object.keys(weights).forEach(key => {
                const slider = document.getElementById(`${key}-weight`);
                const valueDisplay = document.getElementById(`${key}-value`);
                
                if (slider) slider.value = weights[key];
                if (valueDisplay) valueDisplay.textContent = weights[key] + '%';
            });
        } catch (error) {
            ErrorHandler.handle(error, 'Weight slider update');
        }
    },

    /**
     * Update comparison table scores
     * @param {Array} rankings - Current rankings
     */
    updateComparisonScores(rankings) {
        try {
            rankings.forEach(location => {
                const scoreElement = document.getElementById(`${location.key}-score`);
                if (scoreElement) {
                    scoreElement.textContent = location.totalScore + '%';
                }
            });
        } catch (error) {
            ErrorHandler.handle(error, 'Comparison scores update');
        }
    },

    /**
     * Handle section navigation
     * @param {string} sectionId - Section to show
     */
    showSection(sectionId) {
        try {
            // Remove active class from all sections and tabs
            const sections = document.querySelectorAll('.content-section');
            sections.forEach(section => section.classList.remove('active'));
            
            const tabs = document.querySelectorAll('.tab');
            tabs.forEach(tab => tab.classList.remove('active'));
            
            // Add active class to selected section and tab
            const selectedSection = document.getElementById(sectionId);
            if (selectedSection) {
                selectedSection.classList.add('active');
            }
            
            // Find and activate the corresponding tab
            const activeTab = document.querySelector(`[onclick="showSection('${sectionId}')"]`);
            if (activeTab) {
                activeTab.classList.add('active');
            }
            
            // Initialize map if map section is selected
            if (sectionId === 'map' && !appMap) {
                setTimeout(() => {
                    MapController.initializeMap();
                }, 500);
            }
            
        } catch (error) {
            ErrorHandler.handle(error, 'Section navigation');
        }
    },

    /**
     * Select a location (navigate to details)
     * @param {string} locationKey - Location key
     */
    selectLocation(locationKey) {
        this.showSection('details');
    },

    /**
     * Debounce utility function
     * @param {Function} func - Function to debounce
     * @param {number} delay - Delay in milliseconds
     * @returns {Function} Debounced function
     */
    debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }
};

/**
 * Map Controller Module
 * Handles map initialization and marker management
 */
const MapController = {
    /**
     * Initialize the interactive map
     */
    initializeMap() {
        try {
            if (typeof L === 'undefined') {
                this.handleMapError('Leaflet library not loaded');
                return;
            }

            console.log('Initializing map...');
            
            // Create map
            appMap = L.map('mapContainer').setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
            
            // Add tile layer
            L.tileLayer(CONFIG.MAP_TILE_URL, {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 18
            }).addTo(appMap);
            
            // Add markers
            this.addAllMarkers();
            
            console.log('Map initialized successfully');
            
        } catch (error) {
            ErrorHandler.handle(error, 'Map initialization');
            this.handleMapError(error.message);
        }
    },

    /**
     * Add all markers to the map
     */
    addAllMarkers() {
        try {
            if (!appData?.locations) return;

            // Add school markers
            Object.keys(appData.locations).forEach(key => {
                const location = appData.locations[key];
                
                // Add elementary schools
                if (location.schools?.elementary) {
                    location.schools.elementary.forEach(school => {
                        this.addMarker(school.coordinates, 'elementary', school.name, school.details || school.rating);
                    });
                }
                
                // Add middle schools
                if (location.schools?.middle) {
                    location.schools.middle.forEach(school => {
                        this.addMarker(school.coordinates, 'middle', school.name, school.details || school.rating);
                    });
                }
            });

            // Add community markers
            if (appData.mapData?.communityMarkers) {
                appData.mapData.communityMarkers.forEach(marker => {
                    this.addMarker(marker.coordinates, marker.type, marker.title, marker.description);
                });
            }

            // Add swimming markers
            if (appData.mapData?.swimmingMarkers) {
                appData.mapData.swimmingMarkers.forEach(marker => {
                    this.addMarker(marker.coordinates, marker.type, marker.title, marker.description);
                });
            }

            // Add luxury markers
            if (appData.mapData?.luxuryMarkers) {
                appData.mapData.luxuryMarkers.forEach(marker => {
                    this.addMarker(marker.coordinates, marker.type, marker.title, marker.description);
                });
            }

            // Add county boundary line
            this.addCountyBoundary();

        } catch (error) {
            ErrorHandler.handle(error, 'Adding map markers');
        }
    },

    /**
     * Add a marker to the map
     * @param {Array} coords - [lat, lng] coordinates
     * @param {string} type - Marker type
     * @param {string} title - Marker title
     * @param {string} description - Marker description
     */
    addMarker(coords, type, title, description) {
        try {
            const colors = {
                elementary: '#3498db',
                middle: '#9b59b6',
                community: '#e74c3c',
                swimming: '#1abc9c',
                luxury: '#f39c12'
            };

            const marker = L.circleMarker(coords, {
                radius: 12,
                fillColor: colors[type] || '#3498db',
                color: '#fff',
                weight: 3,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(appMap);

            marker.bindPopup(this.createPopup(title, description));
            
            if (appMapMarkers[type]) {
                appMapMarkers[type].push(marker);
            }

        } catch (error) {
            ErrorHandler.handle(error, 'Adding map marker');
        }
    },

    /**
     * Create popup content
     * @param {string} title - Popup title
     * @param {string} content - Popup content
     * @returns {string} HTML popup content
     */
    createPopup(title, content) {
        return `
            <div class="popup-title">${title}</div>
            <div class="popup-details">${content}</div>
        `;
    },

    /**
     * Add county boundary line
     */
    addCountyBoundary() {
        try {
            const countyBoundary = L.polyline([
                [26.0100, -80.5000],
                [26.0100, -80.1000]
            ], {
                color: 'red',
                weight: 3,
                opacity: 0.6,
                dashArray: '10, 10'
            }).addTo(appMap);

            countyBoundary.bindPopup('County Line: Broward (North) | Miami-Dade (South)<br>Different school systems!');

        } catch (error) {
            ErrorHandler.handle(error, 'Adding county boundary');
        }
    },

    /**
     * Toggle map layer visibility
     * @param {string} layerName - Layer to toggle
     */
    toggleLayer(layerName) {
        try {
            if (!appMap || !appMapMarkers[layerName]) return;

            const checkbox = document.getElementById(`filter-${layerName}`);
            const showAll = document.getElementById('filter-all');

            if (!checkbox) return;

            if (!checkbox.checked) {
                showAll.checked = false;
            }

            appMapMarkers[layerName].forEach(marker => {
                if (checkbox.checked) {
                    appMap.addLayer(marker);
                } else {
                    appMap.removeLayer(marker);
                }
            });

            // Update "Show All" checkbox
            const allChecked = ['elementary', 'middle', 'community', 'swimming', 'luxury'].every(
                type => document.getElementById(`filter-${type}`)?.checked
            );

            if (showAll) {
                showAll.checked = allChecked;
            }

        } catch (error) {
            ErrorHandler.handle(error, 'Toggling map layer');
        }
    },

    /**
     * Toggle all map layers
     * @param {boolean} visible - Whether to show all layers
     */
    toggleAllLayers(visible) {
        try {
            if (!appMap) return;

            const types = ['elementary', 'middle', 'community', 'swimming', 'luxury'];

            types.forEach(type => {
                const typeCheckbox = document.getElementById(`filter-${type}`);
                if (typeCheckbox) {
                    typeCheckbox.checked = visible;
                }

                if (appMapMarkers[type]) {
                    appMapMarkers[type].forEach(marker => {
                        if (visible) {
                            appMap.addLayer(marker);
                        } else {
                            appMap.removeLayer(marker);
                        }
                    });
                }
            });

        } catch (error) {
            ErrorHandler.handle(error, 'Toggling all map layers');
        }
    },

    /**
     * Handle map initialization errors
     * @param {string} message - Error message
     */
    handleMapError(message) {
        const mapContainer = document.getElementById('mapContainer');
        if (mapContainer) {
            mapContainer.innerHTML = `
                <div style="padding: 50px; text-align: center; background: #f8f9fa; border-radius: 10px;">
                    <h3 style="color: #e74c3c;">Map Loading Error</h3>
                    <p>The interactive map requires external libraries. Here's what you need to know about locations:</p>
                    <ul style="text-align: left; max-width: 600px; margin: 20px auto;">
                        <li><strong>Broward County:</strong> Weston, Cooper City, Davie - Same school calendar, policies, and registration</li>
                        <li><strong>Miami-Dade County:</strong> Aventura, North Miami Beach - Different calendar (may start/end on different dates), separate registration system</li>
                        <li><strong>Different Counties = Different Calendars!</strong></li>
                    </ul>
                </div>
            `;
        }
    }
};
/**
 * Error Handler Module
 * Centralized error handling and user messaging
 */
const ErrorHandler = {
    types: {
        DATA_LOAD_ERROR: 'DATA_LOAD_ERROR',
        CALCULATION_ERROR: 'CALCULATION_ERROR',
        UI_ERROR: 'UI_ERROR',
        MAP_ERROR: 'MAP_ERROR'
    },

    /**
     * Handle errors gracefully throughout the application
     * @param {Error} error - Error object
     * @param {string} context - Context where error occurred
     */
    handle(error, context) {
        console.error(`Error in ${context}:`, error);
        
        // Determine error type and show appropriate message
        let userMessage = 'An unexpected error occurred. Please try refreshing the page.';
        let messageType = 'error';
        
        if (context.includes('Data') || context.includes('loading')) {
            userMessage = 'Unable to load data. Using cached information where available.';
            messageType = 'warning';
        } else if (context.includes('Map')) {
            userMessage = 'Map features are temporarily unavailable. All other features remain functional.';
            messageType = 'info';
        } else if (context.includes('UI') || context.includes('Display')) {
            userMessage = 'Display issue detected. Some features may appear differently.';
            messageType = 'warning';
        }
        
        this.showUserMessage(userMessage, messageType);
        
        // Log to external service in production
        if (typeof gtag !== 'undefined') {
            gtag('event', 'exception', {
                description: `${context}: ${error.message}`,
                fatal: false
            });
        }
    },

    /**
     * Show user-friendly error messages
     * @param {string} message - Message to display
     * @param {string} type - Message type (error, warning, info)
     */
    showUserMessage(message, type = 'error') {
        try {
            // Create or update error message container
            let messageContainer = document.getElementById('error-message-container');
            if (!messageContainer) {
                messageContainer = document.createElement('div');
                messageContainer.id = 'error-message-container';
                messageContainer.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 10000;
                    max-width: 400px;
                `;
                document.body.appendChild(messageContainer);
            }

            const messageDiv = document.createElement('div');
            messageDiv.style.cssText = `
                padding: 12px 16px;
                margin-bottom: 10px;
                border-radius: 4px;
                color: white;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                font-size: 14px;
                line-height: 1.4;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                background-color: ${type === 'error' ? '#e74c3c' : type === 'warning' ? '#f39c12' : '#3498db'};
            `;
            
            messageDiv.textContent = message;
            messageContainer.appendChild(messageDiv);

            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 5000);

        } catch (displayError) {
            console.error('Failed to show user message:', displayError);
        }
    }
};

/**
 * Utility Functions Module
 * Common utility functions used throughout the application
 */
const Utils = {
    /**
     * Format currency for display
     * @param {number} amount - Amount to format
     * @returns {string} Formatted currency string
     */
    formatCurrency(amount) {
        try {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(amount);
        } catch (error) {
            return `$${amount.toLocaleString()}`;
        }
    },

    /**
     * Calculate days until move date
     * @param {string} moveDate - Move date string
     */
    updateDaysLeft(moveDate) {
        try {
            const targetDate = new Date(moveDate);
            const today = new Date();
            const daysLeft = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
            
            const element = document.getElementById('daysLeft');
            if (element) {
                element.textContent = Math.max(0, daysLeft);
            }
        } catch (error) {
            ErrorHandler.handle(error, 'Days calculation');
        }
    },

    /**
     * Validate input values
     * @param {*} value - Value to validate
     * @param {string} type - Expected type
     * @returns {*} Validated value
     */
    validateInput(value, type) {
        switch (type) {
            case 'number':
                const num = parseFloat(value);
                if (isNaN(num)) {
                    throw new Error(`Invalid number: ${value}`);
                }
                return num;
            case 'string':
                return String(value);
            case 'boolean':
                return Boolean(value);
            default:
                return value;
        }
    },

    /**
     * Debounce utility function
     * @param {Function} func - Function to debounce
     * @param {number} delay - Delay in milliseconds
     * @returns {Function} Debounced function
     */
    debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }
};

// Global Functions (for backward compatibility with HTML event handlers)

/**
 * Update weights (called from UI)
 */
function updateWeights() {
    if (window.schoolApp && window.schoolApp.initialized) {
        WeightManager.updateAllWeights();
        window.schoolApp.updateDisplay();
    }
}

/**
 * Set preset configuration (called from UI)
 * @param {string} preset - Preset name
 */
function setPreset(preset) {
    if (window.schoolApp && window.schoolApp.initialized) {
        WeightManager.setPreset(preset);
        window.schoolApp.updateDisplay();
    }
}

/**
 * Show section (called from UI)
 * @param {string} sectionId - Section to show
 */
function showSection(sectionId) {
    UIManager.showSection(sectionId);
}

/**
 * Toggle map layer (called from UI)
 * @param {string} layerName - Layer to toggle
 */
function toggleMapLayer(layerName) {
    MapController.toggleLayer(layerName);
}

/**
 * Toggle all map layers (called from UI)
 * @param {HTMLInputElement} checkbox - Checkbox element
 */
function toggleAllLayers(checkbox) {
    MapController.toggleAllLayers(checkbox.checked);
}

// Application Initialization

/**
 * Initialize the application when DOM is ready
 */
document.addEventListener('DOMContentLoaded', async function() {
    try {
        console.log('DOM loaded, initializing School Decision App...');
        
        // Create and initialize the main application
        window.schoolApp = new SchoolDecisionApp();
        await window.schoolApp.init();
        
        console.log('School Decision App ready!');
        
    } catch (error) {
        ErrorHandler.handle(error, 'Application startup');
        
        // Show fallback message
        const container = document.querySelector('.container');
        if (container) {
            const fallbackMessage = document.createElement('div');
            fallbackMessage.style.cssText = `
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
                color: #856404;
            `;
            fallbackMessage.innerHTML = `
                <h3>⚠️ Data Loading Issue</h3>
                <p>We're having trouble loading the latest data. The application may not function fully until this is resolved.</p>
                <p>Please try refreshing the page, or contact support if the problem persists.</p>
            `;
            container.insertBefore(fallbackMessage, container.firstChild);
        }
    }
});

// Export modules for testing (if in module environment)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SchoolDecisionApp,
        DataManager,
        WeightManager,
        RankingEngine,
        UIManager,
        MapController,
        ErrorHandler,
        Utils
    };
}
        