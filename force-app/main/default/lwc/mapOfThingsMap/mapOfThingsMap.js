import { LightningElement, api, track } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletjs';
import SCHOOLDISTRICTS_ZIP from '@salesforce/resourceUrl/schooldistricts'; // Example static resource
import { resolveStaticResourceUrl } from './utils'; // Utility to resolve URLs dynamically

const LEAFLET_CSS_URL = '/leaflet.css';
const LEAFLET_JS_URL = '/leaflet.js';
const MIN_ZOOM = 2;
const FIT_BOUNDS_PADDING = [20, 20];
const MAP_CONTAINER = 'div.inner-map-container';
const CUSTOM_EVENT_INIT = 'init';

export default class MapOfThingsMap extends LightningElement {
    map;
    geoJsonLayer;
    leafletResourcesLoaded = false;
    mapInitialized = false;

    @track shapefileColor = ''; // Shapefile color
    @track shapefileResourceName = ''; // Static resource name for shapefile

    @api tileServerUrl;
    @api tileServerAttribution;
    @api mapSizeY;
    @api mapDefaultPosition;
    @api mapDefaultZoomLevel;
    @api autoFitBounds;

    connectedCallback() {
        this.loadLeafletResources();
    }

    renderedCallback() {
        const container = this.template.querySelector(MAP_CONTAINER);
        if (container) {
            container.style.height = this.mapSizeY;
        }
    }

    // Load all required Leaflet resources
    async loadLeafletResources() {
        try {
            await Promise.all([
                loadStyle(this, LEAFLET_JS + LEAFLET_CSS_URL),
                loadScript(this, LEAFLET_JS + LEAFLET_JS_URL)
            ]);

            this.leafletResourcesLoaded = true;
            this.drawMap();
        } catch (error) {
            console.error('Error loading Leaflet libraries:', error);
            this.showErrorToast('Error loading Leaflet libraries: ' + error.message);
        }
    }

    async drawMap() {
        if (!this.leafletResourcesLoaded) {
            console.warn('Leaflet resources not yet loaded.');
            return;
        }

        // Initialize map
        const container = this.template.querySelector(MAP_CONTAINER);
        this.map = L.map(container, {
            zoomControl: true,
            tap: false
        }).setView(this.mapDefaultPosition, this.mapDefaultZoomLevel);

        L.tileLayer(this.tileServerUrl, {
            minZoom: MIN_ZOOM,
            attribution: this.tileServerAttribution,
            unloadInvisibleTiles: true
        }).addTo(this.map);

        // Render shapefile
        await this.renderShapefile();

        this.dispatchEvent(new CustomEvent(CUSTOM_EVENT_INIT, { detail: this.map }));
        this.mapInitialized = true;
    }

    async renderShapefile() {
        if (!this.shapefileResourceName) {
            console.warn('No shapefile resource name provided.');
            return;
        }

        try {
            // Resolve the shapefile URL dynamically
            const shapefileUrl = resolveStaticResourceUrl(this.shapefileResourceName);

            const response = await fetch(shapefileUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch shapefile: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const geojson = await shp(arrayBuffer);

            // Generate random color if no color is provided
            const randomColor = () => `#${Math.floor(Math.random() * 16777215).toString(16)}`;
            const color = this.shapefileColor || randomColor();

            this.geoJsonLayer = L.geoJSON(geojson, {
                style: () => ({
                    color,
                    opacity: 1,
                    fillOpacity: 0.5
                }),
                onEachFeature: (feature, layer) => {
                    if (feature.properties) {
                        layer.bindPopup(this.generatePopupContent(feature.properties));
                    }
                }
            }).addTo(this.map);

            // Auto-fit bounds if enabled
            if (this.autoFitBounds) {
                const bounds = this.geoJsonLayer.getBounds();
                if (bounds.isValid()) {
                    this.map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING });
                }
            }
        } catch (error) {
            console.error('Error loading or parsing shapefile:', error);
            this.showErrorToast(`Error loading shapefile: ${error.message}`);
        }
    }

    generatePopupContent(properties) {
        let content = '';
        for (const [key, value] of Object.entries(properties)) {
            content += `<div>${key}: ${value}</div>`;
        }
        return content;
    }

    showErrorToast(message) {
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Error',
                message,
                variant: 'error',
                mode: 'sticky'
            })
        );
    }

    @api
    updateShapefile(resourceName, color) {
        this.shapefileResourceName = resourceName;
        this.shapefileColor = color;
        if (this.geoJsonLayer) {
            this.map.removeLayer(this.geoJsonLayer);
        }
        this.renderShapefile();
    }
}
