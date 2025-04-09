import { LightningElement, api, track } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
import { getStaticResource } from 'lightning/platformResourceApi';

const LEAFLET_CSS_URL = '/leaflet.css';
const LEAFLET_JS_URL = '/leaflet.js';
const LEAFLETADDON_JS_URL = '/leafletjs_marker_rotate_addon.js';
const SHPFILE_JS_URL = '/leaflet.shpfile.js';
const SHP_JS_URL = '/shp.js';
const CATILINE_JS_URL = '/catiline.js';
const MIN_ZOOM = 2;
const FIT_BOUNDS_PADDING = [20, 20];
const MAP_CONTAINER = 'div.inner-map-container';
const CUSTOM_EVENT_INIT = 'init';

export default class MapOfThingsMap extends LightningElement {
    map;
    _markers = [];
    leafletResourcesLoaded = false;
    mapInitialized = false;
    geoJsonLayer;
    labelLayer;
    @track resourceLoading = false;

    @api tileServerUrl;
    @api tileServerAttribution;
    @api mapSizeY;
    @api mapDefaultPosition;
    @api mapDefaultZoomLevel;
    @api autoFitBounds;
    
    // New shapefile configuration properties
    @api shapefileResourceName = 'schooldistricts'; // Default
    @api shapefilePolygonColor = '#3388ff'; // Default blue
    @api shapefileRandomColors = false;
    @api shapefileOpacity = 0.5;
    @api shapefileWeight = 1;

    @api
    get markers() {
        return this._markers;
    }
    set markers(newMarkers) {
        if (newMarkers && newMarkers.length >= 0) {
            this._markers = [...newMarkers];
            if (this.geoJsonLayer && this.leafletResourcesLoaded && this.mapInitialized) {
                this.filterPolygons();
            }
        }
    }

    get markersExist() {
        return this._markers && this._markers.length > 0;
    }

    connectedCallback() {
        // Firefox-specific handling
        if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
            this.template.addEventListener('click', this.handlePointerEvent.bind(this));
        } else {
            this.template.addEventListener('pointerdown', this.handlePointerEvent.bind(this));
            this.template.addEventListener('pointermove', this.handlePointerEvent.bind(this));
            this.template.addEventListener('pointerup', this.handlePointerEvent.bind(this));
        }
        
        this.loadLeafletResources();
    }

    renderedCallback() {
        if (this.template.querySelector(MAP_CONTAINER)) {
            this.template.querySelector(MAP_CONTAINER).style.height = this.mapSizeY;
        }
    }

    async loadLeafletResources() {
        try {
            await Promise.all([
                loadStyle(this, LEAFLET_JS + LEAFLET_CSS_URL),
                loadScript(this, LEAFLET_JS + LEAFLET_JS_URL),
                loadScript(this, LEAFLET_JS + LEAFLETADDON_JS_URL),
                loadScript(this, LEAFLET_JS + CATILINE_JS_URL),
                loadScript(this, LEAFLET_JS + SHP_JS_URL),
                loadScript(this, LEAFLET_JS + SHPFILE_JS_URL)
            ]).then(() => {
                this.leafletResourcesLoaded = true;
                this.drawMap();
            }).catch(error => {
                console.error('Error loading external libraries:', error);
                this.showErrorToast('Error loading external libraries: ' + error.message);
            });

        } catch (error) {
            console.error('Error loading external libraries:', error);
            this.showErrorToast('Error loading external libraries: ' + error.message);
        }
    }

    handlePointerEvent(event) {
        // Skip processing if the map isn't ready or it's not a mouse event in Firefox
        if (!this.map || (navigator.userAgent.toLowerCase().indexOf('firefox') > -1 && event.pointerType !== 'mouse')) {
            return;
        }
        if (this.map && event.pointerType === 'mouse') {
            // Handle all pointer events
        }
    }

    async drawMap() {
        if (!this.leafletResourcesLoaded) {
            console.warn('Leaflet resources not yet loaded.');
            return;
        }
        const container = this.template.querySelector(MAP_CONTAINER);
        if (!container) {
            console.error('Map container not found');
            return;
        }
        
        this.map = L.map(container, { 
            zoomControl: true,
            tap: false
        }).setView(this.mapDefaultPosition, this.mapDefaultZoomLevel);

        // Create a new pane for labels having a high z-index and disable pointer events so that markers are clickable.
        this.map.createPane('labelsPane');
        const labelsPane = this.map.getPane('labelsPane');
        labelsPane.style.zIndex = 650;
        labelsPane.style.pointerEvents = 'none';

        L.tileLayer(this.tileServerUrl, {
            minZoom: MIN_ZOOM,
            attribution: this.tileServerAttribution,
            unloadInvisibleTiles: true
        }).addTo(this.map);

        // Create a dedicated label layer on the labels pane.
        this.labelLayer = L.layerGroup([], { pane: 'labelsPane' }).addTo(this.map);

        await this.renderShapefile();

        this.dispatchEvent(new CustomEvent(CUSTOM_EVENT_INIT, { detail: this.map }));
        this.mapInitialized = true;
    }

    async renderShapefile() {
        try {
            if (this.resourceLoading) return;
            this.resourceLoading = true;
            
            // Use dynamic import to get the shapefile resource
            let shpfile;
            try {
                const resourceInfo = await getStaticResource(this.shapefileResourceName);
                shpfile = resourceInfo.url;
            } catch (error) {
                console.error('Error loading shapefile resource:', error);
                this.showErrorToast(`Error loading shapefile resource ${this.shapefileResourceName}: ${error.message}`);
                this.resourceLoading = false;
                return;
            }

            const response = await fetch(shpfile);
            if (!response.ok) {
                throw new Error(`Failed to fetch shapefile: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const geojson = await shp(arrayBuffer);

            // Generate a color function based on configuration
            const getColor = this.getColorFunction();

            // Add the GeoJSON layer with all polygons hidden initially.
            this.geoJsonLayer = L.geoJSON(geojson, {
                style: (feature) => {
                    return {
                        color: getColor(feature),
                        weight: this.shapefileWeight,
                        opacity: 0, // Start hidden
                        fillOpacity: 0, // Start hidden
                        pointerEvents: 'none'
                    };
                },
                onEachFeature: (feature, layer) => {
                    if (feature.properties) {
                        const popupContent = this.generatePopupContent(feature.properties);
                        const popupElement = document.createElement('div');
                        popupElement.innerHTML = popupContent;
                        layer.bindPopup(popupElement, { maxHeight: 200 });

                        // Compute the polygon's bounds center.
                        const boundsCenter = layer.getBounds().getCenter();
                        let labelLatLng = boundsCenter;

                        // Find markers that lie inside this polygon.
                        let insideMarkers = [];
                        if (this._markers && this._markers.length > 0) {
                            this._markers.forEach(m => {
                                const pt = L.latLng(m
